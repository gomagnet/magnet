package web

import (
	"encoding/json"
	"strings"
)

var presetIcons = func() map[string]bool {
	data, err := Assets.ReadFile("material-icons.json")
	if err != nil {
		panic(err)
	}
	var icons []struct {
		Name string `json:"name"`
	}
	if err = json.Unmarshal(data, &icons); err != nil {
		panic(err)
	}
	allowed := map[string]bool{}
	for _, icon := range icons {
		allowed[icon.Name] = true
	}
	return allowed
}()

// ValidPresetIcon accepts only glyphs included in the bundled Google font subset.
func ValidPresetIcon(value string) bool {
	return strings.HasPrefix(value, "material:") && presetIcons[strings.TrimPrefix(value, "material:")]
}
