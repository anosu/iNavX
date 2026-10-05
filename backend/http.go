package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type attempt struct {
	Count   int
	Expires time.Time
}
type App struct {
	Store                     *Store
	mux                       *http.ServeMux
	writeMu, backupMu, rateMu sync.Mutex
	maintenance               atomic.Bool
	authGate, captchaGate     chan struct{}
	logins, submissions       map[string]attempt
	captchaClient             *http.Client
}
type handler func(http.ResponseWriter, *http.Request) error

func newApp(store *Store) *App {
	a := &App{Store: store, mux: http.NewServeMux(), authGate: make(chan struct{}, 1), captchaGate: make(chan struct{}, 5), logins: map[string]attempt{}, submissions: map[string]attempt{}, captchaClient: &http.Client{Timeout: 5 * time.Second}}
	a.routes()
	return a
}
func jsonResponse(w http.ResponseWriter, status int, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(status)
	_, err = w.Write(data)
	return err
}
func readJSON(r *http.Request, value any) error {
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	return strictJSON(data, value)
}
func (a *App) route(pattern string, fn handler) {
	a.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			a.respondError(w, err)
		}
	})
}
func (a *App) respondError(w http.ResponseWriter, err error) {
	var api *APIError
	var limit *http.MaxBytesError
	if errors.As(err, &limit) {
		api = &APIError{413, "文件或请求过大"}
	}
	if api == nil && !errors.As(err, &api) {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			api = &APIError{409, "内容重复，请刷新后重试"}
		} else {
			log.Printf("request failed: %v", err)
			api = &APIError{500, "服务器处理失败，请稍后重试"}
		}
	}
	jsonResponse(w, api.Status, map[string]string{"error": api.Message})
}
func (a *App) allowedPublic(value string) bool {
	return value != "" && (value == a.Store.Config.Origin || value == a.Store.Config.PublicOrigin)
}
func (a *App) address(r *http.Request) string {
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if ip := net.ParseIP(remote); ip != nil {
		remote = ip.String()
	}
	if a.Store.Config.TrustedProxies[remote] {
		if ip := net.ParseIP(r.Header.Get("X-Real-IP")); ip != nil {
			return ip.String()
		}
	}
	return remote
}
func (a *App) rateAllowed(values map[string]attempt, key string, maxCount, capacity int) bool {
	a.rateMu.Lock()
	defer a.rateMu.Unlock()
	stamp := time.Now()
	for key, v := range values {
		if !stamp.Before(v.Expires) {
			delete(values, key)
		}
	}
	v, exists := values[key]
	if !exists {
		if len(values) >= capacity {
			return false
		}
		v.Expires = stamp.Add(15 * time.Minute)
	}
	if v.Count >= maxCount {
		return false
	}
	v.Count++
	values[key] = v
	return true
}
func (a *App) authenticated(r *http.Request) (*Session, error) {
	cookie, err := r.Cookie("inav_session")
	if err != nil {
		return nil, fail(401, "请先登录")
	}
	session, err := a.Store.session(cookie.Value)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, fail(401, "请先登录")
	}
	if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(session.CSRF)) != 1 {
		return nil, fail(403, "会话校验失败，请重新登录")
	}
	return session, nil
}
func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for key, value := range map[string]string{"X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "Strict-Transport-Security": "max-age=15552000; includeSubDomains", "X-DNS-Prefetch-Control": "off", "X-Permitted-Cross-Domain-Policies": "none"} {
		w.Header().Set(key, value)
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.Header().Set("Cache-Control", "no-store")
		limit := a.Store.Defaults.Limits.BodyBytes
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			limit = 8192
		}
		if r.URL.Path == "/api/public/applications" {
			limit = 8192
			if a.allowedPublic(r.Header.Get("Origin")) {
				w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
				w.Header().Set("Vary", "Origin")
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, int64(limit))
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE" {
			if a.maintenance.Load() {
				a.respondError(w, fail(503, "正在恢复数据，请稍后重试"))
				return
			}
			allowed := r.Header.Get("Origin") == a.Store.Config.Origin
			if r.URL.Path == "/api/public/applications" {
				allowed = a.allowedPublic(r.Header.Get("Origin"))
			}
			if !allowed {
				a.respondError(w, fail(403, "请求来源不受信任"))
				return
			}
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != "application/json" {
				a.respondError(w, fail(400, "请使用 JSON 请求"))
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/api/admin/") {
			if _, err := a.authenticated(r); err != nil {
				a.respondError(w, err)
				return
			}
		}
	}
	a.mux.ServeHTTP(w, r)
}
func (a *App) mutate(fn func(*sql.Tx) error) error {
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	if a.maintenance.Load() {
		return fail(503, "正在恢复数据，请稍后重试")
	}
	return transaction(a.Store.DB, fn)
}
func (a *App) routes() {
	s := a.Store
	a.route("GET /api/health", func(w http.ResponseWriter, r *http.Request) error {
		var value int
		if err := s.DB.QueryRow("SELECT 1").Scan(&value); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("GET /api/public/settings", func(w http.ResponseWriter, r *http.Request) error {
		c, err := s.snapshot(s.DB, false)
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]any{"settings": c.Settings, "revision": c.Revision})
	})
	a.route("GET /api/public/catalog", func(w http.ResponseWriter, r *http.Request) error {
		c, err := s.snapshot(s.DB, false)
		if err != nil {
			return err
		}
		data, err := json.Marshal(c)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		etag := "\"catalog-" + hex.EncodeToString(sum[:]) + "\""
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
		if s.Config.PublicOrigin != "" {
			w.Header().Set("Vary", "Origin")
			if r.Header.Get("Origin") == s.Config.PublicOrigin {
				w.Header().Set("Access-Control-Allow-Origin", s.Config.PublicOrigin)
			}
		}
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(304)
			return nil
		}
		w.Header().Set("Content-Type", "application/json; charset=UTF-8")
		_, err = w.Write(data)
		return err
	})
	a.route("OPTIONS /api/public/applications", func(w http.ResponseWriter, r *http.Request) error {
		if !a.allowedPublic(r.Header.Get("Origin")) {
			return fail(403, "请求来源不受信任")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(204)
		return nil
	})
	a.route("GET /api/public/applications", func(w http.ResponseWriter, r *http.Request) error {
		settings, _, err := s.settings(s.DB)
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]any{"enabled": settings.ApplicationsEnabled, "siteKey": s.Config.SiteKey})
	})
	a.route("POST /api/public/applications", a.submitHandler)
	a.route("GET /api/auth/status", func(w http.ResponseWriter, r *http.Request) error {
		account, err := s.account(s.DB)
		if err != nil {
			return err
		}
		var session *Session
		if cookie, err := r.Cookie("inav_session"); err == nil {
			session, err = s.session(cookie.Value)
			if err != nil {
				return err
			}
		}
		value := map[string]any{"initialized": account != nil, "authenticated": session != nil}
		if session != nil && account != nil {
			value["csrf"] = session.CSRF
			value["username"] = account.Username
		}
		return jsonResponse(w, 200, value)
	})
	a.route("POST /api/auth/{action}", a.authHandler)
	a.route("GET /api/admin/catalog", func(w http.ResponseWriter, r *http.Request) error {
		c, err := s.snapshot(s.DB, true)
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, c)
	})
	a.route("POST /api/admin/sites", func(w http.ResponseWriter, r *http.Request) error {
		var input SiteInput
		if err := readJSON(r, &input); err != nil {
			return err
		}
		var value Site
		err := a.mutate(func(tx *sql.Tx) error { var err error; value, err = s.saveSite(tx, input, ""); return err })
		if err != nil {
			return err
		}
		return jsonResponse(w, 201, value)
	})
	a.route("PUT /api/admin/sites/{id}", func(w http.ResponseWriter, r *http.Request) error {
		var input SiteInput
		if err := readJSON(r, &input); err != nil {
			return err
		}
		var value Site
		err := a.mutate(func(tx *sql.Tx) error {
			var err error
			value, err = s.saveSite(tx, input, r.PathValue("id"))
			return err
		})
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	a.route("DELETE /api/admin/sites/{id}", func(w http.ResponseWriter, r *http.Request) error {
		if err := a.mutate(func(tx *sql.Tx) error { return s.setDeleted(tx, r.PathValue("id"), true) }); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("POST /api/admin/sites/{id}/restore", func(w http.ResponseWriter, r *http.Request) error {
		if err := a.mutate(func(tx *sql.Tx) error { return s.setDeleted(tx, r.PathValue("id"), false) }); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("DELETE /api/admin/sites/{id}/permanent", func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			ExpectedUpdatedAt string `json:"expectedUpdatedAt" required:"true"`
		}
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if err := a.mutate(func(tx *sql.Tx) error { return s.permanentSite(tx, r.PathValue("id"), input.ExpectedUpdatedAt) }); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	for _, pattern := range []string{"POST /api/admin/categories", "PUT /api/admin/categories/{id}"} {
		a.route(pattern, func(w http.ResponseWriter, r *http.Request) error {
			var input CategoryInput
			if err := readJSON(r, &input); err != nil {
				return err
			}
			var value Category
			err := a.mutate(func(tx *sql.Tx) error {
				var err error
				value, err = s.saveCategory(tx, input, r.PathValue("id"))
				return err
			})
			if err != nil {
				return err
			}
			status := 200
			if r.Method == "POST" {
				status = 201
			}
			return jsonResponse(w, status, value)
		})
	}
	a.route("DELETE /api/admin/categories/{id}", func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			TargetID    string `json:"targetId"`
			DeleteSites bool   `json:"deleteSites"`
		}
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if err := a.mutate(func(tx *sql.Tx) error {
			return s.deleteCategory(tx, r.PathValue("id"), input.TargetID, input.DeleteSites)
		}); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("PUT /api/admin/settings", func(w http.ResponseWriter, r *http.Request) error {
		var input Settings
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if err := input.validate(); err != nil {
			return err
		}
		if err := a.mutate(func(tx *sql.Tx) error {
			if _, err := tx.Exec("UPDATE configuration SET settings=? WHERE id=1", marshal(input)); err != nil {
				return err
			}
			return touch(tx)
		}); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("PUT /api/admin/engines", func(w http.ResponseWriter, r *http.Request) error {
		var input []Engine
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if err := validateEngines(input, s.Defaults.Limits.Engines); err != nil {
			return err
		}
		if err := a.mutate(func(tx *sql.Tx) error {
			if _, err := tx.Exec("UPDATE configuration SET engines=? WHERE id=1", marshal(input)); err != nil {
				return err
			}
			return touch(tx)
		}); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("GET /api/admin/applications", func(w http.ResponseWriter, r *http.Request) error {
		status := r.URL.Query().Get("status")
		query := r.URL.Query().Get("q")
		page := 1
		if value := r.URL.Query().Get("page"); value != "" {
			var err error
			page, err = strconv.Atoi(value)
			if err != nil {
				return fail(400, "页码无效")
			}
		}
		if status != "" && !knownStatus(status) || size(query) > 100 || page < 1 || page > 10000 {
			return fail(400, "筛选条件无效")
		}
		value, err := s.listApplications(status, query, page)
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	a.route("POST /api/admin/applications/{id}/review", func(w http.ResponseWriter, r *http.Request) error {
		var input Review
		if err := readJSON(r, &input); err != nil {
			return err
		}
		var value Application
		err := a.mutate(func(tx *sql.Tx) error { var err error; value, err = s.review(tx, r.PathValue("id"), input); return err })
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	a.route("DELETE /api/admin/applications/{id}", func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			ExpectedUpdatedAt string `json:"expectedUpdatedAt" required:"true"`
		}
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if err := a.mutate(func(tx *sql.Tx) error { return s.deleteApplication(tx, r.PathValue("id"), input.ExpectedUpdatedAt) }); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("GET /api/admin/export", func(w http.ResponseWriter, r *http.Request) error {
		pkg, err := s.export()
		if err != nil {
			return err
		}
		w.Header().Set("Content-Disposition", "attachment; filename=\"inav-catalog.json\"")
		return jsonResponse(w, 200, pkg)
	})
	a.route("GET /api/admin/backups", func(w http.ResponseWriter, r *http.Request) error {
		value, err := s.listBackups()
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	a.route("POST /api/admin/backups", func(w http.ResponseWriter, r *http.Request) error {
		a.backupMu.Lock()
		defer a.backupMu.Unlock()
		name, err := s.backup()
		if err != nil {
			return err
		}
		return jsonResponse(w, 201, map[string]string{"name": name})
	})
	a.route("GET /api/admin/backups/{name}", func(w http.ResponseWriter, r *http.Request) error {
		path, err := s.backupPath(r.PathValue("name"))
		if err != nil {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil {
			return err
		}
		w.Header().Set("Content-Disposition", "attachment; filename=\""+info.Name()+"\"")
		w.Header().Set("Content-Type", "application/vnd.sqlite3")
		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
		return nil
	})
	a.route("DELETE /api/admin/backups/{name}", func(w http.ResponseWriter, r *http.Request) error {
		a.backupMu.Lock()
		defer a.backupMu.Unlock()
		path, err := s.backupPath(r.PathValue("name"))
		if err != nil {
			return err
		}
		if err = os.Remove(path); err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("POST /api/admin/import/preview", func(w http.ResponseWriter, r *http.Request) error {
		var pkg Migration
		if err := readJSON(r, &pkg); err != nil {
			return err
		}
		if err := pkg.validate(s.Defaults.Limits); err != nil {
			return err
		}
		_, revision, err := s.settings(s.DB)
		if err != nil {
			return err
		}
		trash := 0
		for _, site := range pkg.Data.Sites {
			if site.DeletedAt != nil {
				trash++
			}
		}
		return jsonResponse(w, 200, map[string]any{"categories": len(pkg.Data.Categories), "sites": len(pkg.Data.Sites) - trash, "trash": trash, "engines": len(pkg.Data.Engines), "applications": len(pkg.Applications), "revision": revision})
	})
	a.route("POST /api/admin/import", a.importHandler)
	a.route("/api/", func(w http.ResponseWriter, r *http.Request) error { return fail(404, "接口不存在") })
	a.staticRoutes()
}
func (s *Store) settings(q queryer) (Settings, string, error) {
	var raw, revision string
	var value Settings
	err := q.QueryRow("SELECT settings,revision FROM configuration WHERE id=1").Scan(&raw, &revision)
	if err == nil {
		err = json.Unmarshal([]byte(raw), &value)
	}
	return value, revision, err
}
func (a *App) authHandler(w http.ResponseWriter, r *http.Request) error {
	action := r.PathValue("action")
	if action == "logout" {
		session, err := a.authenticated(r)
		if err != nil {
			return err
		}
		if _, err = a.Store.DB.Exec("DELETE FROM sessions WHERE token_hash=?", session.TokenHash); err != nil {
			return err
		}
		http.SetCookie(w, &http.Cookie{Name: "inav_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: strings.HasPrefix(a.Store.Config.Origin, "https:"), SameSite: http.SameSiteLaxMode})
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	}
	if action != "setup" && action != "login" {
		return fail(404, "接口不存在")
	}
	key := a.address(r)
	if !a.rateAllowed(a.logins, key, 10, 10000) {
		return fail(429, "登录尝试过多，请稍后重试")
	}
	select {
	case a.authGate <- struct{}{}:
		defer func() { <-a.authGate }()
	default:
		w.Header().Set("Retry-After", "1")
		return fail(429, "正在验证另一个登录，请稍后重试")
	}
	var session IssuedSession
	var err error
	if action == "setup" {
		var input struct {
			Username string `json:"username" required:"true"`
			Password string `json:"password" required:"true"`
			Token    string `json:"token" required:"true"`
		}
		if err = readJSON(r, &input); err == nil {
			session, err = a.Store.setup(input.Username, input.Password, input.Token)
		}
	} else {
		var input struct {
			Username string `json:"username" required:"true"`
			Password string `json:"password" required:"true"`
		}
		if err = readJSON(r, &input); err == nil {
			session, err = a.Store.login(input.Username, input.Password)
		}
	}
	if err != nil {
		return err
	}
	a.rateMu.Lock()
	delete(a.logins, key)
	a.rateMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "inav_session", Value: session.Token, Path: "/", MaxAge: 7 * 24 * 3600, HttpOnly: true, Secure: strings.HasPrefix(a.Store.Config.Origin, "https:"), SameSite: http.SameSiteLaxMode})
	return jsonResponse(w, 200, session)
}
func (a *App) submitHandler(w http.ResponseWriter, r *http.Request) error {
	if !a.rateAllowed(a.submissions, a.address(r), 5, 10000) {
		w.Header().Set("Retry-After", "900")
		return fail(429, "提交过于频繁，请 15 分钟后再试")
	}
	var input Submission
	if err := readJSON(r, &input); err != nil {
		return err
	}
	if err := input.ApplicationInput.validate(); err != nil {
		return err
	}
	if size(input.Website) > 200 || size(input.CaptchaToken) > 4096 {
		return fail(400, "申请字段过长")
	}
	settings, _, err := a.Store.settings(a.Store.DB)
	if err != nil {
		return err
	}
	if !settings.ApplicationsEnabled {
		return fail(403, "当前暂停接收收录申请")
	}
	if input.Website != "" {
		return jsonResponse(w, 202, map[string]bool{"received": true})
	}
	if a.Store.Config.SecretKey != "" {
		if input.CaptchaToken == "" {
			return fail(400, "请先完成验证码")
		}
		select {
		case a.captchaGate <- struct{}{}:
			defer func() { <-a.captchaGate }()
		default:
			return fail(503, "验证服务繁忙，请稍后重试")
		}
		form := url.Values{"secret": {a.Store.Config.SecretKey}, "response": {input.CaptchaToken}}
		request, err := http.NewRequestWithContext(r.Context(), "POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(form.Encode()))
		if err != nil {
			return err
		}
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response, err := a.captchaClient.Do(request)
		if err != nil {
			return fail(503, "验证码服务暂时不可用，请稍后重试")
		}
		defer response.Body.Close()
		var result struct {
			Success  *bool  `json:"success"`
			Hostname string `json:"hostname"`
			Action   string `json:"action"`
		}
		if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result) != nil || result.Success == nil {
			return fail(503, "验证码服务暂时不可用，请稍后重试")
		}
		public, _ := url.Parse(r.Header.Get("Origin"))
		if !*result.Success || result.Hostname != public.Hostname() || result.Action != "submit" {
			return fail(403, "验证码无效，请重新验证")
		}
	}
	if err = a.mutate(func(tx *sql.Tx) error {
		settings, _, err := a.Store.settings(tx)
		if err != nil {
			return err
		}
		if !settings.ApplicationsEnabled {
			return fail(403, "当前暂停接收收录申请")
		}
		return a.Store.submit(tx, input.ApplicationInput)
	}); err != nil {
		return err
	}
	return jsonResponse(w, 202, map[string]bool{"received": true})
}
func (a *App) importHandler(w http.ResponseWriter, r *http.Request) error {
	var input struct {
		Package      Migration `json:"package" required:"true"`
		Mode         string    `json:"mode" required:"true"`
		Revision     string    `json:"revision" required:"true"`
		Confirmation string    `json:"confirmation"`
	}
	if err := readJSON(r, &input); err != nil {
		return err
	}
	if err := input.Package.validate(a.Store.Defaults.Limits); err != nil {
		return err
	}
	if input.Mode != "merge" && input.Mode != "replace" {
		return fail(400, "导入模式无效")
	}
	if input.Mode == "replace" && input.Confirmation != "REPLACE" {
		return fail(400, "请确认覆盖恢复")
	}
	a.writeMu.Lock()
	defer a.writeMu.Unlock()
	_, revision, err := a.Store.settings(a.Store.DB)
	if err != nil {
		return err
	}
	if input.Revision != revision {
		return fail(409, "数据已变化，请重新预览")
	}
	a.maintenance.Store(true)
	defer a.maintenance.Store(false)
	a.backupMu.Lock()
	defer a.backupMu.Unlock()
	backup, err := a.Store.backup()
	if err != nil {
		return err
	}
	report, err := a.Store.importMigration(input.Package, input.Mode)
	if err != nil {
		return err
	}
	if input.Mode == "replace" {
		return jsonResponse(w, 200, map[string]any{"restored": true, "backup": backup})
	}
	data, err := json.Marshal(report)
	if err != nil {
		return err
	}
	var value map[string]any
	json.Unmarshal(data, &value)
	value["backup"] = backup
	return jsonResponse(w, 200, value)
}
func (a *App) scheduler(ctx context.Context) {
	tick := func() {
		a.backupMu.Lock()
		defer a.backupMu.Unlock()
		due, err := a.Store.backupDue()
		if err == nil && due {
			_, err = a.Store.backup()
		}
		if err != nil {
			log.Printf("自动备份失败：%v", err)
		}
	}
	tick()
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			tick()
		}
	}
}
