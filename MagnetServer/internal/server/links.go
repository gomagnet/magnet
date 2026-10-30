package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	protocol "MagnetShared/protocol"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type linkPeer struct {
	conn         *websocket.Conn
	key, purpose string
	writeMu      sync.Mutex
	sequence     uint64
	// Protected by app.linksMu, including reservations made before DB commit.
	active map[string]string
}

func (p *linkPeer) send(message protocol.StreamMessage) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	p.sequence++
	message.Sequence = p.sequence
	envelope, err := protocol.Seal(p.key, p.purpose, message)
	if err != nil {
		return err
	}
	_ = p.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err = p.conn.WriteJSON(envelope); err != nil {
		p.conn.Close()
	}
	return err
}

func (a *app) linkConnected(id string) bool {
	a.linksMu.Lock()
	defer a.linksMu.Unlock()
	return a.links[id] != nil
}

func (a *app) closeLinks() {
	a.linksMu.Lock()
	defer a.linksMu.Unlock()
	for _, peer := range a.links {
		peer.conn.Close()
	}
}

func (a *app) notifyJobs() {
	a.jobMu.Lock()
	defer a.jobMu.Unlock()
	if a.jobChanged != nil {
		close(a.jobChanged)
	}
	a.jobChanged = make(chan struct{})
}

func (a *app) watchJobs() <-chan struct{} {
	a.jobMu.Lock()
	defer a.jobMu.Unlock()
	if a.jobChanged == nil {
		a.jobChanged = make(chan struct{})
	}
	return a.jobChanged
}

func (a *app) detachLink(id string, peer *linkPeer) {
	peer.conn.Close()
	a.linksMu.Lock()
	if a.links[id] == peer {
		delete(a.links, id)
	}
	ids := make([]string, 0, len(peer.active))
	for job := range peer.active {
		ids = append(ids, job)
	}
	peer.active = map[string]string{}
	a.linksMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, job := range ids {
		if _, err := a.db.ExecContext(ctx, "UPDATE jobs SET status='unknown',output='Link disconnected; execution may have started. Inspect the node before retrying.',updated=? WHERE id=? AND status='running'", time.Now().Unix(), job); err != nil {
			log.Printf("Disconnect job update: %v", err)
		}
	}
	a.notifyJobs()
}

func packageJob(kind string) bool {
	return kind == "cleanup.execute" || kind == "dns.write" || strings.HasPrefix(kind, "apt.sources.") || kind == "apt.install" || kind == "apt.update" || kind == "deb.install" || kind == "database.install"
}

// Reserve execution capacity; there is no pending action queue. Package manager
// conflicts and uninstall conflicts are rejected before any action is sent.
func (a *app) reserveJobs(nodes []string, kind string, args map[string]string) ([]protocol.Job, []*linkPeer, error) {
	a.linksMu.Lock()
	defer a.linksMu.Unlock()
	seen := map[string]bool{}
	for _, id := range nodes {
		if seen[id] {
			return nil, nil, errors.New("select each server only once")
		}
		seen[id] = true
		peer := a.links[id]
		if peer == nil {
			return nil, nil, fmt.Errorf("server %s has no live Link connection; reconnect or update MagnetLink", id)
		}
		if len(peer.active) >= 8 {
			return nil, nil, errors.New("Link is at its concurrent action limit; retry after an action completes")
		}
		for _, activeKind := range peer.active {
			if kind == "link.uninstall" || activeKind == "link.uninstall" {
				return nil, nil, errors.New("uninstall requires an idle Link")
			}
			if packageJob(kind) && packageJob(activeKind) {
				return nil, nil, errors.New("a package installation/update is already running on this node")
			}
		}
	}
	jobs := make([]protocol.Job, 0, len(nodes))
	peers := make([]*linkPeer, 0, len(nodes))
	for _, id := range nodes {
		job := protocol.Job{ID: protocol.Secret(), NodeID: id, Kind: kind, Args: args, Status: "running", Created: time.Now().Unix(), Updated: time.Now().Unix()}
		peer := a.links[id]
		peer.active[job.ID] = kind
		jobs = append(jobs, job)
		peers = append(peers, peer)
	}
	return jobs, peers, nil
}

func (a *app) releaseJob(peer *linkPeer, id string) {
	a.linksMu.Lock()
	delete(peer.active, id)
	a.linksMu.Unlock()
}

func (a *app) linkStream(c *gin.Context) {
	id := c.Param("id")
	var key string
	if a.db.Get(&key, "SELECT secret_key FROM nodes WHERE id=?", id) != nil {
		fail(c, 401, errors.New("unknown Link"))
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == "" }}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(4 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	challenge := protocol.Secret()
	if conn.WriteJSON(protocol.StreamChallenge{Challenge: challenge}) != nil {
		return
	}
	var auth protocol.StreamAuth
	if conn.ReadJSON(&auth) != nil || len(auth.Challenge) != 43 {
		return
	}
	var identity struct {
		ID string `json:"id"`
	}
	if protocol.Open(key, protocol.StreamPurpose(id, challenge, auth.Challenge, "auth"), auth.Envelope, &identity) != nil || identity.ID != id {
		return
	}
	peer := &linkPeer{conn: conn, key: key, purpose: protocol.StreamPurpose(id, challenge, auth.Challenge, "server"), active: map[string]string{}}
	if peer.send(protocol.StreamMessage{Type: "ready"}) != nil {
		return
	}
	a.linksMu.Lock()
	if a.links == nil {
		a.links = map[string]*linkPeer{}
	}
	old := a.links[id]
	a.links[id] = peer
	a.linksMu.Unlock()
	if old != nil {
		old.conn.Close()
	}
	defer a.detachLink(id, peer)
	var sequence uint64
	announced := false
	for {
		_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		var envelope protocol.Envelope
		if conn.ReadJSON(&envelope) != nil {
			return
		}
		var message protocol.StreamMessage
		if protocol.Open(key, protocol.StreamPurpose(id, challenge, auth.Challenge, "client"), envelope, &message) != nil || message.Sequence != sequence+1 {
			return
		}
		sequence = message.Sequence
		switch message.Type {
		case "heartbeat":
			if message.Heartbeat == nil || len(message.Heartbeat.Info.Hostname) > 255 {
				return
			}
			h := message.Heartbeat
			now := time.Now().Unix()
			result, dbErr := a.db.Exec("UPDATE nodes SET hostname=?,os=?,arch=?,seen=?,metrics=?,address=? WHERE id=? AND secret_key=?", h.Info.Hostname, h.Info.OS, h.Info.Arch, now, marshal(h.Metrics), nodePublicIPv4(h.Info, c.ClientIP()), id, key)
			if dbErr != nil {
				return
			}
			count, _ := result.RowsAffected()
			// MariaDB can report zero for an identical update in the same second.
			if count == 0 {
				var exists int
				if a.db.Get(&exists, "SELECT count(*) FROM nodes WHERE id=? AND secret_key=?", id, key) != nil || exists == 0 {
					return
				}
			}
			if _, err = a.db.Exec("INSERT INTO samples VALUES(?,?,?)", id, now, historyMetricsJSON(h.Metrics)); err != nil {
				return
			}
			if peer.send(protocol.StreamMessage{Type: "heartbeat"}) != nil {
				return
			}
			if !announced {
				announced = true
				for _, capability := range h.Info.Capabilities {
					if capability == "update-notify-v1" {
						if artifact, updateErr := a.availableArtifact(); updateErr == nil {
							manifest := artifact.manifest
							if manifest.Arch == h.Info.Arch && protocol.NewerVersion(manifest.Version, h.Info.Version) {
								if peer.send(protocol.StreamMessage{Type: "update.available", Update: &manifest}) != nil {
									return
								}
							}
						}
						break
					}
				}
			}
		case "result":
			if message.Result == nil {
				return
			}
			r := message.Result
			var exists int
			if a.db.Get(&exists, "SELECT count(*) FROM jobs WHERE id=? AND node_id=?", r.ID, id) != nil || exists != 1 {
				return
			}
			status, output := "succeeded", r.Output
			if r.Error != "" {
				status = "failed"
				output += "\n" + r.Error
			}
			if len(output) > 262144 {
				output = strings.ToValidUTF8(output[:262144], "?") + "\n[truncated]"
			}
			if _, err = a.db.Exec("UPDATE jobs SET status=?,output=?,updated=? WHERE id=? AND node_id=? AND status IN ('running','unknown')", status, output, time.Now().Unix(), r.ID, id); err != nil {
				return
			}
			a.releaseJob(peer, r.ID)
			a.notifyJobs()
			if peer.send(protocol.StreamMessage{Type: "ack", ID: r.ID}) != nil {
				return
			}
			// Keep the stream open until Link receives the acknowledgement and stops.
		default:
			return
		}
	}
}
