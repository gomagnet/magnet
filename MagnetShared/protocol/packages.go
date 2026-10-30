package protocol

const PackageMaxSize = 512 << 20
const PackageChunkSize = 1 << 20

type PackageChunkRequest struct {
	UploadID string `json:"upload_id"`
	JobID    string `json:"job_id"`
	Offset   int64  `json:"offset"`
}

type PackageChunk struct {
	Offset int64  `json:"offset"`
	Data   []byte `json:"data"`
}
