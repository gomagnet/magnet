package server

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
)

func validateStatusCheck(c *statusCheckConfig) error {
	if c.Kind != "http" && c.Kind != "minecraft" && c.Kind != "custom" {
		return errors.New("choose HTTP, Minecraft Java, or custom HTTP")
	}
	if c.Kind == "minecraft" {
		host, port, err := minecraftTarget(c.Target)
		if err != nil || host == "" || len(host) > 255 || strings.ContainsAny(host, " \t\r\n/\\") || port < 1 || port > 65535 {
			return errors.New("Minecraft target must be a hostname or host:port (Java edition)")
		}
		return nil
	}
	u, err := url.Parse(c.Target)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Fragment != "" || len(c.Target) > 2000 {
		return errors.New("target must be an HTTP(S) URL without user information or fragment")
	}
	if c.Method == "" {
		c.Method = "GET"
	}
	if !strings.Contains("|GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|", "|"+c.Method+"|") || len(c.Body) > 65536 || len(c.Headers) > 30 || len(c.Value) > 16384 || len(c.JSONPath) > 512 {
		return errors.New("invalid method or request too large")
	}
	for key, value := range c.Headers {
		if key == "" || len(key) > 100 || len(value) > 4000 || strings.ContainsAny(key+value, "\r\n") || strings.EqualFold(key, "Host") || strings.EqualFold(key, "Content-Length") || strings.EqualFold(key, "Transfer-Encoding") {
			return errors.New("invalid request header")
		}
		for _, r := range key {
			if !strings.ContainsRune("!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", r) {
				return errors.New("invalid header name")
			}
		}
	}
	if c.ExpectedStatus != 0 && (c.ExpectedStatus < 100 || c.ExpectedStatus > 599) {
		return errors.New("expected status must be 100–599, or 0 for any 2xx")
	}
	if c.Match != "" && c.Match != "equal" && c.Match != "not_equal" && c.Match != "contains" && c.Match != "not_contains" && c.Match != "starts_with" && c.Match != "ends_with" {
		return errors.New("unknown response matcher")
	}
	if c.JSONPath != "" && (!strings.HasPrefix(c.JSONPath, "/") || c.Match == "") {
		return errors.New("JSON pointer must start with / and requires a response matcher")
	}
	if c.Kind == "http" && (c.Method != "GET" || len(c.Headers) > 0 || c.Body != "" || c.Match != "" || c.JSONPath != "") {
		return errors.New("use custom HTTP for request headers, body or response validation")
	}
	return nil
}

// Eight workers bound sockets and database pressure. Claims are persisted so
// overlapping server processes do not run the same scheduled check together.
func (a *app) statusLoop(ctx context.Context) {
	var workers sync.WaitGroup
	for range 8 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			timer := time.NewTicker(time.Second)
			defer timer.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-timer.C:
					if err := a.runDueStatusCheck(ctx); err != nil && ctx.Err() == nil {
						log.Printf("status check persistence: %v", err)
					}
				}
			}
		}()
	}
	cleanup := time.NewTicker(time.Hour)
	defer cleanup.Stop()
	maintenance := time.NewTicker(5 * time.Second)
	defer maintenance.Stop()
	for {
		select {
		case <-ctx.Done():
			workers.Wait()
			return
		case <-maintenance.C:
			if err := a.advanceStatusMaintenances(ctx); err != nil && ctx.Err() == nil {
				log.Printf("status maintenance: %v", err)
			}
		case <-cleanup.C:
			for _, rule := range []struct{ resolution, days int64 }{{300, 7}, {86400, 90}} {
				if _, err := a.db.ExecContext(ctx, "DELETE FROM status_buckets WHERE resolution=? AND bucket<?", rule.resolution, (time.Now().Unix()/86400-rule.days)*86400); err != nil {
					log.Printf("status retention: %v", err)
				}
			}
		}
	}
}
func (a *app) runDueStatusCheck(ctx context.Context) error {
	now := time.Now().Unix()
	var s statusCheck
	// A lease exceeds the hard request deadline. A crash retries after expiry.
	lease := now + 30
	var result sql.Result
	var err error
	for attempt := 0; attempt < 8; attempt++ {
		err = a.db.GetContext(ctx, &s, "SELECT * FROM status_checks WHERE enabled=1 AND next_check<=? ORDER BY next_check,id LIMIT 1", now)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		result, err = a.db.ExecContext(ctx, "UPDATE status_checks SET next_check=? WHERE id=? AND next_check=? AND enabled=1 AND config=?", lease, s.ID, s.Next, s.Raw)
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		if count == 1 {
			break
		}
		if attempt == 7 {
			return nil
		}
	}
	var cfg statusCheckConfig
	err = a.unprotect("status-check:"+s.ID, s.Raw, &cfg)
	if err != nil {
		return errors.New("cannot decrypt monitoring service configuration")
	}
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	started := time.Now()
	err = executeStatusCheck(checkCtx, cfg)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	state := "operational"
	failure := 0
	if err != nil {
		state = "outage"
		failure = 1
	}
	latency := time.Since(started).Milliseconds()
	checked := time.Now().Unix()
	tx, err := a.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err = tx.ExecContext(ctx, "UPDATE status_checks SET state=?,latency_ms=?,checked=?,next_check=? WHERE id=? AND config=? AND next_check=? AND enabled=1", state, latency, checked, checked+int64(s.Interval), s.ID, s.Raw, lease)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return nil
	}
	for _, resolution := range []int64{300, 86400} {
		_, err = tx.ExecContext(ctx, "INSERT INTO status_buckets(service_id,resolution,bucket,checks,failures,latency_ms) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE checks=checks+1,failures=failures+VALUES(failures),latency_ms=latency_ms+VALUES(latency_ms)", s.ID, resolution, checked/resolution*resolution, 1, failure, latency)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

var statusHTTPTransport = &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 8 * time.Second, MaxIdleConns: 32, MaxIdleConnsPerHost: 2, IdleConnTimeout: 60 * time.Second}

func executeStatusCheck(ctx context.Context, c statusCheckConfig) error {
	if c.Kind == "minecraft" {
		return minecraftStatus(ctx, c.Target)
	}
	req, err := http.NewRequestWithContext(ctx, c.Method, c.Target, strings.NewReader(c.Body))
	if err != nil {
		return err
	}
	for k, v := range c.Headers {
		req.Header.Set(k, v)
	}
	client := http.Client{Transport: statusHTTPTransport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if (c.ExpectedStatus == 0 && (resp.StatusCode < 200 || resp.StatusCode > 299)) || (c.ExpectedStatus != 0 && c.ExpectedStatus != resp.StatusCode) {
		return errors.New("unexpected HTTP status")
	}
	if c.Match == "" {
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil {
		return err
	}
	if len(body) > 1<<20 {
		return errors.New("response exceeds 1 MiB")
	}
	actual := string(body)
	if c.JSONPath != "" {
		var value any
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		if decoder.Decode(&value) != nil {
			return errors.New("invalid JSON response")
		}
		if decoder.Decode(new(any)) != io.EOF {
			return errors.New("trailing JSON response")
		}
		// RFC 6901 JSON Pointer: supports nested objects, arrays and escaped keys.
		if !strings.HasPrefix(c.JSONPath, "/") {
			return errors.New("JSON path must be an RFC 6901 pointer starting with /")
		}
		for _, part := range strings.Split(c.JSONPath[1:], "/") {
			part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
			switch v := value.(type) {
			case map[string]any:
				var exists bool
				value, exists = v[part]
				if !exists {
					return errors.New("JSON property missing")
				}
			case []any:
				n, e := strconv.Atoi(part)
				if e != nil || n < 0 || n >= len(v) {
					return errors.New("JSON index missing")
				}
				value = v[n]
			default:
				return errors.New("JSON path does not exist")
			}
		}
		if text, ok := value.(string); ok {
			actual = text
		} else {
			b, e := json.Marshal(value)
			if e != nil {
				return e
			}
			actual = string(b)
		}
	}
	matched := false
	switch c.Match {
	case "equal":
		matched = actual == c.Value
	case "not_equal":
		matched = actual != c.Value
	case "contains":
		matched = strings.Contains(actual, c.Value)
	case "not_contains":
		matched = !strings.Contains(actual, c.Value)
	case "starts_with":
		matched = strings.HasPrefix(actual, c.Value)
	case "ends_with":
		matched = strings.HasSuffix(actual, c.Value)
	}
	if !matched {
		return errors.New("response validation failed")
	}
	return nil
}

func writeStatusVarInt(b *bytes.Buffer, n int32) {
	u := uint32(n)
	for {
		v := byte(u & 127)
		u >>= 7
		if u != 0 {
			v |= 128
		}
		b.WriteByte(v)
		if u == 0 {
			return
		}
	}
}
func readStatusVarInt(r io.ByteReader) (int, error) {
	var n uint32
	for i := 0; i < 5; i++ {
		b, err := r.ReadByte()
		if err != nil {
			return 0, err
		}
		n |= uint32(b&127) << uint(7*i)
		if b&128 == 0 {
			if n > 1<<21 {
				return 0, errors.New("Minecraft packet too large")
			}
			return int(n), nil
		}
	}
	return 0, errors.New("invalid Minecraft VarInt")
}
func minecraftTarget(target string) (string, int, error) {
	if host, rawPort, err := net.SplitHostPort(target); err == nil {
		port, parseErr := strconv.Atoi(rawPort)
		if parseErr != nil {
			return "", 0, parseErr
		}
		return host, port, nil
	}
	if target == "" || strings.Contains(target, ":") || strings.ContainsAny(target, "[]") {
		return "", 0, errors.New("invalid Minecraft address")
	}
	return target, 25565, nil
}

func minecraftStatus(ctx context.Context, target string) error {
	host, port, err := minecraftTarget(target)
	if err != nil {
		return err
	}
	dialHost, dialPort := host, port
	// Match Minecraft's Java client: use _minecraft._tcp SRV records on the
	// default port while keeping the user's hostname in the status handshake.
	if port == 25565 && net.ParseIP(host) == nil {
		if _, records, lookupErr := net.DefaultResolver.LookupSRV(ctx, "minecraft", "tcp", strings.TrimSuffix(host, ".")); lookupErr == nil && len(records) != 0 {
			best := records[0]
			for _, record := range records[1:] {
				if record.Priority < best.Priority {
					best = record
				}
			}
			dialHost = strings.TrimSuffix(best.Target, ".")
			dialPort = int(best.Port)
		}
	}
	err = minecraftStatusProtocol(ctx, host, dialHost, dialPort, uint16(dialPort))
	if err == nil || ctx.Err() != nil {
		return err
	}
	// Java servers before 1.7 use the legacy 0xFE status handshake.
	if legacyErr := minecraftLegacyStatus(ctx, dialHost, dialPort); legacyErr == nil {
		return nil
	}
	return err
}

func minecraftDial(ctx context.Context, host string, port int) (net.Conn, error) {
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return nil, err
	}
	deadline, _ := ctx.Deadline()
	if err = conn.SetDeadline(deadline); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

func minecraftStatusProtocol(ctx context.Context, handshakeHost, dialHost string, dialPort int, handshakePort uint16) error {
	// -1 is the conventional server-list ping version, but some proxies reject
	// unknown versions before entering status state. Retry known protocol
	// generations so those servers still answer without a version negotiation.
	var lastErr error
	for _, version := range []int32{-1, 777, 772, 767, 765, 754, 47} {
		lastErr = minecraftStatusAttempt(ctx, handshakeHost, dialHost, dialPort, handshakePort, version)
		if lastErr == nil || ctx.Err() != nil {
			return lastErr
		}
	}
	return lastErr
}

func minecraftStatusAttempt(ctx context.Context, handshakeHost, dialHost string, dialPort int, handshakePort uint16, protocolVersion int32) error {
	conn, err := minecraftDial(ctx, dialHost, dialPort)
	if err != nil {
		return err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	var handshake bytes.Buffer
	writeStatusVarInt(&handshake, 0)
	writeStatusVarInt(&handshake, protocolVersion)
	writeStatusVarInt(&handshake, int32(len(handshakeHost)))
	handshake.WriteString(handshakeHost)
	_ = binary.Write(&handshake, binary.BigEndian, handshakePort)
	writeStatusVarInt(&handshake, 1)
	var packet bytes.Buffer
	writeStatusVarInt(&packet, int32(handshake.Len()))
	packet.Write(handshake.Bytes())
	packet.Write([]byte{1, 0})
	if _, err = io.Copy(conn, &packet); err != nil {
		return err
	}
	r := bufio.NewReader(conn)
	length, err := readStatusVarInt(r)
	if err != nil || length < 3 || length > 1<<20 {
		return errors.New("invalid Minecraft status packet")
	}
	data := make([]byte, length)
	if _, err = io.ReadFull(r, data); err != nil {
		return err
	}
	p := bytes.NewReader(data)
	id, err := readStatusVarInt(p)
	if err != nil || id != 0 {
		return errors.New("invalid Minecraft response ID")
	}
	size, err := readStatusVarInt(p)
	if err != nil || size != p.Len() {
		return errors.New("invalid Minecraft JSON size")
	}
	text := make([]byte, size)
	if _, err = io.ReadFull(p, text); err != nil {
		return err
	}
	var status struct {
		Version *struct {
			Name     string `json:"name"`
			Protocol int    `json:"protocol"`
		} `json:"version"`
	}
	if json.Unmarshal(text, &status) != nil || status.Version == nil || status.Version.Name == "" {
		return errors.New("invalid Minecraft Java status")
	}
	return nil
}

func minecraftLegacyStatus(ctx context.Context, host string, port int) error {
	conn, err := minecraftDial(ctx, host, port)
	if err != nil {
		return err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	if _, err = conn.Write([]byte{0xfe, 0x01}); err != nil {
		return err
	}
	var header [3]byte
	if _, err = io.ReadFull(conn, header[:]); err != nil {
		return err
	}
	if header[0] != 0xff {
		return errors.New("invalid legacy Minecraft status response")
	}
	length := int(binary.BigEndian.Uint16(header[1:]))
	if length < 5 || length > 4096 {
		return errors.New("invalid legacy Minecraft status length")
	}
	payload := make([]byte, length*2)
	if _, err = io.ReadFull(conn, payload); err != nil {
		return err
	}
	text := string(utf16.Decode(func() []uint16 {
		units := make([]uint16, length)
		for i := range units {
			units[i] = binary.BigEndian.Uint16(payload[i*2:])
		}
		return units
	}()))
	if !strings.HasPrefix(text, "§1\x00") || len(strings.Split(text, "\x00")) < 6 {
		return errors.New("invalid legacy Minecraft status payload")
	}
	return nil
}
