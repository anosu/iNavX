package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

var backupPattern = regexp.MustCompile(`^inav-[\w.-]+\.sqlite$`)

type DatabaseBackup struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func (s *Store) export() (Migration, error) {
	value := Migration{Format: "inav-catalog", FormatVersion: 4, ExportedAt: now()}
	var pkg struct {
		Version string `json:"version"`
	}
	data, err := os.ReadFile("package.json")
	if err != nil {
		return value, err
	}
	if err = json.Unmarshal(data, &pkg); err != nil {
		return value, err
	}
	value.AppVersion = pkg.Version
	err = transaction(s.DB, func(tx *sql.Tx) error {
		var err error
		value.Data, err = s.snapshot(tx, true)
		if err != nil {
			return err
		}
		value.Applications, err = allApplications(tx)
		return err
	})
	return value, err
}
func (s *Store) listBackups() ([]DatabaseBackup, error) {
	values := []DatabaseBackup{}
	entries, err := os.ReadDir(s.Config.BackupDir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.Type().IsRegular() || !backupPattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		values = append(values, DatabaseBackup{entry.Name(), info.Size()})
	}
	sort.Slice(values, func(i, j int) bool { return values[i].Name > values[j].Name })
	return values, nil
}
func (s *Store) backup() (string, error) {
	name := "inav-" + time.Now().UTC().Format("2006-01-02T15-04-05.000Z") + "-" + uuid()[:8] + ".sqlite"
	path := filepath.Join(s.Config.BackupDir, name)
	if err := backupDatabase(s.DB, path); err != nil {
		return "", err
	}
	backups, err := s.listBackups()
	if err != nil {
		return "", err
	}
	var settingsRaw string
	if err = s.DB.QueryRow("SELECT settings FROM configuration WHERE id=1").Scan(&settingsRaw); err != nil {
		return "", err
	}
	var settings Settings
	if err = json.Unmarshal([]byte(settingsRaw), &settings); err != nil {
		return "", err
	}
	for _, old := range backups[min(settings.BackupKeep, len(backups)):] {
		if err = os.Remove(filepath.Join(s.Config.BackupDir, old.Name)); err != nil {
			return "", err
		}
	}
	return name, nil
}
func (s *Store) backupPath(name string) (string, error) {
	if !backupPattern.MatchString(name) || filepath.Base(name) != name {
		return "", fail(400, "备份文件名无效")
	}
	path := filepath.Join(s.Config.BackupDir, name)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", fail(404, "备份不存在")
	}
	return path, nil
}
func restoreNative(c Config, sourcePath string) error {
	if sourcePath == "" {
		return fmt.Errorf("用法：restore /path/to/backup.sqlite；操作前必须停止服务")
	}
	for _, dir := range []string{c.DataDir, c.BackupDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return err
		}
	}
	source, err := openSQLite(absolute(sourcePath), true)
	if err != nil {
		return err
	}
	defer source.Close()
	var integrity string
	if err = source.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return fmt.Errorf("备份完整性检查失败")
	}
	temp := filepath.Join(c.DataDir, ".restore-"+uuid()+".sqlite")
	defer func() {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			os.Remove(temp + suffix)
		}
	}()
	if err = backupDatabase(source, temp); err != nil {
		return err
	}
	temporary := c
	temporary.DatabasePath = temp
	temporary.SeedPath = ""
	store, err := openStore(temporary)
	if err != nil {
		return err
	}
	closed := false
	defer func() {
		if !closed {
			store.DB.Close()
		}
	}()
	pkg, err := store.export()
	if err != nil {
		return err
	}
	if err = pkg.validate(store.Defaults.Limits); err != nil {
		return err
	}
	var foreignKeyViolations int
	rows, err := store.DB.Query("PRAGMA foreign_key_check")
	if err != nil {
		return err
	}
	for rows.Next() {
		foreignKeyViolations++
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if foreignKeyViolations > 0 {
		return fmt.Errorf("备份关联数据无效")
	}
	if _, err = os.Stat(c.DatabasePath); err == nil {
		current, err := openSQLite(c.DatabasePath, false)
		if err != nil {
			return err
		}
		backupErr := backupDatabase(current, filepath.Join(c.BackupDir, "inav-"+time.Now().UTC().Format("2006-01-02T15-04-05.000Z")+"-before-restore.sqlite"))
		if backupErr == nil {
			_, backupErr = current.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
		}
		current.Close()
		if backupErr != nil {
			return backupErr
		}
	}
	if _, err = store.DB.Exec("DELETE FROM sessions"); err != nil {
		return err
	}
	if _, err = store.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return err
	}
	if err = store.DB.Close(); err != nil {
		return err
	}
	closed = true
	for _, suffix := range []string{"-wal", "-shm"} {
		if err = os.Remove(c.DatabasePath + suffix); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	if err = os.Rename(temp, c.DatabasePath); err != nil {
		return err
	}
	directory, err := os.Open(c.DataDir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
func (s *Store) backupDue() (bool, error) {
	backups, err := s.listBackups()
	if err != nil {
		return false, err
	}
	var raw string
	if err = s.DB.QueryRow("SELECT settings FROM configuration WHERE id=1").Scan(&raw); err != nil {
		return false, err
	}
	var settings Settings
	if err = json.Unmarshal([]byte(raw), &settings); err != nil {
		return false, err
	}
	if settings.BackupIntervalHours == 0 {
		return false, nil
	}
	if len(backups) == 0 {
		return true, nil
	}
	info, err := os.Stat(filepath.Join(s.Config.BackupDir, backups[0].Name))
	if err != nil {
		return false, err
	}
	return time.Since(info.ModTime()) >= time.Duration(settings.BackupIntervalHours)*time.Hour, nil
}
func knownStatus(status string) bool {
	return status == "pending" || status == "approved" || status == "rejected" || status == "duplicate"
}
