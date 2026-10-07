package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	sqlite "github.com/mattn/go-sqlite3"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Store struct {
	DB       *sql.DB
	Config   Config
	Defaults Defaults
}
type queryer interface {
	Exec(string, ...any) (sql.Result, error)
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}

func uuid() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func sqliteFileURL(path string) (url.URL, error) {
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return url.URL{}, err
	}
	uriPath := filepath.ToSlash(absolutePath)
	if !strings.HasPrefix(uriPath, "/") {
		uriPath = "/" + uriPath
	}
	return url.URL{Scheme: "file", Path: uriPath}, nil
}
func openSQLite(path string, readonly bool) (*sql.DB, error) {
	u, err := sqliteFileURL(path)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("_busy_timeout", "5000")
	q.Set("_foreign_keys", "on")
	q.Set("_cache_size", "-1024")
	if readonly {
		q.Set("mode", "ro")
	} else {
		q.Set("_journal_mode", "WAL")
		q.Set("_synchronous", "FULL")
		q.Set("_txlock", "immediate")
	}
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite3", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err = db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
func transaction(db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
func openStore(c Config) (*Store, error) {
	if err := recoverFullRestore(c); err != nil {
		return nil, fmt.Errorf("恢复未完成，拒绝启动：%w", err)
	}
	for _, dir := range []string{c.DataDir, c.BackupDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, err
		}
	}
	s := &Store{Config: c}
	data, err := os.ReadFile(c.DefaultsPath)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(data, &s.Defaults); err != nil {
		return nil, err
	}
	if s.Defaults.Limits.Sites < 1 || s.Defaults.Limits.PageSize < 1 {
		return nil, fmt.Errorf("运行默认配置缺少容量限制")
	}
	s.DB, err = openSQLite(c.DatabasePath, false)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			s.DB.Close()
		}
	}()
	if err = s.migrate(); err != nil {
		return nil, err
	}
	if err = s.seed(); err != nil {
		return nil, err
	}
	if err = os.Chmod(c.DatabasePath, 0600); err != nil {
		return nil, err
	}
	ok = true
	return s, nil
}
func (s *Store) migrate() error {
	var journal struct {
		Entries []struct {
			When int64  `json:"when"`
			Tag  string `json:"tag"`
		} `json:"entries"`
	}
	data, err := os.ReadFile(filepath.Join(s.Config.MigrationsDir, "meta/_journal.json"))
	if err != nil {
		return err
	}
	if err = json.Unmarshal(data, &journal); err != nil {
		return err
	}
	if len(journal.Entries) == 0 {
		return fmt.Errorf("迁移日志为空")
	}
	var exists int
	if err = s.DB.QueryRow("SELECT count(*) FROM sqlite_master WHERE name='__drizzle_migrations'").Scan(&exists); err != nil {
		return err
	}
	var applied int64
	if exists != 0 {
		if err = s.DB.QueryRow("SELECT coalesce(max(created_at),0) FROM __drizzle_migrations").Scan(&applied); err != nil {
			return err
		}
	}
	if applied > journal.Entries[len(journal.Entries)-1].When {
		return fmt.Errorf("数据库版本高于当前应用，请使用匹配镜像或恢复升级前备份")
	}
	var initialized int
	if err = s.DB.QueryRow("SELECT count(*) FROM sqlite_master WHERE name='configuration'").Scan(&initialized); err != nil {
		return err
	}
	if initialized != 0 && applied < journal.Entries[len(journal.Entries)-1].When {
		if err = backupDatabase(s.DB, filepath.Join(s.Config.BackupDir, "inav-"+time.Now().UTC().Format("2006-01-02T15-04-05.000Z")+"-upgrade.sqlite")); err != nil {
			return err
		}
	}
	return transaction(s.DB, func(tx *sql.Tx) error {
		if _, err := tx.Exec("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)"); err != nil {
			return err
		}
		for _, entry := range journal.Entries {
			raw, err := os.ReadFile(filepath.Join(s.Config.MigrationsDir, entry.Tag+".sql"))
			if err != nil {
				return err
			}
			sum := sha256.Sum256(raw)
			hash := hex.EncodeToString(sum[:])
			if entry.When <= applied {
				var stored string
				if err = tx.QueryRow("SELECT hash FROM __drizzle_migrations WHERE created_at=?", entry.When).Scan(&stored); err != nil || stored != hash {
					return fmt.Errorf("迁移历史不一致：%s", entry.Tag)
				}
				continue
			}
			if _, err = tx.Exec(string(raw)); err != nil {
				return fmt.Errorf("迁移 %s 失败：%w", entry.Tag, err)
			}
			if _, err = tx.Exec("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)", hash, entry.When); err != nil {
				return err
			}
		}
		return nil
	})
}
func (s *Store) seed() error {
	var count int
	if err := s.DB.QueryRow("SELECT count(*) FROM configuration").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	var rows []struct {
		ID, Name, URL, Description, Category, IconURL string
		Pinned                                        bool
		Tags                                          []string
	}
	data, err := os.ReadFile(s.Config.SeedPath)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(data, &rows); err != nil {
		return err
	}
	return transaction(s.DB, func(tx *sql.Tx) error {
		names := map[string]string{}
		for _, category := range s.Defaults.Categories {
			if _, err := tx.Exec("INSERT INTO categories(id,name,sort_order,color) VALUES(?,?,?,?)", category.ID, category.Name, category.SortOrder, category.Color); err != nil {
				return err
			}
			names[category.Name] = category.ID
		}
		seen := map[string]bool{}
		stamp := now()
		for i, row := range rows {
			site := Site{SiteInput: SiteInput{Name: row.Name, URL: row.URL, Description: row.Description, CategoryID: names[row.Category], IconURL: row.IconURL, Pinned: row.Pinned, Tags: row.Tags, SortOrder: i}, ID: row.ID, CreatedAt: stamp, UpdatedAt: stamp}
			if err := site.SiteInput.validate(); err != nil {
				return err
			}
			u, _ := normalizeURL(site.URL)
			if seen[u] {
				site.DeletedAt = &stamp
			}
			seen[u] = true
			if err := insertSite(tx, site); err != nil {
				return err
			}
		}
		_, err := tx.Exec("INSERT INTO configuration(id,settings,engines,revision) VALUES(1,?,?,1)", marshal(s.Defaults.Settings), marshal(s.Defaults.Engines))
		return err
	})
}
func backupDatabase(source *sql.DB, path string) (err error) {
	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		return fmt.Errorf("备份目标已存在或不可访问")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	u, err := sqliteFileURL(path)
	if err != nil {
		return err
	}
	u.RawQuery = "_busy_timeout=5000"
	destination, err := sql.Open("sqlite3", u.String())
	if err != nil {
		return err
	}
	destination.SetMaxOpenConns(1)
	defer destination.Close()
	defer func() {
		if err != nil {
			os.Remove(path)
		}
	}()
	src, err := source.Conn(ctx)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := destination.Conn(ctx)
	if err != nil {
		return err
	}
	defer dst.Close()
	err = src.Raw(func(rawSource any) error {
		return dst.Raw(func(rawDestination any) error {
			backup, err := rawDestination.(*sqlite.SQLiteConn).Backup("main", rawSource.(*sqlite.SQLiteConn), "main")
			if err != nil {
				return err
			}
			finished := false
			defer func() {
				if !finished {
					backup.Finish()
				}
			}()
			for {
				done, err := backup.Step(128)
				if err != nil {
					return err
				}
				if done {
					finished = true
					return backup.Finish()
				}
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(2 * time.Millisecond):
				}
			}
		})
	})
	if err == nil {
		err = os.Chmod(path, 0600)
	}
	return err
}

const siteColumns = "id,name,url,description,category_id,icon_url,pinned,tags,sort_order,created_at,updated_at,deleted_at"

type scanner interface{ Scan(...any) error }

func scanSite(row scanner) (Site, error) {
	var value Site
	var tags string
	err := row.Scan(&value.ID, &value.Name, &value.URL, &value.Description, &value.CategoryID, &value.IconURL, &value.Pinned, &tags, &value.SortOrder, &value.CreatedAt, &value.UpdatedAt, &value.DeletedAt)
	if err == nil {
		err = json.Unmarshal([]byte(tags), &value.Tags)
	}
	if value.Tags == nil {
		value.Tags = []string{}
	}
	return value, err
}
func insertSite(q queryer, value Site) error {
	u, err := normalizeURL(value.URL)
	if err != nil {
		return err
	}
	_, err = q.Exec("INSERT INTO sites(id,name,url,normalized_url,description,category_id,icon_url,pinned,tags,sort_order,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", value.ID, value.Name, value.URL, u, value.Description, value.CategoryID, value.IconURL, value.Pinned, marshal(value.Tags), value.SortOrder, value.CreatedAt, value.UpdatedAt, value.DeletedAt)
	return err
}
func touch(q queryer) error {
	_, err := q.Exec("UPDATE configuration SET revision=revision+1 WHERE id=1")
	return err
}
func (s *Store) snapshot(q queryer, includeDeleted bool) (Catalog, error) {
	if db, ok := q.(*sql.DB); ok {
		var result Catalog
		err := transaction(db, func(tx *sql.Tx) error {
			var err error
			result, err = s.snapshot(tx, includeDeleted)
			return err
		})
		return result, err
	}
	if db, ok := q.(*sql.DB); ok {
		var value Catalog
		err := transaction(db, func(tx *sql.Tx) error { var err error; value, err = s.snapshot(tx, includeDeleted); return err })
		return value, err
	}
	c := Catalog{Categories: []Category{}, Sites: []Site{}, Engines: []Engine{}}
	var settings, engines string
	if err := q.QueryRow("SELECT revision,settings,engines FROM configuration WHERE id=1").Scan(&c.Revision, &settings, &engines); err != nil {
		return c, err
	}
	if err := json.Unmarshal([]byte(settings), &c.Settings); err != nil {
		return c, err
	}
	if err := json.Unmarshal([]byte(engines), &c.Engines); err != nil {
		return c, err
	}
	rows, err := q.Query("SELECT id,name,sort_order,color FROM categories ORDER BY sort_order")
	if err != nil {
		return c, err
	}
	for rows.Next() {
		var v Category
		if err = rows.Scan(&v.ID, &v.Name, &v.SortOrder, &v.Color); err != nil {
			break
		}
		c.Categories = append(c.Categories, v)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return c, err
	}
	query := "SELECT " + siteColumns + " FROM sites"
	if !includeDeleted {
		query += " WHERE deleted_at IS NULL"
	}
	rows, err = q.Query(query + " ORDER BY sort_order")
	if err != nil {
		return c, err
	}
	defer rows.Close()
	for rows.Next() {
		v, err := scanSite(rows)
		if err != nil {
			return c, err
		}
		c.Sites = append(c.Sites, v)
	}
	return c, rows.Err()
}
