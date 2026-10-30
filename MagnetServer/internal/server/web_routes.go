package server

import (
	"io/fs"
	"net/http"

	webassets "MagnetServer/web"
	sharedweb "MagnetShared/web"

	"github.com/gin-gonic/gin"
)

func redirectBrowser(c *gin.Context, destination string) {
	// Do not include an HTML redirect body in an unauthenticated response.
	c.Header("Location", destination)
	c.AbortWithStatus(http.StatusSeeOther)
}

func webAsset(name, contentType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		var source fs.ReadFileFS = webassets.Assets
		if name == "scrollbars.js" || name == "scrollbars.css" || name == "i18n.js" || name == "magnet-icon.png" || name == "material-symbols.woff2" || name == "material-icons.json" || name == "material-symbols.LICENSE" {
			source = sharedweb.Assets
		}
		data, err := source.ReadFile(name)
		if err != nil {
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		c.Data(http.StatusOK, contentType, data)
	}
}

func (a *app) validSession(c *gin.Context) bool {
	return a.sessionPrincipal(c)
}

func (a *app) browserAuth(page bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Cookie")
		if !a.validSession(c) {
			if page {
				redirectBrowser(c, "/login")
			} else {
				c.AbortWithStatus(http.StatusUnauthorized)
			}
			return
		}
		c.Next()
	}
}

func (a *app) loginPageRoutes(r *gin.Engine) {
	r.Match([]string{"GET", "HEAD"}, "/magnet-icon.png", webAsset("magnet-icon.png", "image/png"))
	r.Match([]string{"GET", "HEAD"}, "/login", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Cookie")
		if a.validSession(c) {
			redirectBrowser(c, "/")
			return
		}
		webAsset("login.html", "text/html; charset=utf-8")(c)
	})
	r.Match([]string{"GET", "HEAD"}, "/login.js", webAsset("login.js", "application/javascript"))
	r.Match([]string{"GET", "HEAD"}, "/login.css", webAsset("login.css", "text/css; charset=utf-8"))
	r.Match([]string{"GET", "HEAD"}, "/scrollbars.js", webAsset("scrollbars.js", "application/javascript"))
	r.Match([]string{"GET", "HEAD"}, "/scrollbars.css", webAsset("scrollbars.css", "text/css; charset=utf-8"))
	r.Match([]string{"GET", "HEAD"}, "/i18n.js", webAsset("i18n.js", "application/javascript"))
}

func (a *app) browserRoutes(r *gin.Engine) {
	a.loginPageRoutes(r)
	r.Match([]string{"GET", "HEAD"}, "/", a.browserAuth(true), func(c *gin.Context) { redirectBrowser(c, "/dash") })
	r.Match([]string{"GET", "HEAD"}, "/dash", a.browserAuth(true), webAsset("index.html", "text/html; charset=utf-8"))
	private := r.Group("", a.browserAuth(false))
	for _, name := range []string{"app.js", "compose.js", "editors.js", "workspaces.js", "autoload.js", "management.js", "status-admin.js", "accounts.js", "configuration.js", "cleanup.js", "server-groups.js", "account-editors.js", "icon-presets.js", "inner-navigation.js", "startup-manager.js", "charts.js", "performance.js"} {
		private.Match([]string{"GET", "HEAD"}, "/"+name, webAsset(name, "application/javascript"))
	}
	private.Match([]string{"GET", "HEAD"}, "/material-symbols.woff2", webAsset("material-symbols.woff2", "font/woff2"))
	private.Match([]string{"GET", "HEAD"}, "/material-symbols.LICENSE", webAsset("material-symbols.LICENSE", "text/plain; charset=utf-8"))
	private.Match([]string{"GET", "HEAD"}, "/material-icons.json", webAsset("material-icons.json", "application/json"))
	private.Match([]string{"GET", "HEAD"}, "/style.css", webAsset("style.css", "text/css; charset=utf-8"))
	monaco, err := fs.Sub(webassets.Assets, "vendor/monaco")
	if err != nil {
		panic(err)
	}
	private.StaticFS("/vendor/monaco", http.FS(monaco))
}
