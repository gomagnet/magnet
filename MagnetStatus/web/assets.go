package web

import "embed"

// Assets contains the embedded MagnetStatus browser application.
//
//go:embed *.html *.css *.js
var Assets embed.FS
