package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPresentationCompatibilityAndValidation(t *testing.T) {
	s := testStore(t)
	settings, _, err := s.settings(s.DB)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err = json.Unmarshal([]byte(marshal(settings)), &raw); err != nil {
		t.Fatal(err)
	}
	delete(raw, "presentation")
	var old Settings
	if err = json.Unmarshal([]byte(marshal(raw)), &old); err != nil {
		t.Fatal(err)
	}
	if !old.Presentation.ShowClock || old.Presentation.SearchPlaceholder != "搜索站点..." || old.Presentation.FooterLinks == nil {
		t.Fatal("legacy defaults missing")
	}
	old.Presentation.FooterLinks = []FooterLink{{"unsafe", "javascript:alert(1)"}}
	if old.validate() == nil {
		t.Fatal("accepted unsafe footer URL")
	}
	settings.Presentation.Author = `Owner <script>`
	settings.Presentation.FaviconURL = "/media/icon.svg"
	settings.Presentation.TouchIconURL = "/media/touch.png"
	settings.Presentation.ShareImageURL = "https://external.test/share.png"
	icon, extra := presentationHead(settings, "https://example.test")
	if !strings.Contains(icon, "https://example.test/media/icon.svg") || strings.Contains(extra, "external.test") {
		t.Fatal(icon, extra)
	}
	settings.RemoteImagesEnabled = true
	_, extra = presentationHead(settings, "https://example.test")
	if !strings.Contains(extra, "og:image") || !strings.Contains(extra, "external.test") {
		t.Fatal(extra)
	}
}

func TestMediaAuthenticationUploadReadDelete(t *testing.T) {
	s := testStore(t)
	a := newApp(s)
	token, err := s.setupToken()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, csrf string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", s.Config.Origin)
		r.Header.Set("X-CSRF-Token", csrf)
		_, revision, revisionErr := s.settings(s.DB)
		if revisionErr != nil {
			t.Fatal(revisionErr)
		}
		if method != "GET" {
			r.Header.Set("If-Match", `"`+revision+`"`)
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	w := request("POST", "/api/auth/setup", fmt.Sprintf(`{"username":"admin","password":"test-password-123","token":%q}`, token), "", nil)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	var session IssuedSession
	if err = json.Unmarshal(w.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1L20 20" stroke="red"/></svg>`
	body := marshal(map[string]string{"data": base64.StdEncoding.EncodeToString([]byte(svg))})
	if w = request("POST", "/api/admin/media", body, "", nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w = request("POST", "/api/admin/media", body, "", cookie); w.Code != 403 {
		t.Fatal(w.Code)
	}
	w = request("POST", "/api/admin/media", body, session.CSRF, cookie)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var item MediaFile
	if err = json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	settings, _, err := s.settings(s.DB)
	if err != nil {
		t.Fatal(err)
	}
	settings.Presentation.FaviconURL = item.URL
	settings.Presentation.ShareImageURL = item.URL
	settings.Presentation.Author = `Owner <script>`
	settings.Presentation.FooterText = "Custom footer"
	if saved := request("PUT", "/api/admin/settings", marshal(settings), session.CSRF, cookie); saved.Code != 200 {
		t.Fatal(saved.Body.String())
	}
	s.Config.DistDir = t.TempDir()
	if err = os.WriteFile(filepath.Join(s.Config.DistDir, "index.html"), []byte(`<html><head><title>Old</title><meta name="author" content="Old" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /></head></html>`), 0600); err != nil {
		t.Fatal(err)
	}
	page := request("GET", "/", "", "", nil)
	if page.Code != 200 || !strings.Contains(page.Body.String(), `Owner &lt;script&gt;`) || !strings.Contains(page.Body.String(), `rel="icon" href="`+s.Config.Origin+item.URL) || !strings.Contains(page.Body.String(), `property="og:image"`) {
		t.Fatal(page.Body.String())
	}
	if !mediaNamePattern.MatchString(item.Name) {
		t.Fatal(item.Name)
	}
	w = request("GET", item.URL, "", "", nil)
	if w.Code != 200 || w.Body.String() != svg || w.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal(w.Code, w.Header())
	}
	w = request("GET", "/api/admin/media", "", "", cookie)
	if w.Code != 200 || !strings.Contains(w.Body.String(), item.Name) {
		t.Fatal(w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "浏览器图标") || !strings.Contains(w.Body.String(), "分享封面") {
		t.Fatal("missing media references", w.Body.String())
	}
	if w = request("DELETE", "/api/admin/media/"+item.Name, "{}", session.CSRF, cookie); w.Code != 409 {
		t.Fatal("referenced media deleted without acknowledgement", w.Body.String())
	}
	if w = request("DELETE", "/api/admin/media/"+item.Name, `{"allowReferenced":true}`, session.CSRF, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = request("GET", item.URL, "", "", nil); w.Code != 404 {
		t.Fatal(w.Code)
	}
	for _, bad := range []string{`<svg><script>alert(1)</script></svg>`, `<svg onload="alert(1)"></svg>`, `<!DOCTYPE svg><svg/>`, `<svg><use href="https://evil.test"/></svg>`, `<html>bad</html>`, `<svg xmlns="http://www.w3.org/1999/xhtml"/>`} {
		if _, err = imageExtension([]byte(bad), s.Defaults.Limits.MediaBytes); err == nil {
			t.Fatal("accepted active image", bad)
		}
	}
	if _, err = imageExtension(make([]byte, s.Defaults.Limits.MediaBytes+1), s.Defaults.Limits.MediaBytes); err == nil {
		t.Fatal("accepted oversized image")
	}
}
