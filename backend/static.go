package main

import (
	"html"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var titlePattern = regexp.MustCompile(`(?s)<title>.*?</title>`)
var metaPattern = regexp.MustCompile(`<meta\s+(?:name|property)="([^"]+)"\s+content="[^"]*"\s*/>`)
var contentPattern = regexp.MustCompile(`content="[^"]*"`)

func (a *App) staticRoutes() {
	origin := a.Store.Config.PublicOrigin
	if origin == "" {
		origin = a.Store.Config.Origin
	}
	a.route("GET /robots.txt", func(w http.ResponseWriter, r *http.Request) error {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, err := w.Write([]byte("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /submit\nSitemap: " + origin + "/sitemap.xml\n"))
		return err
	})
	a.route("GET /sitemap.xml", func(w http.ResponseWriter, r *http.Request) error {
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, err := w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>` + html.EscapeString(origin+"/") + `</loc></url><url><loc>` + html.EscapeString(origin+"/about") + `</loc></url></urlset>`))
		return err
	})
	a.route("GET /assets/{path...}", func(w http.ResponseWriter, r *http.Request) error {
		relative := r.PathValue("path")
		if relative == "" || filepath.IsAbs(relative) || filepath.Clean(relative) != relative || strings.HasPrefix(relative, "..") {
			w.Header().Set("Cache-Control", "no-store")
			return fail(404, "资源不存在")
		}
		path := filepath.Join(a.Store.Config.DistDir, "assets", relative)
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			w.Header().Set("Cache-Control", "no-store")
			return fail(404, "资源不存在")
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, path)
		return nil
	})
	a.route("GET /favicon.svg", func(w http.ResponseWriter, r *http.Request) error {
		http.ServeFile(w, r, filepath.Join(a.Store.Config.DistDir, "favicon.svg"))
		return nil
	})
	a.route("/", func(w http.ResponseWriter, r *http.Request) error {
		if r.Method != "GET" && r.Method != "HEAD" {
			return fail(405, "请求方法不支持")
		}
		relative := strings.TrimPrefix(r.URL.Path, "/")
		if relative != "" && filepath.Clean(relative) == relative && !strings.HasPrefix(relative, ".") {
			path := filepath.Join(a.Store.Config.DistDir, relative)
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, path)
				return nil
			}
		}
		if filepath.Ext(relative) != "" {
			return fail(404, "资源不存在")
		}
		data, err := os.ReadFile(filepath.Join(a.Store.Config.DistDir, "index.html"))
		if err != nil {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(503)
			_, err = w.Write([]byte("前端尚未构建，请运行 bun run build；开发时使用 Vite 页面。"))
			return err
		}
		settings, _, err := a.Store.settings(a.Store.DB)
		if err != nil {
			return err
		}
		page := titlePattern.ReplaceAllStringFunc(string(data), func(string) string { return "<title>" + html.EscapeString(settings.Name) + "</title>" })
		values := map[string]string{"description": settings.Description, "author": settings.Name, "og:title": settings.Name, "og:site_name": settings.Name, "og:description": settings.Description, "twitter:title": settings.Name, "twitter:description": settings.Description}
		page = metaPattern.ReplaceAllStringFunc(page, func(tag string) string {
			key := metaPattern.FindStringSubmatch(tag)[1]
			if value, ok := values[key]; ok {
				return contentPattern.ReplaceAllStringFunc(tag, func(string) string { return `content="` + html.EscapeString(value) + `"` })
			}
			return tag
		})
		page = strings.Replace(page, "<head>", "<head><script>window.__INAV_BACKEND__=true;window.__INAV_SETTINGS__="+marshal(settings)+";</script>", 1)
		w.Header().Set("Content-Type", "text/html; charset=UTF-8")
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		if strings.HasPrefix(r.URL.Path, "/admin") {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		}
		_, err = w.Write([]byte(page))
		return err
	})
}
