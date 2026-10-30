package protocol

// ProcessSnapshot is live telemetry, excluded from historical samples.
type ProcessSnapshot struct {
	Sampled   int64          `json:"sampled"`
	Total     int            `json:"total"`
	Skipped   int            `json:"skipped"`
	Truncated bool           `json:"truncated"`
	Error     string         `json:"error,omitempty"`
	Processes []ProcessUsage `json:"processes"`
}

type ProcessUsage struct {
	PID     int      `json:"pid"`
	Name    string   `json:"name"`
	CPU     *float64 `json:"cpu"`
	Memory  uint64   `json:"memory"`
	Swap    *uint64  `json:"swap"`
	Read    *float64 `json:"read"`
	Write   *float64 `json:"write"`
	Threads uint64   `json:"threads"`
}
