package web

import "embed"

// Assets contains the embedded MagnetServer browser application.
//
//go:embed *.html *.css *.js vendor
var Assets embed.FS
