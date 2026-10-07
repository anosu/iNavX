package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

var buildCommit = "development"

type BackupStatus struct {
	LastAttempt string `json:"lastAttempt"`
	LastSuccess string `json:"lastSuccess"`
	LastError   string `json:"lastError"`
	Name        string `json:"name"`
}

func (s *Store) backupStatus() (BackupStatus, error) {
	var value BackupStatus
	raw, err := os.ReadFile(filepath.Join(s.Config.DataDir, ".backup-status.json"))
	if os.IsNotExist(err) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	err = json.Unmarshal(raw, &value)
	return value, err
}
func (s *Store) recordBackup(name string, backupErr error) {
	value, _ := s.backupStatus()
	value.LastAttempt = now()
	value.LastError = ""
	if backupErr != nil {
		value.LastError = backupErr.Error()
	} else {
		value.LastSuccess = value.LastAttempt
		value.Name = name
	}
	path := filepath.Join(s.Config.DataDir, ".backup-status.json")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(marshal(value)), 0600); err != nil {
		log.Printf("记录备份状态失败：%v", err)
		return
	}
	if err := replaceDatabaseFile(tmp, path); err != nil {
		log.Printf("记录备份状态失败：%v", err)
	}
}
