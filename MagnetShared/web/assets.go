package web

import "embed"

// Assets contains shared, dependency-free presentation assets.
//
//go:embed scrollbars.css scrollbars.js i18n.js magnet-icon.png material-symbols.woff2 material-symbols.LICENSE material-symbols.NOTICE.md material-icons.json
var Assets embed.FS
