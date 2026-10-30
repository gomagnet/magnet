package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	statusmodel "MagnetShared/status"
)

// This is also applied when projecting a snapshot, so the public page never
// waits for the scheduler to recognize a maintenance boundary.
func advanceStatusMaintenance(item *statusmodel.StatusIncident, now int64) bool {
	if item.Kind != "maintenance" || item.Status == "completed" {
		return false
	}
	changed := false
	if item.Status == "scheduled" && now >= item.Start {
		item.Status = "in_progress"
		item.Updates = append(item.Updates, statusmodel.StatusUpdate{Time: item.Start, Status: item.Status, Message: "Scheduled maintenance has started."})
		changed = true
	}
	if now >= item.End {
		item.Status = "completed"
		item.Updates = append(item.Updates, statusmodel.StatusUpdate{Time: item.End, Status: item.Status, Message: "Scheduled maintenance window has ended."})
		changed = true
	}
	if changed {
		item.Updated = now
	}
	return changed
}

func (a *app) advanceStatusMaintenances(ctx context.Context) error {
	var due []struct {
		ID   string `db:"id"`
		Page string `db:"page_id"`
	}
	now := time.Now().Unix()
	if err := a.db.SelectContext(ctx, &due, "SELECT id,page_id FROM status_incidents WHERE kind='maintenance' AND state<>'completed' AND ((state='scheduled' AND starts<=?) OR ends<=?) ORDER BY ends LIMIT 100", now, now); err != nil {
		return err
	}
	for _, record := range due {
		err := func() error {
			tx, err := a.db.BeginTxx(ctx, nil)
			if err != nil {
				return err
			}
			defer tx.Rollback()
			// Match the admin writer's lock order.
			var id, raw string
			if err = tx.GetContext(ctx, &id, "SELECT id FROM status_pages WHERE id=? FOR UPDATE", record.Page); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil
				}
				return err
			}
			if err = tx.GetContext(ctx, &raw, "SELECT document FROM status_incidents WHERE id=? AND page_id=? FOR UPDATE", record.ID, record.Page); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil
				}
				return err
			}
			var item statusmodel.StatusIncident
			if err = json.Unmarshal([]byte(raw), &item); err != nil {
				return err
			}
			if !advanceStatusMaintenance(&item, now) {
				return nil
			}
			if _, err = tx.ExecContext(ctx, "UPDATE status_incidents SET document=?,updated=?,state=? WHERE id=?", marshal(item), item.Updated, item.Status, item.ID); err != nil {
				return err
			}
			return tx.Commit()
		}()
		if err != nil {
			return err
		}
	}
	return nil
}
