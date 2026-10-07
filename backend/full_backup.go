package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxBackupDatabaseBytes int64 = 512 * 1024 * 1024

type backupEntry struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type backupManifest struct {
	Format    string        `json:"format"`
	Version   int           `json:"version"`
	CreatedAt string        `json:"createdAt"`
	Files     []backupEntry `json:"files"`
}

// Caller holds the application's write lock or the exclusive CLI instance lock.
func (s *Store) fullBackup() (name string, err error) {
	defer func() { s.recordBackup(name, err) }()
	stage, err := os.MkdirTemp(s.Config.BackupDir, ".backup-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage)
	dbPath := filepath.Join(stage, "inav.sqlite")
	if err = backupDatabase(s.DB, dbPath); err != nil {
		return "", err
	}
	if err = validateBackupDatabase(s.Config, stage); err != nil {
		return "", err
	}
	name = "inav-" + time.Now().UTC().Format("2006-01-02T15-04-05.000Z") + "-" + uuid()[:8] + ".zip"
	tmp := filepath.Join(stage, "archive.zip")
	file, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	defer file.Close()
	w := zip.NewWriter(file)
	manifest := backupManifest{Format: "inav-backup", Version: 1, CreatedAt: now(), Files: []backupEntry{}}
	add := func(path, name string) error {
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		defer input.Close()
		info, err := input.Stat()
		if err != nil {
			return err
		}
		limit := int64(s.Defaults.Limits.MediaBytes)
		if name == "inav.sqlite" {
			limit = maxBackupDatabaseBytes
		}
		if !info.Mode().IsRegular() || info.Size() > limit {
			return fmt.Errorf("备份文件无效或超限：%s", name)
		}
		header := &zip.FileHeader{Name: name, Method: zip.Store}
		header.SetMode(0600)
		output, err := w.CreateHeader(header)
		if err != nil {
			return err
		}
		hash := sha256.New()
		size, err := io.Copy(io.MultiWriter(output, hash), io.LimitReader(input, limit+1))
		if err != nil {
			return err
		}
		if size != info.Size() {
			return fmt.Errorf("备份期间文件发生变化：%s", name)
		}
		manifest.Files = append(manifest.Files, backupEntry{name, size, hex.EncodeToString(hash.Sum(nil))})
		return nil
	}
	if err = add(dbPath, "inav.sqlite"); err != nil {
		return "", err
	}
	mediaDir := filepath.Join(s.Config.DataDir, "media")
	entries, err := os.ReadDir(mediaDir)
	if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	if len(entries) > s.Defaults.Limits.MediaFiles {
		return "", fmt.Errorf("媒体数量超限")
	}
	for _, entry := range entries {
		if !mediaNamePattern.MatchString(entry.Name()) || entry.Type()&os.ModeSymlink != 0 || entry.IsDir() {
			return "", fmt.Errorf("媒体目录包含不支持的文件")
		}
		if err = add(filepath.Join(mediaDir, entry.Name()), "media/"+entry.Name()); err != nil {
			return "", err
		}
	}
	output, err := w.Create("manifest.json")
	if err != nil {
		return "", err
	}
	if err = json.NewEncoder(output).Encode(manifest); err != nil {
		return "", err
	}
	if err = w.Close(); err != nil {
		return "", err
	}
	if err = file.Sync(); err != nil {
		return "", err
	}
	if err = file.Close(); err != nil {
		return "", err
	}
	if err = os.Rename(tmp, filepath.Join(s.Config.BackupDir, name)); err != nil {
		return "", err
	}
	if err = s.pruneBackups(); err != nil {
		return name, err
	}
	return name, nil
}

// ZIP names are a closed set, never caller-controlled destination paths.
func unpackFullBackup(c Config, archive string) (stage string, manifest backupManifest, err error) {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return "", manifest, err
	}
	defer reader.Close()
	defaultsRaw, err := os.ReadFile(c.DefaultsPath)
	if err != nil {
		return "", manifest, err
	}
	var defaults Defaults
	if err = json.Unmarshal(defaultsRaw, &defaults); err != nil {
		return "", manifest, err
	}
	if len(reader.File) < 2 || len(reader.File) > defaults.Limits.MediaFiles+2 {
		return "", manifest, fmt.Errorf("备份条目数量无效")
	}
	stage, err = os.MkdirTemp(c.BackupDir, ".verify-")
	if err != nil {
		return "", manifest, err
	}
	defer func() {
		if err != nil {
			os.RemoveAll(stage)
		}
	}()
	actual := map[string]backupEntry{}
	seen := map[string]bool{}
	for _, entry := range reader.File {
		name := entry.Name
		limit := int64(defaults.Limits.MediaBytes)
		switch {
		case name == "manifest.json":
			limit = 1024 * 1024
		case name == "inav.sqlite":
			limit = maxBackupDatabaseBytes
		case strings.HasPrefix(name, "media/") && mediaNamePattern.MatchString(strings.TrimPrefix(name, "media/")):
		default:
			return stage, manifest, fmt.Errorf("备份包含不允许的路径")
		}
		if seen[name] || !entry.Mode().IsRegular() || entry.UncompressedSize64 > uint64(limit) {
			return stage, manifest, fmt.Errorf("备份包含重复、非普通或超限文件")
		}
		seen[name] = true
		input, openErr := entry.Open()
		if openErr != nil {
			return stage, manifest, openErr
		}
		if name == "manifest.json" {
			raw, readErr := io.ReadAll(io.LimitReader(input, limit+1))
			input.Close()
			if readErr != nil {
				return stage, manifest, readErr
			}
			if len(raw) > int(limit) {
				return stage, manifest, fmt.Errorf("备份清单过大")
			}
			if err = strictJSON(raw, &manifest); err != nil {
				return stage, manifest, err
			}
			continue
		}
		dest := filepath.Join(stage, filepath.FromSlash(name))
		if err = os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			input.Close()
			return stage, manifest, err
		}
		output, createErr := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if createErr != nil {
			input.Close()
			return stage, manifest, createErr
		}
		hash := sha256.New()
		size, copyErr := io.Copy(io.MultiWriter(output, hash), io.LimitReader(input, limit+1))
		closeErr := output.Close()
		input.Close()
		if copyErr != nil {
			return stage, manifest, copyErr
		}
		if closeErr != nil {
			return stage, manifest, closeErr
		}
		if size > limit || uint64(size) != entry.UncompressedSize64 {
			return stage, manifest, fmt.Errorf("备份文件大小不符")
		}
		actual[name] = backupEntry{name, size, hex.EncodeToString(hash.Sum(nil))}
	}
	if !seen["manifest.json"] || !seen["inav.sqlite"] || manifest.Format != "inav-backup" || manifest.Version != 1 || !validTime(manifest.CreatedAt) || len(actual) != len(manifest.Files) {
		return stage, manifest, fmt.Errorf("备份格式或清单无效")
	}
	for _, expected := range manifest.Files {
		if value, ok := actual[expected.Name]; !ok || value != expected {
			return stage, manifest, fmt.Errorf("备份校验失败：%s", expected.Name)
		}
		delete(actual, expected.Name)
	}
	if len(actual) != 0 {
		return stage, manifest, fmt.Errorf("备份清单不完整")
	}
	if err = os.MkdirAll(filepath.Join(stage, "media"), 0700); err != nil {
		return stage, manifest, err
	}
	if err = validateBackupDatabase(c, stage); err != nil {
		return stage, manifest, err
	}
	return stage, manifest, nil
}
func validateBackupDatabase(c Config, stage string) error {
	// Validate and migrate only the extracted copy, never the current database.
	temporary := c
	temporary.DataDir = stage
	temporary.DatabasePath = filepath.Join(stage, "inav.sqlite")
	temporary.BackupDir = filepath.Join(stage, "backups")
	temporary.SeedPath = ""
	store, err := openStore(temporary)
	if err != nil {
		return err
	}
	defer store.DB.Close()
	var integrity string
	if err = store.DB.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return fmt.Errorf("数据库完整性校验失败")
	}
	var violations int
	if err = store.DB.QueryRow("SELECT count(*) FROM pragma_foreign_key_check").Scan(&violations); err != nil || violations != 0 {
		return fmt.Errorf("数据库关联校验失败")
	}
	pkg, err := store.export()
	if err != nil {
		return err
	}
	if err = pkg.validate(store.Defaults.Limits); err != nil {
		return err
	}
	if _, err = store.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return err
	}
	return nil
}

func copyRegularFile(source, dest string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("不是普通文件")
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	if copyErr == nil {
		copyErr = output.Sync()
	}
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}
func copyMedia(source, dest string) error {
	entries, err := os.ReadDir(source)
	if os.IsNotExist(err) {
		return os.MkdirAll(dest, 0700)
	}
	if err != nil {
		return err
	}
	if err = os.MkdirAll(dest, 0700); err != nil {
		return err
	}
	for _, entry := range entries {
		if !mediaNamePattern.MatchString(entry.Name()) || entry.IsDir() {
			return fmt.Errorf("媒体目录包含不支持的文件")
		}
		if err = copyRegularFile(filepath.Join(source, entry.Name()), filepath.Join(dest, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

type restoreState struct {
	HadDatabase bool `json:"hadDatabase" required:"true"`
	HadMedia    bool `json:"hadMedia" required:"true"`
}

// A pending marker always rolls back before startup; no partially restored pair is served.
func recoverFullRestore(c Config) error {
	recovery := filepath.Join(c.DataDir, ".restore-recovery")
	raw, err := os.ReadFile(filepath.Join(recovery, "state.json"))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var state restoreState
	if err = strictJSON(raw, &state); err != nil {
		return err
	}
	if state.HadDatabase {
		if err = installBackupDatabase(filepath.Join(recovery, "inav.sqlite"), c.DatabasePath); err != nil {
			return err
		}
	} else {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			if err = os.Remove(c.DatabasePath + suffix); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	media := filepath.Join(c.DataDir, "media")
	if err = os.RemoveAll(media); err != nil {
		return err
	}
	if state.HadMedia {
		if err = copyMedia(filepath.Join(recovery, "media"), media); err != nil {
			return err
		}
	}
	// Remove the commit marker first; leftover recovery copies are harmless.
	if err = os.Remove(filepath.Join(recovery, "state.json")); err != nil {
		return err
	}
	return os.RemoveAll(recovery)
}
func installBackupDatabase(source, dest string) error {
	tmp := dest + ".install"
	defer os.Remove(tmp)
	if err := copyRegularFile(source, tmp); err != nil {
		return err
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		if err := os.Remove(dest + suffix); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return replaceDatabaseFile(tmp, dest)
}
func restoreFullBackup(c Config, path string) error {
	if err := os.MkdirAll(c.BackupDir, 0700); err != nil {
		return err
	}
	if err := recoverFullRestore(c); err != nil {
		return err
	}
	stage, _, err := unpackFullBackup(c, path)
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	recovery := filepath.Join(c.DataDir, ".restore-recovery")
	if err = os.RemoveAll(recovery); err != nil {
		return err
	}
	if err = os.MkdirAll(recovery, 0700); err != nil {
		return err
	}
	state := restoreState{}
	if _, err = os.Stat(c.DatabasePath); err == nil {
		state.HadDatabase = true
		current, err := openStore(c)
		if err != nil {
			return err
		}
		_, backupErr := current.fullBackup()
		if backupErr == nil {
			backupErr = backupDatabase(current.DB, filepath.Join(recovery, "inav.sqlite"))
		}
		current.DB.Close()
		if backupErr != nil {
			return backupErr
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if _, err = os.Stat(filepath.Join(c.DataDir, "media")); err == nil {
		state.HadMedia = true
		if err = copyMedia(filepath.Join(c.DataDir, "media"), filepath.Join(recovery, "media")); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	prepared, err := openSQLite(filepath.Join(stage, "inav.sqlite"), false)
	if err != nil {
		return err
	}
	_, err = prepared.Exec("DELETE FROM sessions")
	if err == nil {
		_, err = prepared.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
	}
	prepared.Close()
	if err != nil {
		return err
	}
	marker := filepath.Join(recovery, "state.json")
	journal, err := os.OpenFile(marker, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = journal.Write([]byte(marshal(state)))
	if err == nil {
		err = journal.Sync()
	}
	closeErr := journal.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	applyErr := installBackupDatabase(filepath.Join(stage, "inav.sqlite"), c.DatabasePath)
	if applyErr == nil {
		applyErr = os.RemoveAll(filepath.Join(c.DataDir, "media"))
	}
	if applyErr == nil {
		applyErr = copyMedia(filepath.Join(stage, "media"), filepath.Join(c.DataDir, "media"))
	}
	if applyErr != nil {
		if rollbackErr := recoverFullRestore(c); rollbackErr != nil {
			return fmt.Errorf("恢复失败：%v；回退待启动重试：%w", applyErr, rollbackErr)
		}
		return applyErr
	}
	if err = os.Remove(marker); err != nil {
		return err
	}
	return os.RemoveAll(recovery)
}
