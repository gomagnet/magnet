package status

// StatusSnapshot is the versioned, public-only contract consumed by MagnetStatus.
// Never add check targets, request headers, credentials or internal errors here.
type StatusSnapshot struct {
	Version     int              `json:"version"`
	Generated   int64            `json:"generated"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Accent      string           `json:"accent"`
	Theme       string           `json:"theme"`
	Website     string           `json:"website"`
	Logo        string           `json:"logo"`
	Footer      string           `json:"footer"`
	Services    []StatusService  `json:"services"`
	Incidents   []StatusIncident `json:"incidents"`
}

type StatusDay struct {
	Day      int64 `json:"day" db:"bucket"`
	Checks   int64 `json:"checks" db:"checks"`
	Failures int64 `json:"failures" db:"failures"`
	Latency  int64 `json:"latency_ms" db:"latency_ms"`
}

type StatusHour struct {
	Hour     int64 `json:"hour" db:"bucket"`
	Checks   int64 `json:"checks" db:"checks"`
	Failures int64 `json:"failures" db:"failures"`
	Latency  int64 `json:"latency_ms" db:"latency_ms"`
}

type StatusService struct {
	Kind          string       `json:"kind,omitempty"`
	LastSeen      int64        `json:"last_seen,omitempty"`
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Status        string       `json:"status"`
	Checked       int64        `json:"checked"`
	Latency       int64        `json:"latency_ms"`
	History       []StatusDay  `json:"history"`
	HourlyHistory []StatusHour `json:"hourly_history"`
}

type StatusUpdate struct {
	Time    int64  `json:"time"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type StatusIncident struct {
	ID       string         `json:"id"`
	Title    string         `json:"title"`
	Kind     string         `json:"kind"`
	Impact   string         `json:"impact"`
	Status   string         `json:"status"`
	Services []string       `json:"services"`
	Start    int64          `json:"start"`
	End      int64          `json:"end"`
	Created  int64          `json:"created"`
	Updated  int64          `json:"updated"`
	Updates  []StatusUpdate `json:"updates"`
}
