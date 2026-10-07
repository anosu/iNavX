package main

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestFullBackupRestoresDatabaseAndMedia(t *testing.T) {
	s := testStore(t)
	name := "12345678-1234-4234-8234-123456789abc.svg"
	media := filepath.Join(s.Config.DataDir, "media")
	if err := os.MkdirAll(media, 0700); err != nil {
		t.Fatal(err)
	}
	image := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>`)
	if err := os.WriteFile(filepath.Join(media, name), image, 0600); err != nil {
		t.Fatal(err)
	}
	backup, err := s.fullBackup()
	if err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(s.Config.BackupDir, backup)
	stage, manifest, err := unpackFullBackup(s.Config, archive)
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Files) != 2 {
		t.Fatal(manifest)
	}
	os.RemoveAll(stage)
	// Repackage a modified media file with the original manifest: checksum verification must fail.
	reader, err := zip.OpenReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	badPath := filepath.Join(t.TempDir(), "tampered.zip")
	badFile, err := os.Create(badPath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(badFile)
	for _, entry := range reader.File {
		input, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(input)
		input.Close()
		if err != nil {
			t.Fatal(err)
		}
		if entry.Name == "media/"+name {
			content[0] ^= 1
		}
		output, err := writer.Create(entry.Name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = output.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	writer.Close()
	badFile.Close()
	reader.Close()
	if stage, _, err = unpackFullBackup(s.Config, badPath); err == nil {
		os.RemoveAll(stage)
		t.Fatal("accepted changed media with the original checksum")
	}
	c := s.Config
	c.DataDir = t.TempDir()
	c.DatabasePath = filepath.Join(c.DataDir, "inav.sqlite")
	c.BackupDir = filepath.Join(c.DataDir, "backups")
	// Replace an initialized target, so both the backup-before-restore and recovery path are exercised.
	target, err := openStore(c)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = target.DB.Exec("UPDATE categories SET color='#123456'"); err != nil {
		t.Fatal(err)
	}
	target.DB.Close()
	if err = restoreFullBackup(c, archive); err != nil {
		t.Fatal(err)
	}
	restored, err := openStore(c)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.DB.Close()
	bytes, err := os.ReadFile(filepath.Join(c.DataDir, "media", name))
	if err != nil || string(bytes) != string(image) {
		t.Fatal(string(bytes), err)
	}
	var customized int
	if err = restored.DB.QueryRow("SELECT count(*) FROM categories WHERE color<>''").Scan(&customized); err != nil || customized != 0 {
		t.Fatal(customized, err)
	}
	if _, err = os.Stat(filepath.Join(c.DataDir, ".restore-recovery")); !os.IsNotExist(err) {
		t.Fatal("recovery state not cleaned", err)
	}
}

func TestFullBackupRejectsUnsafeOrIncompleteArchives(t *testing.T) {
	s := testStore(t)
	for _, name := range []string{"../escape", "media/../../escape", "media/not-a-managed-file.svg", "inav.sqlite"} {
		path := filepath.Join(t.TempDir(), "bad.zip")
		file, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		writer := zip.NewWriter(file)
		out, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		out.Write([]byte("invalid"))
		out, err = writer.Create("manifest.json")
		if err != nil {
			t.Fatal(err)
		}
		out.Write([]byte(`{"format":"inav-backup","version":1,"createdAt":"2026-10-07T00:00:00.000Z","files":[]}`))
		writer.Close()
		file.Close()
		if stage, _, err := unpackFullBackup(s.Config, path); err == nil {
			os.RemoveAll(stage)
			t.Fatal("accepted", name)
		}
	}
}

func TestInterruptedFullRestoreRollsBackBeforeServing(t *testing.T) {
	s := testStore(t)
	c := s.Config
	recovery := filepath.Join(c.DataDir, ".restore-recovery")
	if err := os.MkdirAll(filepath.Join(recovery, "media"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := backupDatabase(s.DB, filepath.Join(recovery, "inav.sqlite")); err != nil {
		t.Fatal(err)
	}
	name := "12345678-1234-4234-8234-123456789abc.svg"
	if err := os.WriteFile(filepath.Join(recovery, "media", name), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec("UPDATE categories SET color='#abcdef'"); err != nil {
		t.Fatal(err)
	}
	s.DB.Close()
	if err := os.WriteFile(filepath.Join(recovery, "state.json"), []byte(marshal(restoreState{true, true})), 0600); err != nil {
		t.Fatal(err)
	}
	recovered, err := openStore(c)
	if err != nil {
		t.Fatal(err)
	}
	defer recovered.DB.Close()
	var count int
	if err = recovered.DB.QueryRow("SELECT count(*) FROM categories WHERE color<>''").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
	content, err := os.ReadFile(filepath.Join(c.DataDir, "media", name))
	if err != nil || string(content) != "original" {
		t.Fatal(string(content), err)
	}
}
