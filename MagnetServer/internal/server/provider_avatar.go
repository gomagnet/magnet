package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

// Fetch a fresh, bounded avatar without OAuth credentials. External image hosts
// must resolve to public addresses; an explicitly configured issuer may be local.
func downloadProviderAvatar(ctx context.Context, picture, issuer string) string {
	picture = providerPicture(picture)
	if picture == "" {
		return ""
	}
	issuerURL, err := url.Parse(issuer)
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	transport := &http.Transport{TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 3 * time.Second}
	defer transport.CloseIdleConnections()
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		trusted := host == issuerURL.Hostname() && port == issuerURL.Port()
		if issuerURL.Port() == "" {
			trusted = host == issuerURL.Hostname() && port == "443"
		}
		dialer := net.Dialer{Timeout: 3 * time.Second}
		for _, address := range addresses {
			ip := address.IP
			if !trusted && (!ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()) {
				continue
			}
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
		}
		return nil, errors.New("avatar host unavailable")
	}
	client := &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 || providerPicture(req.URL.String()) == "" {
			return errors.New("invalid avatar redirect")
		}
		return nil
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, picture, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Cache-Control", "no-cache")
	response, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ""
	}
	source, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(source) > 1<<20 {
		return ""
	}
	if len(source) <= 262144 {
		svg := "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(source)
		if validateImage(svg) == nil {
			return svg
		}
	}
	// Providers may return JPEG/GIF even though manual uploads use PNG or SVG.
	cfg, _, err := image.DecodeConfig(bytes.NewReader(source))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 4096 || cfg.Height > 4096 {
		return ""
	}
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return ""
	}
	width, height := cfg.Width, cfg.Height
	if width > 256 || height > 256 {
		if width >= height {
			height = height * 256 / width
			width = 256
		} else {
			width = width * 256 / height
			height = 256
		}
	}
	width = max(width, 1)
	height = max(height, 1)
	resized := image.NewNRGBA(image.Rect(0, 0, width, height))
	bounds := decoded.Bounds()
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			resized.Set(x, y, decoded.At(bounds.Min.X+x*cfg.Width/width, bounds.Min.Y+y*cfg.Height/height))
		}
	}
	var out bytes.Buffer
	if png.Encode(&out, resized) != nil || out.Len() > 262144 {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(out.Bytes())
}
