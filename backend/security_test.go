package main

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHTTPOriginLimitsAndPrivateApplications(t *testing.T) {
	s := testStore(t)
	s.Config.PublicOrigin = "https://public.example"
	s.Config.TrustedProxies["192.0.2.1"] = true
	a := newApp(s)
	request := func(method, path, body, origin, remote, realIP string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json; charset=utf-8")
		r.Header.Set("X-Real-IP", realIP)
		r.RemoteAddr = remote
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	body := `{"name":"Private request","url":"https://private.example/"}`
	if w := request("POST", "/api/public/applications", body, "https://evil.example", "192.0.2.2:1000", ""); w.Code != 403 {
		t.Fatalf("origin: %d", w.Code)
	}
	if w := request("OPTIONS", "/api/public/applications", "", s.Config.PublicOrigin, "192.0.2.2:1000", ""); w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != s.Config.PublicOrigin {
		t.Fatalf("preflight: %d %v", w.Code, w.Header())
	}
	for i := 0; i < 5; i++ {
		if w := request("POST", "/api/public/applications", body, s.Config.PublicOrigin, "192.0.2.2:1000", "203.0.113.1"); w.Code != 202 {
			t.Fatalf("submission: %d %s", w.Code, w.Body)
		}
	}
	if w := request("POST", "/api/public/applications", body, s.Config.PublicOrigin, "192.0.2.2:1000", "203.0.113.2"); w.Code != 429 {
		t.Fatal("untrusted IP header bypassed rate limit")
	}
	if w := request("POST", "/api/public/applications", body, s.Config.PublicOrigin, "192.0.2.1:1000", "203.0.113.2"); w.Code != 202 {
		t.Fatalf("trusted IP: %d %s", w.Code, w.Body)
	}
	var count int
	s.DB.QueryRow("SELECT count(*) FROM applications").Scan(&count)
	if count != 1 {
		t.Fatal("pending duplicate created")
	}
	if w := request("GET", "/api/public/catalog", "", "", "192.0.2.1:1000", ""); strings.Contains(w.Body.String(), "Private request") {
		t.Fatal("application leaked")
	}
	if w := request("GET", "/api/admin/applications", "", "", "192.0.2.1:1000", ""); w.Code != 401 {
		t.Fatal("private list exposed")
	}
	if w := request("POST", "/api/public/applications", `{"name":"large","url":"https://large.example/","description":"`+strings.Repeat("x", 8192)+`"}`, s.Config.Origin, "192.0.2.3:1000", ""); w.Code != 413 {
		t.Fatalf("body limit: %d", w.Code)
	}
	if w := request("POST", "/api/auth/login", strings.Repeat("x", 8193), s.Config.Origin, "192.0.2.3:1000", ""); w.Code != 413 {
		t.Fatalf("auth body limit: %d", w.Code)
	}
	a.authGate <- struct{}{}
	if w := request("POST", "/api/auth/login", `{"username":"admin","password":"test-password-123"}`, s.Config.Origin, "192.0.2.4:1000", ""); w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal("parallel scrypt not bounded")
	}
	<-a.authGate
	settings := s.Defaults.Settings
	settings.BackupIntervalHours = 0
	mustTx(t, s, func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE configuration SET settings=?", marshal(settings))
		return err
	})
	if due, err := s.backupDue(); err != nil || due {
		t.Fatalf("disabled backup due: %v %v", due, err)
	}
}

func TestStaticMetadataAndStrictJSON(t *testing.T) {
	s := testStore(t)
	s.Config.DistDir = t.TempDir()
	os.MkdirAll(filepath.Join(s.Config.DistDir, "icons"), 0700)
	os.WriteFile(filepath.Join(s.Config.DistDir, "icons/test.svg"), []byte("<svg/>"), 0600)
	os.WriteFile(filepath.Join(s.Config.DistDir, "index.html"), []byte(`<html><head><title>Default</title><meta name="description" content="Default" /></head></html>`), 0600)
	settings := s.Defaults.Settings
	settings.Name = `</title><script>alert(1)</script>`
	settings.Description = `"<&`
	mustTx(t, s, func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE configuration SET settings=?", marshal(settings))
		return err
	})
	a := newApp(s)
	for path, want := range map[string]int{"/": 200, "/admin": 200, "/icons/test.svg": 200, "/icons/missing.svg": 404, "/assets/missing.js": 404, "/api/missing": 404} {
		w := httptest.NewRecorder()
		a.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != want {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body)
		}
		if path == "/" && strings.Contains(w.Body.String(), settings.Name) {
			t.Fatal("HTML/script metadata not escaped")
		}
	}
	var input SiteInput
	for _, body := range []string{`null`, `{"name":"x","url":"https://example.com"}`, `{"name":"x","url":"https://example.com","categoryId":"cat","pinned":null}`, `{"name":"x","url":"https://example.com","categoryId":"cat","unknown":true}`, `{"name":"x","url":"https://example.com","categoryId":"cat"} {}`} {
		if strictJSON([]byte(body), &input) == nil {
			t.Fatalf("accepted invalid JSON %s", body)
		}
	}
	for _, version := range []int{1, 2, 3} {
		pkg, err := s.export()
		if err != nil {
			t.Fatal(err)
		}
		pkg.FormatVersion = version
		raw, _ := json.Marshal(pkg)
		var parsed Migration
		if err = strictJSON(raw, &parsed); err != nil {
			t.Fatal(err)
		}
		if err = parsed.validate(s.Defaults.Limits); err != nil {
			t.Fatal(err)
		}
	}
}
