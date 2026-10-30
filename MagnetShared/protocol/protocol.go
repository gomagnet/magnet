// Package protocol defines Magnet's authenticated agent wire format.
package protocol

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const Version = "v1"

type Envelope struct {
	Nonce string `json:"nonce"`
	Data  string `json:"data"`
}
type payload struct {
	Time  int64           `json:"time"`
	Value json.RawMessage `json:"value"`
}

func Secret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func aead(key string) (cipher.AEAD, error) {
	b, err := base64.RawURLEncoding.DecodeString(key)
	if err != nil || len(b) != 32 {
		return nil, errors.New("invalid 256-bit key")
	}
	c, err := aes.NewCipher(b)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(c)
}

// Purpose binds ciphertext to its route, identity and direction.
func Seal(key, purpose string, value any) (Envelope, error) {
	return sealVersion(key, purpose, value, Version)
}
func sealVersion(key, purpose string, value any, wireVersion string) (Envelope, error) {
	a, err := aead(key)
	if err != nil {
		return Envelope{}, err
	}
	v, err := json.Marshal(value)
	if err != nil {
		return Envelope{}, err
	}
	b, err := json.Marshal(payload{time.Now().Unix(), v})
	if err != nil {
		return Envelope{}, err
	}
	nonce := make([]byte, a.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return Envelope{}, err
	}
	return Envelope{base64.RawURLEncoding.EncodeToString(nonce), base64.RawURLEncoding.EncodeToString(a.Seal(nil, nonce, b, []byte(wireVersion+":"+purpose)))}, nil
}
func Open(key, purpose string, e Envelope, value any) error {
	return openVersion(key, purpose, e, value, Version)
}
func openVersion(key, purpose string, e Envelope, value any, wireVersion string) error {
	a, err := aead(key)
	if err != nil {
		return err
	}
	nonce, err := base64.RawURLEncoding.DecodeString(e.Nonce)
	if err != nil || len(nonce) != a.NonceSize() {
		return errors.New("invalid nonce")
	}
	b, err := base64.RawURLEncoding.DecodeString(e.Data)
	if err != nil {
		return err
	}
	b, err = a.Open(nil, nonce, b, []byte(wireVersion+":"+purpose))
	if err != nil {
		return errors.New("authentication failed")
	}
	var p payload
	if err = json.Unmarshal(b, &p); err != nil {
		return err
	}
	delta := time.Now().Unix() - p.Time
	if delta < -120 || delta > 120 {
		return fmt.Errorf("message expired; synchronize clocks")
	}
	return json.Unmarshal(p.Value, value)
}

type CPUCoreUsage struct {
	ID    int      `json:"id"`
	Usage *float64 `json:"usage"`
}

type Metrics struct {
	Processes         *ProcessSnapshot `json:"process_snapshot,omitempty"`
	NetworkScope      string           `json:"network_scope,omitempty"`
	NetworkInterfaces []string         `json:"network_interfaces,omitempty"`
	NetworkReady      bool             `json:"network_ready,omitempty"`
	CPUCores          []CPUCoreUsage   `json:"cpu_cores,omitempty"`
	LinkHome          string           `json:"link_home,omitempty"`
	LinkVersion       string           `json:"link_version,omitempty"`
	LinkUser          string           `json:"link_user"`
	LinkUID           int              `json:"link_uid"`
	CPU               float64          `json:"cpu"`
	RAM               float64          `json:"ram"`
	RAMTotal          uint64           `json:"ram_total"`
	Disk              float64          `json:"disk"`
	Load              float64          `json:"load"`
	RX                uint64           `json:"rx"`
	TX                uint64           `json:"tx"`
	Uptime            uint64           `json:"uptime"`
}
type NodeInfo struct {
	Version      string   `json:"version,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	Hostname     string   `json:"hostname"`
	OS           string   `json:"os"`
	Arch         string   `json:"arch"`
	// Address is the node-reported public IPv4 when public-ipv4-v1 is advertised.
	Address string `json:"address"`
}
type Credentials struct {
	ID     string `json:"id"`
	Key    string `json:"key"`
	Script string `json:"script,omitempty"`
}
type Job struct {
	ID        string            `json:"id" db:"id"`
	NodeID    string            `json:"node_id" db:"node_id"`
	Kind      string            `json:"kind" db:"kind"`
	Args      map[string]string `json:"args" db:"-"`
	Arguments string            `json:"-" db:"arguments"`
	Status    string            `json:"status" db:"status"`
	Output    string            `json:"output" db:"output"`
	Created   int64             `json:"created" db:"created"`
	Updated   int64             `json:"updated" db:"updated"`
}
type Result struct {
	ID     string `json:"id"`
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}
type Heartbeat struct {
	Info    NodeInfo `json:"info"`
	Metrics Metrics  `json:"metrics"`
	Results []Result `json:"results"`
}
type Reply struct {
	Jobs []Job `json:"jobs"`
}

// Stream authentication combines fresh challenges from both endpoints. Frames
// are additionally sequenced in each direction to reject in-session replays.
type StreamChallenge struct {
	Challenge string `json:"challenge"`
}
type StreamAuth struct {
	Challenge string   `json:"challenge"`
	Envelope  Envelope `json:"envelope"`
}
type StreamMessage struct {
	Update    *UpdateManifest `json:"update,omitempty"`
	Sequence  uint64          `json:"sequence"`
	Type      string          `json:"type"`
	ID        string          `json:"id,omitempty"`
	Job       *Job            `json:"job,omitempty"`
	Result    *Result         `json:"result,omitempty"`
	Heartbeat *Heartbeat      `json:"heartbeat,omitempty"`
}

func StreamPurpose(id, serverChallenge, clientChallenge, direction string) string {
	return "stream:" + id + ":" + serverChallenge + ":" + clientChallenge + ":" + direction
}
