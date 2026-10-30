package status

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	statusmodel "MagnetShared/status"
	"MagnetStatus/internal/config"
)

type renderer struct {
	mu   sync.RWMutex
	data *statusmodel.StatusSnapshot
}

func (r *renderer) poll(ctx context.Context, c config.Config) {
	client := &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect disabled") }}
	timer := time.NewTicker(15 * time.Second)
	defer timer.Stop()
	for {
		err := func() error {
			req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(c.Server, "/")+"/status/v1/"+url.PathEscape(c.Page), nil)
			if err != nil {
				return errors.New("invalid API address")
			}
			req.Header.Set("Authorization", "Bearer "+c.Key)
			resp, err := client.Do(req)
			if err != nil {
				return errors.New("cannot reach MagnetServer over HTTPS")
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				return fmt.Errorf("MagnetServer returned HTTP %d", resp.StatusCode)
			}
			var snapshot statusmodel.StatusSnapshot
			reader := io.LimitReader(resp.Body, (128<<20)+1)
			b, err := io.ReadAll(reader)
			if err != nil || len(b) > 128<<20 {
				return errors.New("invalid API response size")
			}
			if json.Unmarshal(b, &snapshot) != nil || snapshot.Version != 1 || snapshot.Generated <= 0 || snapshot.Generated > time.Now().Unix()+60 {
				return errors.New("invalid status API response")
			}
			r.mu.Lock()
			r.data = &snapshot
			r.mu.Unlock()
			return nil
		}()
		if err != nil && ctx.Err() == nil {
			log.Print("Status refresh: ", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
	}
}
