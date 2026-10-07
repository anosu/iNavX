package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

func instanceLock(c Config, exclusive bool) (*os.File, error) {
	if err := os.MkdirAll(c.DataDir, 0700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(c.DataDir, ".instance.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = lockInstance(file, exclusive); err != nil {
		file.Close()
		return nil, fmt.Errorf("无法获取实例锁，请先停止冲突的服务再执行恢复或迁移: %w", err)
	}
	return file, nil
}
func run() error {
	c, err := loadConfig()
	if err != nil {
		return err
	}
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	if command == "health" {
		client := &http.Client{Timeout: 3 * time.Second}
		response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", c.Port))
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return fmt.Errorf("health: %s", response.Status)
		}
		return nil
	}
	lock, err := instanceLock(c, command == "restore" || command == "backup" || command == "verify-backup" || command == "migrate" || command == "reset-admin")
	if err != nil {
		return err
	}
	defer lock.Close()
	if command == "verify-backup" {
		if len(os.Args) != 3 {
			return fmt.Errorf("用法：verify-backup /path/to/backup.zip")
		}
		if err = os.MkdirAll(c.BackupDir, 0700); err != nil {
			return err
		}
		stage, manifest, err := unpackFullBackup(c, os.Args[2])
		if err != nil {
			return err
		}
		defer os.RemoveAll(stage)
		fmt.Printf("完整备份校验通过：%d 个文件，创建于 %s\n", len(manifest.Files), manifest.CreatedAt)
		return nil
	}
	if command == "restore" {
		path := ""
		if len(os.Args) > 2 {
			path = os.Args[2]
		}
		if filepath.Ext(path) == ".zip" {
			err = restoreFullBackup(c, path)
		} else {
			err = restoreNative(c, path)
		}
		if err != nil {
			return err
		}
		fmt.Println("数据库已恢复，历史会话已失效。请启动服务。")
		return nil
	}
	s, err := openStore(c)
	if err != nil {
		return err
	}
	defer s.DB.Close()
	switch command {
	case "reset-admin":
		if len(os.Args) != 3 || os.Args[2] != "DELETE" {
			return fmt.Errorf("永久删除管理员与全部会话：停止服务后执行 reset-admin DELETE")
		}
		if err = transaction(s.DB, func(tx *sql.Tx) error {
			if _, err := tx.Exec("DELETE FROM sessions"); err != nil {
				return err
			}
			_, err := tx.Exec("DELETE FROM admin")
			return err
		}); err != nil {
			return err
		}
		if err = os.Remove(filepath.Join(c.DataDir, ".setup-token")); err != nil && !os.IsNotExist(err) {
			return err
		}
		fmt.Println("管理员与会话已永久删除。启动服务后重新初始化。")
		return nil
	case "setup-token":
		value, err := s.setupToken()
		if err != nil {
			return err
		}
		fmt.Println(value)
		return nil
	case "backup":
		value, err := s.fullBackup()
		if err != nil {
			return err
		}
		fmt.Println(value)
		return nil
	case "migrate":
		fmt.Println("数据库迁移完成")
		return nil
	case "reset-password":
		password := os.Getenv("ADMIN_PASSWORD")
		if password == "" {
			data, err := io.ReadAll(io.LimitReader(os.Stdin, 4096))
			if err != nil {
				return err
			}
			password = trim(string(data))
		}
		if err = s.resetPassword(password); err != nil {
			return err
		}
		fmt.Println("密码已重置，历史会话已失效")
		return nil
	case "serve":
	default:
		return fmt.Errorf("未知命令：%s", command)
	}
	account, err := s.account(s.DB)
	if err != nil {
		return err
	}
	if account == nil {
		if _, err = s.setupToken(); err != nil {
			return err
		}
		log.Println("管理员尚未初始化。运行 setup-token 命令获取一次性凭据，然后访问 /admin。")
	}
	app := newApp(s)
	server := &http.Server{Addr: net.JoinHostPort(c.Host, fmt.Sprint(c.Port)), Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var background sync.WaitGroup
	background.Add(1)
	go func() { defer background.Done(); app.scheduler(ctx) }()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	finished := make(chan struct{})
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		select {
		case <-signals:
			cancel()
			shutdownCtx, done := context.WithTimeout(context.Background(), 25*time.Second)
			defer done()
			if err := server.Shutdown(shutdownCtx); err != nil {
				log.Printf("shutdown: %v", err)
			}
		case <-finished:
		}
	}()
	log.Printf("iNav Go 服务启动：%s", c.Origin)
	err = server.ListenAndServe()
	close(finished)
	<-shutdownDone
	cancel()
	background.Wait()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}
func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
