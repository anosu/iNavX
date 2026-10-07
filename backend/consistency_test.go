package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCatalogMutationRejectsStaleAndMissingRevision(t *testing.T) {
	s := testStore(t)
	a := newApp(s)
	token, err := s.setupToken()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, csrf, revision string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", s.Config.Origin)
		r.Header.Set("X-CSRF-Token", csrf)
		r.Header.Set("If-Match", revision)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		a.ServeHTTP(w, r)
		return w
	}
	w := request("POST", "/api/auth/setup", fmt.Sprintf(`{"username":"admin","password":"test-password-123","token":%q}`, token), "", "", nil)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	var session IssuedSession
	if err = json.Unmarshal(w.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	settings, revision, err := s.settings(s.DB)
	if err != nil {
		t.Fatal(err)
	}
	settings.Name = "First editor"
	w = request("PUT", "/api/admin/settings", marshal(settings), session.CSRF, `"`+revision+`"`, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	settings.Name = "Stale editor"
	for _, item := range []struct {
		revision string
		status   int
	}{{`"` + revision + `"`, 409}, {"", 428}} {
		w = request("PUT", "/api/admin/settings", marshal(settings), session.CSRF, item.revision, cookie)
		if w.Code != item.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	current, _, err := s.settings(s.DB)
	if err != nil || current.Name != "First editor" {
		t.Fatal(current.Name, err)
	}
	catalog, err := s.snapshot(s.DB, true)
	if err != nil {
		t.Fatal(err)
	}
	site := catalog.Sites[0]
	category := catalog.Categories[0]
	for _, operation := range []struct{ method, path, body string }{
		{"POST", "/api/admin/sites", marshal(site.SiteInput)},
		{"PUT", "/api/admin/sites/" + site.ID, marshal(site.SiteInput)},
		{"DELETE", "/api/admin/sites/" + site.ID, "{}"},
		{"POST", "/api/admin/sites/" + site.ID + "/restore", "{}"},
		{"DELETE", "/api/admin/sites/" + site.ID + "/permanent", marshal(map[string]string{"expectedUpdatedAt": site.UpdatedAt})},
		{"POST", "/api/admin/categories", marshal(CategoryInput{Name: "New", Color: "#123456"})},
		{"PUT", "/api/admin/categories/" + category.ID, marshal(CategoryInput{Name: "Changed"})},
		{"DELETE", "/api/admin/categories/" + category.ID, `{"deleteSites":true}`},
		{"PUT", "/api/admin/engines", "[]"},
	} {
		w = request(operation.method, operation.path, operation.body, session.CSRF, `"`+revision+`"`, cookie)
		if w.Code != 409 {
			t.Fatal(operation.path, w.Code, w.Body.String())
		}
	}
	after, err := s.snapshot(s.DB, true)
	if err != nil || marshal(after) != marshal(catalog) {
		t.Fatal("rejected operations changed the catalog", err)
	}
}

func TestCatalogSnapshotIsOneCommittedVersion(t *testing.T) {
	s := testStore(t)
	catalog, err := s.snapshot(s.DB, true)
	if err != nil {
		t.Fatal(err)
	}
	id := catalog.Categories[0].ID
	settings := catalog.Settings
	write := func(value string) error {
		settings.Name = value
		return transaction(s.DB, func(tx *sql.Tx) error {
			if _, err := tx.Exec("UPDATE configuration SET settings=?", marshal(settings)); err != nil {
				return err
			}
			_, err := tx.Exec("UPDATE categories SET name=? WHERE id=?", value, id)
			return err
		})
	}
	if err = write("Version 0"); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		for i := 1; i <= 100; i++ {
			if err := write(fmt.Sprintf("Version %d", i)); err != nil {
				done <- err
				return
			}
		}
		done <- nil
	}()
	for i := 0; i < 100; i++ {
		c, err := s.snapshot(s.DB, true)
		if err != nil {
			t.Fatal(err)
		}
		for _, category := range c.Categories {
			if category.ID == id && category.Name != c.Settings.Name {
				t.Fatalf("mixed versions: %s / %s", category.Name, c.Settings.Name)
			}
		}
	}
	if err = <-done; err != nil {
		t.Fatal(err)
	}
}
