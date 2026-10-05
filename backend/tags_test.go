package main

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestApplicationTagsReviewAndRoundTrip(t *testing.T) {
	s := testStore(t)
	mustTx(t, s, func(tx *sql.Tx) error {
		return s.submit(tx, ApplicationInput{Name: "Tags", URL: "https://tags.example/", Tags: []string{" 开源 ", "编辑器", "开源"}})
	})
	list, err := s.listApplications("pending", "Tags", 1)
	if err != nil || len(list.Items) != 1 {
		t.Fatalf("submission: %+v %v", list, err)
	}
	item := list.Items[0]
	if !reflect.DeepEqual(item.Tags, []string{"开源", "编辑器"}) {
		t.Fatalf("tags: %v", item.Tags)
	}
	catalog, err := s.snapshot(s.DB, true)
	if err != nil {
		t.Fatal(err)
	}
	mustTx(t, s, func(tx *sql.Tx) error {
		var err error
		item, err = s.review(tx, item.ID, Review{Action: "approved", ExpectedUpdatedAt: item.UpdatedAt, Site: &SiteInput{Name: item.Name, URL: item.URL, CategoryID: catalog.Categories[0].ID, Tags: []string{"公开标签"}}})
		return err
	})
	site, err := requireSite(s.DB, *item.SiteID)
	if err != nil || !reflect.DeepEqual(site.Tags, []string{"公开标签"}) || !reflect.DeepEqual(item.Tags, []string{"开源", "编辑器"}) {
		t.Fatalf("review: %+v %+v %v", item, site, err)
	}
	pkg, err := s.export()
	if err != nil || pkg.FormatVersion != 4 {
		t.Fatalf("export: %+v %v", pkg, err)
	}
	if _, err = s.importMigration(pkg, "replace"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.importMigration(pkg, "merge"); err != nil {
		t.Fatal(err)
	}
	backup, err := s.backup()
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
	all, err := allApplications(restored.DB)
	if err != nil || len(all) != 1 || !reflect.DeepEqual(all[0].Tags, item.Tags) {
		t.Fatalf("restored tags: %+v %v", all, err)
	}
	for _, version := range []int{2, 3} {
		pkg.FormatVersion = version
		if pkg.validate(s.Defaults.Limits) == nil {
			t.Fatal("old format accepted tags")
		}
		pkg.Applications[0].Tags = nil
		if err = pkg.validate(s.Defaults.Limits); err != nil {
			t.Fatal(err)
		}
		if _, err = s.importMigration(pkg, "replace"); err != nil {
			t.Fatal(err)
		}
		all, err = allApplications(s.DB)
		if err != nil || len(all) != 1 || all[0].Tags == nil || len(all[0].Tags) != 0 {
			t.Fatalf("legacy import: %+v %v", all, err)
		}
		pkg.Applications[0].Tags = item.Tags
	}
}

func TestTagValidation(t *testing.T) {
	for _, raw := range []string{`[""]`, `[" "]`, `["` + strings.Repeat("a", 101) + `"]`, marshal(make([]string, 31)), `null`, `"tag"`} {
		var input Submission
		err := strictJSON([]byte(`{"name":"Tags","url":"https://tags.example/","tags":`+raw+`}`), &input)
		if err == nil {
			err = input.ApplicationInput.validate()
		}
		if err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	var input Submission
	if err := strictJSON([]byte(`{"name":"Old","url":"https://old.example/"}`), &input); err != nil {
		t.Fatal(err)
	}
	if err := input.ApplicationInput.validate(); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(input)
	if !strings.Contains(string(raw), `"tags":[]`) {
		t.Fatalf("missing default: %s", raw)
	}
}
