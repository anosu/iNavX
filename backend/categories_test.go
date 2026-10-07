package main

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestCategoryColorRoundTrip(t *testing.T) {
	s := testStore(t)
	var category Category
	mustTx(t, s, func(tx *sql.Tx) error {
		var err error
		category, err = s.saveCategory(tx, CategoryInput{Name: "Custom category", Color: "#12aBcF"}, "")
		return err
	})
	id := category.ID
	mustTx(t, s, func(tx *sql.Tx) error {
		var err error
		category, err = s.saveCategory(tx, CategoryInput{Name: "Renamed category", SortOrder: 15, Color: category.Color}, id)
		return err
	})
	check := func(store *Store) {
		t.Helper()
		w := httptest.NewRecorder()
		newApp(store).ServeHTTP(w, httptest.NewRequest("GET", "/api/public/catalog", nil))
		var catalog Catalog
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &catalog) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, item := range catalog.Categories {
			if item.ID == id {
				if item != category {
					t.Fatalf("category changed: %+v != %+v", item, category)
				}
				return
			}
		}
		t.Fatal("category missing")
	}
	check(s)
	pkg, err := s.export()
	if err != nil || pkg.FormatVersion != 5 {
		t.Fatal(pkg.FormatVersion, err)
	}
	if _, err = s.importMigration(pkg, "replace"); err != nil {
		t.Fatal(err)
	}
	check(s)
	// Merge must preserve the existing category's customization.
	for i := range pkg.Data.Categories {
		if pkg.Data.Categories[i].ID == id {
			pkg.Data.Categories[i].Color = "#ffffff"
		}
	}
	if _, err = s.importMigration(pkg, "merge"); err != nil {
		t.Fatal(err)
	}
	check(s)
	backup, err := nativeBackupForTest(s)
	if err != nil {
		t.Fatal(err)
	}
	c := s.Config
	c.DataDir = t.TempDir()
	c.DatabasePath = filepath.Join(c.DataDir, "inav.sqlite")
	c.BackupDir = filepath.Join(c.DataDir, "backups")
	if err = restoreNative(c, filepath.Join(s.Config.BackupDir, backup)); err != nil {
		t.Fatal(err)
	}
	restored, err := openStore(c)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.DB.Close()
	check(restored)
	for _, version := range []int{1, 2, 3, 4} {
		pkg.FormatVersion = version
		if pkg.validate(s.Defaults.Limits) == nil {
			t.Fatal("old package accepted color")
		}
	}
	for i := range pkg.Data.Categories {
		pkg.Data.Categories[i].Color = ""
	}
	if _, err = s.importMigration(pkg, "replace"); err != nil {
		t.Fatal(err)
	}
}

func TestCategoryColorValidation(t *testing.T) {
	var legacy CategoryInput
	if err := strictJSON([]byte(`{"name":"Legacy","sortOrder":0}`), &legacy); err != nil || legacy.Color != "" {
		t.Fatal(legacy, err)
	}
	for _, color := range []string{"", "#000000", "#aBcDeF"} {
		v := CategoryInput{Name: "Valid", Color: color}
		if err := v.validate(); err != nil {
			t.Fatal(color, err)
		}
	}
	for _, color := range []string{"red", "#abc", "#12345678", "url(https://example.test)", "#123456;display:none", "#000000\n"} {
		v := CategoryInput{Name: "Invalid", Color: color}
		if v.validate() == nil {
			t.Fatal("accepted", color)
		}
	}
}
