package main

import (
	"path/filepath"
	"testing"
)

func TestSQLitePathsAndBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "数据 # %.sqlite")
	db, err := openSQLite(path, false)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec("CREATE TABLE path_test(value TEXT); INSERT INTO path_test VALUES('preserved')"); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(dir, "备份 # %.sqlite")
	if err = backupDatabase(db, backup); err != nil {
		t.Fatal(err)
	}
	copy, err := openSQLite(backup, true)
	if err != nil {
		t.Fatal(err)
	}
	defer copy.Close()
	var value string
	if err = copy.QueryRow("SELECT value FROM path_test").Scan(&value); err != nil || value != "preserved" {
		t.Fatalf("backup data = %q, error = %v", value, err)
	}
	if _, err = copy.Exec("DELETE FROM path_test"); err == nil {
		t.Fatal("readonly backup must reject writes")
	}
}
