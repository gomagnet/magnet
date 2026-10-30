package protocol

import (
	"debug/elf"
	"errors"
	"io"
	"regexp"
	"strconv"
	"strings"
)

// Keep the release marker and /link/update/v1 contract stable across versions.
var releasePattern = regexp.MustCompile(`MAGNETLINK_RELEASE_V1:([0-9]+\.[0-9]+\.[0-9]+):END`)

func NewerVersion(candidate, current string) bool {
	a, b := strings.Split(candidate, "."), strings.Split(current, ".")
	if len(a) != 3 || len(b) != 3 {
		return false
	}
	var left, right [3]uint64
	for i := range a {
		x, e := strconv.ParseUint(a[i], 10, 32)
		y, f := strconv.ParseUint(b[i], 10, 32)
		if e != nil || f != nil {
			return false
		}
		left[i] = x
		right[i] = y
	}
	for i := range left {
		if left[i] != right[i] {
			return left[i] > right[i]
		}
	}
	return false
}
func BinaryRelease(data []byte) (string, error) {
	matches := releasePattern.FindAllSubmatch(data, -1)
	if len(matches) == 0 {
		return "", errors.New("MagnetLink release marker missing")
	}
	version := string(matches[0][1])
	for _, match := range matches {
		if string(match[1]) != version {
			return "", errors.New("conflicting Link release markers")
		}
	}
	return version, nil
}
func ReaderBinaryRelease(reader io.Reader) (string, error) {
	buffer := make([]byte, 32768)
	tail := []byte{}
	version := ""
	for {
		n, err := reader.Read(buffer)
		data := append(tail, buffer[:n]...)
		for _, match := range releasePattern.FindAllSubmatch(data, -1) {
			value := string(match[1])
			if version != "" && version != value {
				return "", errors.New("conflicting Link release markers")
			}
			version = value
		}
		if len(data) > 128 {
			tail = append([]byte{}, data[len(data)-128:]...)
		} else {
			tail = append([]byte{}, data...)
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
	}
	if version == "" {
		return "", errors.New("MagnetLink release marker missing")
	}
	return version, nil
}
func LinuxBinaryArch(reader io.ReaderAt) (string, error) {
	f, err := elf.NewFile(reader)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if f.OSABI != elf.ELFOSABI_NONE && f.OSABI != elf.ELFOSABI_LINUX {
		return "", errors.New("not a Linux ELF executable")
	}
	if f.Type != elf.ET_EXEC && f.Type != elf.ET_DYN {
		return "", errors.New("Link artifact must be an ELF executable")
	}
	if f.Data != elf.ELFDATA2LSB {
		return "", errors.New("unsupported ELF byte order")
	}
	switch f.Machine {
	case elf.EM_X86_64:
		if f.Class == elf.ELFCLASS64 {
			return "amd64", nil
		}
	case elf.EM_AARCH64:
		if f.Class == elf.ELFCLASS64 {
			return "arm64", nil
		}
	}
	return "", errors.New("Link auto-update supports Linux amd64 and arm64 executables")
}

const UpdateChunkSize = 128 << 10
const UpdateMaxSize = 128 << 20

type UpdateRequest struct {
	Version string `json:"version"`
	OS      string `json:"os"`
	Arch    string `json:"arch"`
}
type UpdateManifest struct {
	Protocol  int    `json:"protocol"`
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
	OS        string `json:"os,omitempty"`
	Arch      string `json:"arch,omitempty"`
	SHA256    string `json:"sha256,omitempty"`
	Size      int64  `json:"size,omitempty"`
	ChunkSize int    `json:"chunk_size,omitempty"`
}
type UpdateChunkRequest struct {
	SHA256 string `json:"sha256"`
	Offset int64  `json:"offset"`
}
type UpdateChunk struct {
	Offset int64  `json:"offset"`
	Data   []byte `json:"data"`
}

// Update wire v1 deliberately does not depend on the application Version
// constant, so stream/enrollment protocol upgrades cannot strand old updaters.
func SealUpdate(key, purpose string, value any) (Envelope, error) {
	return sealVersion(key, purpose, value, "v1")
}
func OpenUpdate(key, purpose string, envelope Envelope, value any) error {
	return openVersion(key, purpose, envelope, value, "v1")
}
