package server

import (
	sharedweb "MagnetShared/web"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"image/png"
	"io"
	"net/url"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

var localSVGReference = regexp.MustCompile(`(?i)url\(\s*#[a-zA-Z_][a-zA-Z0-9_.:-]*\s*\)`)

// SVG is accepted only as an image with a small, passive drawing vocabulary.
// Images are embedded as data URLs, never inserted as active document markup.
func validateServerIcon(value string) error {
	if sharedweb.ValidPresetIcon(value) {
		return nil
	}
	return validateImage(value)
}

func validateImage(value string) error {
	if value == "" {
		return nil
	}
	if len(value) > 350000 {
		return errors.New("image exceeds 256 KiB")
	}
	parts := strings.SplitN(value, ",", 2)
	if len(parts) != 2 {
		return errors.New("PNG or SVG data URL required")
	}
	b, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil || len(b) > 262144 {
		return errors.New("invalid image data")
	}
	switch parts[0] {
	case "data:image/png;base64":
		cfg, err := png.DecodeConfig(bytes.NewReader(b))
		if err != nil || cfg.Width > 4096 || cfg.Height > 4096 {
			return errors.New("invalid PNG or dimensions exceed 4096 pixels")
		}
		_, err = png.Decode(bytes.NewReader(b))
		return err
	case "data:image/svg+xml;base64":
		allowed := strings.Fields("svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask title desc symbol use")
		elements := map[string]bool{}
		for _, s := range allowed {
			elements[s] = true
		}
		decoder := xml.NewDecoder(bytes.NewReader(b))
		root := false
		depth := 0
		for {
			token, err := decoder.Token()
			if err == io.EOF {
				break
			}
			if err != nil {
				return errors.New("invalid SVG")
			}
			switch t := token.(type) {
			case xml.StartElement:
				if depth == 0 {
					if root || t.Name.Local != "svg" {
						return errors.New("SVG root required")
					}
					root = true
				}
				depth++
				if !elements[t.Name.Local] || (t.Name.Space != "" && t.Name.Space != "http://www.w3.org/2000/svg") {
					return errors.New("unsupported SVG element")
				}
				for _, attr := range t.Attr {
					name := strings.ToLower(attr.Name.Local)
					v := strings.ToLower(localSVGReference.ReplaceAllString(attr.Value, ""))
					if strings.HasPrefix(name, "on") || (name == "href" && !strings.HasPrefix(attr.Value, "#")) || name == "src" || strings.Contains(v, "url(") || strings.Contains(v, "javascript:") || strings.Contains(v, "@") || strings.Contains(v, "expression(") || strings.ContainsAny(v, `\`) {
						return errors.New("SVG must contain passive drawing elements only")
					}
				}
			case xml.EndElement:
				depth--
			case xml.ProcInst:
				if t.Target != "xml" || root {
					return errors.New("unsupported SVG processing instruction")
				}
			case xml.CharData:
				if depth == 0 && strings.TrimSpace(string(t)) != "" {
					return errors.New("invalid SVG text outside root")
				}
			case xml.Directive:
				return errors.New("SVG directives are unsupported; upload a plain SVG")
			}
		}
		if !root || depth != 0 {
			return errors.New("invalid SVG")
		}
		return nil
	}
	return errors.New("PNG or SVG data URL required")
}

func providerPicture(value string) string {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || len(value) > 4096 {
		return ""
	}
	return u.String()
}

func (a *app) saveAvatar(c *gin.Context) {
	var in struct {
		Image string `json:"image"`
	}
	if c.ShouldBindJSON(&in) != nil {
		bad(c, "invalid avatar")
		return
	}
	if err := validateImage(in.Image); err != nil {
		bad(c, err.Error())
		return
	}
	p := currentPrincipal(c)
	if _, err := a.db.Exec("INSERT INTO account_avatars(owner,image) VALUES(?,?) ON DUPLICATE KEY UPDATE image=VALUES(image)", p.ID, in.Image); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true, "avatar": in.Image})
}
