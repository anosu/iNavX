package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLegacyNodeDatabaseAndURLCompatibility(t *testing.T) {
	s := testStore(t)
	legacy := s.Config
	legacy.DataDir = t.TempDir()
	legacy.DatabasePath = filepath.Join(legacy.DataDir, "inav.sqlite")
	legacy.BackupDir = filepath.Join(legacy.DataDir, "backups")
	db, err := openSQLite(legacy.DatabasePath, false)
	if err != nil {
		t.Fatal(err)
	}
	var journal struct {
		Entries []struct {
			When int64  `json:"when"`
			Tag  string `json:"tag"`
		} `json:"entries"`
	}
	raw, err := os.ReadFile(filepath.Join(legacy.MigrationsDir, "meta/_journal.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &journal); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)"); err != nil {
		t.Fatal(err)
	}
	for _, entry := range journal.Entries[:2] {
		raw, err := os.ReadFile(filepath.Join(legacy.MigrationsDir, entry.Tag+".sql"))
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(raw)
		if _, err = db.Exec(string(raw)); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)", hex.EncodeToString(sum[:]), entry.When); err != nil {
			t.Fatal(err)
		}
	}
	legacyHash := "0123456789abcdef0123456789abcdef:346621ca51601e89d42ce494b34a2f25adff41a0aadd56f661743c9ffec1158072ff246d910defda4c55ee778910a129d677b292794bce6c471edee5cb4ed4b0"
	if _, err = db.Exec("INSERT INTO admin(id,username,password_hash) VALUES(1,'legacy',?)", legacyHash); err != nil {
		t.Fatal(err)
	}
	settings := s.Defaults.Settings
	settings.Name = "Existing custom site"
	if _, err = db.Exec("INSERT INTO categories(id,name,sort_order) VALUES('legacy-category','Renamed legacy category',12)"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("INSERT INTO configuration(id,settings,engines,revision) VALUES(1,?,?,42)", marshal(settings), "[]"); err != nil {
		t.Fatal(err)
	}
	stamp := now()
	if _, err = db.Exec("INSERT INTO applications(id,name,url,normalized_url,description,suggested_category,status,review_note,created_at,updated_at) VALUES('legacy-application','Legacy','https://legacy.example/','https://legacy.example/','','','pending','',?,?)", stamp, stamp); err != nil {
		t.Fatal(err)
	}
	db.Close()
	upgraded, err := openStore(legacy)
	if err != nil {
		t.Fatal(err)
	}
	defer upgraded.DB.Close()
	if _, err = upgraded.login("legacy", "legacy-password-123"); err != nil {
		t.Fatal(err)
	}
	c, err := upgraded.snapshot(upgraded.DB, true)
	if err != nil || c.Settings.Name != settings.Name || c.Revision != "42" || len(c.Sites) != 0 || len(c.Categories) != 1 || c.Categories[0].Color != "" || c.Categories[0].Name != "Renamed legacy category" {
		t.Fatalf("legacy content changed: %+v %v", c, err)
	}
	backups, err := upgraded.listBackups()
	if err != nil || len(backups) != 1 {
		t.Fatalf("upgrade backup missing: %v %v", backups, err)
	}
	apps, err := upgraded.listApplications("pending", "Legacy", 1)
	if err != nil || len(apps.Items) != 1 || apps.Items[0].Tags == nil || len(apps.Items[0].Tags) != 0 {
		t.Fatalf("legacy application tags: %+v %v", apps, err)
	}
	restoredConfig := legacy
	restoredConfig.DataDir = t.TempDir()
	restoredConfig.DatabasePath = filepath.Join(restoredConfig.DataDir, "inav.sqlite")
	restoredConfig.BackupDir = filepath.Join(restoredConfig.DataDir, "backups")
	if err = restoreNative(restoredConfig, filepath.Join(legacy.BackupDir, backups[0].Name)); err != nil {
		t.Fatal(err)
	}
	restored, err := openStore(restoredConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.DB.Close()
	apps, err = restored.listApplications("pending", "Legacy", 1)
	if err != nil || len(apps.Items) != 1 || len(apps.Items[0].Tags) != 0 {
		t.Fatalf("old native backup tags: %+v %v", apps, err)
	}
	for input, want := range map[string]string{" https://EXAMPLE.com:443/Path?q=A#part ": "https://example.com/Path?q=A#part", "https://例子.测试/路径": "https://xn--fsqu00a.xn--0zwm56d/%E8%B7%AF%E5%BE%84", "https://example.com/a/../b": "https://example.com/b", "https://example.com": "https://example.com/"} {
		got, err := normalizeURL(input)
		if err != nil || got != want {
			t.Fatalf("URL %q = %q (%v), want %q", input, got, err, want)
		}
	}
}

func testStore(t *testing.T) *Store {
	t.Helper()
	root, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	// Export uses package metadata relative to the process working directory.
	if err = os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chdir(filepath.Join(root, "backend")) })
	dir := t.TempDir()
	c := Config{DataDir: dir, BackupDir: filepath.Join(dir, "backups"), DatabasePath: filepath.Join(dir, "inav.sqlite"), MigrationsDir: filepath.Join(root, "migrations"), SeedPath: filepath.Join(root, "seed/sites.json"), DefaultsPath: filepath.Join(root, "runtime/defaults.json"), DistDir: filepath.Join(root, "dist"), Origin: "http://localhost:3000", TrustedProxies: map[string]bool{}}
	s, err := openStore(c)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.DB.Close() })
	return s
}
func mustTx(t *testing.T, s *Store, fn func(*sql.Tx) error) {
	t.Helper()
	if err := transaction(s.DB, fn); err != nil {
		t.Fatal(err)
	}
}

// Historical SQLite backups remain a supported input, not a second daily backup mode.
func nativeBackupForTest(s *Store) (string, error) {
	name := "inav-legacy-" + uuid() + ".sqlite"
	return name, backupDatabase(s.DB, filepath.Join(s.Config.BackupDir, name))
}
func status(t *testing.T, err error, want int) {
	t.Helper()
	var api *APIError
	if !errors.As(err, &api) || api.Status != want {
		t.Fatalf("got %v, want status %d", err, want)
	}
}

func TestPermanentDeletionAndEmptyCatalog(t *testing.T) {
	s := testStore(t)
	c, err := s.snapshot(s.DB, true)
	if err != nil {
		t.Fatal(err)
	}
	var site Site
	mustTx(t, s, func(tx *sql.Tx) error {
		var err error
		site, err = s.saveSite(tx, SiteInput{Name: "Test", URL: "https://deletion.example/", CategoryID: c.Categories[0].ID}, "")
		return err
	})
	for _, action := range []string{"pending", "approved", "duplicate", "rejected"} {
		mustTx(t, s, func(tx *sql.Tx) error {
			return s.submit(tx, ApplicationInput{Name: action, URL: "https://" + action + ".example/"})
		})
		list, err := s.listApplications("pending", action, 1)
		if err != nil || len(list.Items) != 1 {
			t.Fatalf("%v %+v", err, list)
		}
		item := list.Items[0]
		if action != "pending" {
			mustTx(t, s, func(tx *sql.Tx) error {
				review := Review{Action: action, ExpectedUpdatedAt: item.UpdatedAt}
				if action == "approved" {
					review.Site = &SiteInput{Name: action, URL: item.URL, CategoryID: c.Categories[0].ID}
				}
				if action == "duplicate" {
					review.SiteID = site.ID
				}
				var err error
				item, err = s.review(tx, item.ID, review)
				return err
			})
		}
		if action == "duplicate" {
			mustTx(t, s, func(tx *sql.Tx) error { return s.setDeleted(tx, site.ID, true) })
			deleted, err := requireSite(s.DB, site.ID)
			if err != nil {
				t.Fatal(err)
			}
			status(t, transaction(s.DB, func(tx *sql.Tx) error { return s.permanentSite(tx, site.ID, "stale") }), 409)
			mustTx(t, s, func(tx *sql.Tx) error { return s.permanentSite(tx, site.ID, deleted.UpdatedAt) })
			item, err = scanApplication(s.DB.QueryRow("SELECT "+applicationColumns+" FROM applications WHERE id=?", item.ID))
			if err != nil || item.SiteID != nil || item.SiteDeletedAt == nil {
				t.Fatalf("unlink: %+v %v", item, err)
			}
			pkg, err := s.export()
			if err != nil {
				t.Fatal(err)
			}
			if err = pkg.validate(s.Defaults.Limits); err != nil {
				t.Fatal(err)
			}
			pkg.FormatVersion = 2
			if pkg.validate(s.Defaults.Limits) == nil {
				t.Fatal("legacy package accepted deleted association")
			}
		}
		status(t, transaction(s.DB, func(tx *sql.Tx) error { return s.deleteApplication(tx, item.ID, "stale") }), 409)
		mustTx(t, s, func(tx *sql.Tx) error { return s.deleteApplication(tx, item.ID, item.UpdatedAt) })
	}
	for _, category := range c.Categories {
		mustTx(t, s, func(tx *sql.Tx) error { return s.deleteCategory(tx, category.ID, "", true) })
	}
	pkg, err := s.export()
	if err != nil {
		t.Fatal(err)
	}
	pkg.Data.Engines = []Engine{}
	if err = pkg.validate(s.Defaults.Limits); err != nil {
		t.Fatal(err)
	}
	if _, err = s.importMigration(pkg, "replace"); err != nil {
		t.Fatal(err)
	}
	s.DB.Close()
	s, err = openStore(s.Config)
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	empty, err := s.snapshot(s.DB, true)
	if err != nil || len(empty.Categories) != 0 || len(empty.Sites) != 0 || len(empty.Engines) != 0 {
		t.Fatalf("empty catalog reseeded: %+v %v", empty, err)
	}
}

func TestHTTPAuthenticationAndBackupRestore(t *testing.T) {
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
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
	cookie := w.Result().Cookies()[0]
	var session IssuedSession
	if err = json.Unmarshal(w.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	if cookie.SameSite != http.SameSiteLaxMode || !cookie.HttpOnly {
		t.Fatal("cookie policy")
	}
	if w = request("PUT", "/api/admin/engines", "[]", "", cookie); w.Code != 403 {
		t.Fatalf("csrf: %d", w.Code)
	}
	if w = request("PUT", "/api/admin/engines", "[]", session.CSRF, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = request("GET", "/api/public/catalog", "", "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	etag := w.Header().Get("ETag")
	r := httptest.NewRequest("GET", "/api/public/catalog", nil)
	r.Header.Set("If-None-Match", etag)
	cached := httptest.NewRecorder()
	a.ServeHTTP(cached, r)
	if cached.Code != 304 {
		t.Fatal("cache validator")
	}
	if w = request("POST", "/api/public/applications", `{"name":"Test","url":"https://submission.example","description":null}`, "", nil); w.Code != 400 {
		t.Fatalf("null accepted: %d %s", w.Code, w.Body)
	}
	name, err := nativeBackupForTest(s)
	if err != nil {
		t.Fatal(err)
	}
	restore := s.Config
	restore.DataDir = t.TempDir()
	restore.DatabasePath = filepath.Join(restore.DataDir, "inav.sqlite")
	restore.BackupDir = filepath.Join(restore.DataDir, "backups")
	if err = restoreNative(restore, filepath.Join(s.Config.BackupDir, name)); err != nil {
		t.Fatal(err)
	}
	restored, err := openStore(restore)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.DB.Close()
	var count int
	restored.DB.QueryRow("SELECT count(*) FROM sessions").Scan(&count)
	if count != 0 {
		t.Fatal("restored sessions not revoked")
	}
	if _, err = restored.login("admin", "test-password-123"); err != nil {
		t.Fatal(err)
	}
	if w = request("DELETE", "/api/admin/backups/"+name, "{}", session.CSRF, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if _, err = s.backupPath(name); err == nil {
		t.Fatal("backup still exists")
	}
}

func TestTenThousandSitesAndFutureDatabase(t *testing.T) {
	s := testStore(t)
	pkg, err := s.export()
	if err != nil {
		t.Fatal(err)
	}
	pkg.Applications = []Application{}
	pkg.Data.Sites = []Site{}
	for i := 0; i < 10000; i++ {
		pkg.Data.Sites = append(pkg.Data.Sites, Site{SiteInput: SiteInput{Name: fmt.Sprint(i), URL: fmt.Sprintf("https://bulk.example/%d", i), CategoryID: pkg.Data.Categories[0].ID, Tags: []string{}}, ID: fmt.Sprintf("bulk-%d", i), CreatedAt: now(), UpdatedAt: now()})
	}
	if err = pkg.validate(s.Defaults.Limits); err != nil {
		t.Fatal(err)
	}
	if _, err = s.importMigration(pkg, "replace"); err != nil {
		t.Fatal(err)
	}
	report, err := s.importMigration(pkg, "merge")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(report)
	if !strings.Contains(string(raw), `"skipped":10000`) {
		t.Fatalf("repeat merge: %s", raw)
	}
	if _, err = s.DB.Exec("UPDATE __drizzle_migrations SET created_at=9999999999999 WHERE id=(SELECT max(id) FROM __drizzle_migrations)"); err != nil {
		t.Fatal(err)
	}
	if err = s.migrate(); err == nil {
		t.Fatal("future database accepted")
	}
}

func TestReviewTransactionAndIdempotency(t *testing.T) {
	s := testStore(t)
	c, err := s.snapshot(s.DB, true)
	if err != nil {
		t.Fatal(err)
	}
	mustTx(t, s, func(tx *sql.Tx) error {
		return s.submit(tx, ApplicationInput{Name: "Review", URL: "https://review.example/"})
	})
	list, err := s.listApplications("pending", "Review", 1)
	if err != nil {
		t.Fatal(err)
	}
	item := list.Items[0]
	review := Review{Action: "approved", ExpectedUpdatedAt: item.UpdatedAt, Site: &SiteInput{Name: "Approved", URL: c.Sites[0].URL, CategoryID: c.Categories[0].ID}}
	status(t, transaction(s.DB, func(tx *sql.Tx) error { _, err := s.review(tx, item.ID, review); return err }), 409)
	unchanged, err := scanApplication(s.DB.QueryRow("SELECT "+applicationColumns+" FROM applications WHERE id=?", item.ID))
	if err != nil || unchanged.Status != "pending" {
		t.Fatal("failed approval changed application")
	}
	review.Site.URL = "https://review.example/"
	var approved Application
	mustTx(t, s, func(tx *sql.Tx) error { var err error; approved, err = s.review(tx, item.ID, review); return err })
	mustTx(t, s, func(tx *sql.Tx) error {
		again, err := s.review(tx, item.ID, review)
		if err == nil && (again.SiteID == nil || *again.SiteID != *approved.SiteID) {
			t.Fatal("approval not idempotent")
		}
		return err
	})
	review.Action = "rejected"
	review.Site = nil
	status(t, transaction(s.DB, func(tx *sql.Tx) error { _, err := s.review(tx, item.ID, review); return err }), 409)
	if approved.UpdatedAt == item.UpdatedAt {
		t.Fatal("review did not advance update timestamp")
	}
}
