package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"golang.org/x/crypto/scrypt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"
)

type Account struct{ Username, PasswordHash string }
type Session struct {
	TokenHash, CSRF string
	ExpiresAt       int64
}
type IssuedSession struct {
	Token    string `json:"-"`
	CSRF     string `json:"csrf"`
	Username string `json:"username"`
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func (s *Store) account(q queryer) (*Account, error) {
	var a Account
	err := q.QueryRow("SELECT username,password_hash FROM admin WHERE id=1").Scan(&a.Username, &a.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &a, err
}
func derive(password, salt string) ([]byte, error) {
	defer debug.FreeOSMemory()
	return scrypt.Key([]byte(password), []byte(salt), 32768, 8, 1, 64)
}
func validCredentials(username, password string) error {
	if !text(trim(username), 100, true) || size(password) < 12 || size(password) > 256 {
		return fail(400, "账号不能为空，密码须为 12–256 个字符")
	}
	return nil
}
func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	saltText := hex.EncodeToString(salt)
	key, err := derive(password, saltText)
	if err != nil {
		return "", err
	}
	return saltText + ":" + hex.EncodeToString(key), nil
}
func verifyPassword(password, hash string) (bool, error) {
	parts := strings.Split(hash, ":")
	if len(parts) != 2 || len(parts[1]) != 128 {
		return false, nil
	}
	expected, err := hex.DecodeString(parts[1])
	if err != nil {
		return false, nil
	}
	actual, err := derive(password, parts[0])
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}
func (s *Store) setupToken() (string, error) {
	account, err := s.account(s.DB)
	if err != nil {
		return "", err
	}
	if account != nil {
		return "", fail(409, "管理员已初始化")
	}
	path := filepath.Join(s.Config.DataDir, ".setup-token")
	if _, err = os.Stat(path); errors.Is(err, os.ErrNotExist) {
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err == nil {
			token := env("SETUP_TOKEN", randomToken())
			_, writeErr := file.WriteString(token)
			closeErr := file.Close()
			if writeErr != nil {
				return "", writeErr
			}
			if closeErr != nil {
				return "", closeErr
			}
		} else if !errors.Is(err, os.ErrExist) {
			return "", err
		}
	}
	data, err := os.ReadFile(path)
	return trim(string(data)), err
}
func (s *Store) issueSession(q queryer, username string) (IssuedSession, error) {
	value := IssuedSession{Token: randomToken(), CSRF: randomToken(), Username: username}
	if _, err := q.Exec("DELETE FROM sessions WHERE expires_at<?", time.Now().UnixMilli()); err != nil {
		return value, err
	}
	_, err := q.Exec("INSERT INTO sessions(token_hash,csrf,expires_at) VALUES(?,?,?)", digest(value.Token), value.CSRF, time.Now().Add(7*24*time.Hour).UnixMilli())
	return value, err
}
func (s *Store) setup(username, password, token string) (IssuedSession, error) {
	if err := validCredentials(username, password); err != nil {
		return IssuedSession{}, err
	}
	if token == "" || size(token) > 256 {
		return IssuedSession{}, fail(400, "初始化凭据无效")
	}
	expected, err := s.setupToken()
	if err != nil {
		return IssuedSession{}, err
	}
	if subtle.ConstantTimeCompare([]byte(digest(token)), []byte(digest(expected))) != 1 {
		return IssuedSession{}, fail(403, "一次性凭据不正确")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return IssuedSession{}, err
	}
	var session IssuedSession
	err = transaction(s.DB, func(tx *sql.Tx) error {
		account, err := s.account(tx)
		if err != nil {
			return err
		}
		if account != nil {
			return fail(409, "管理员已初始化")
		}
		if _, err = tx.Exec("INSERT INTO admin(id,username,password_hash) VALUES(1,?,?)", trim(username), hash); err != nil {
			return err
		}
		session, err = s.issueSession(tx, trim(username))
		return err
	})
	if err == nil {
		err = os.Remove(filepath.Join(s.Config.DataDir, ".setup-token"))
		if errors.Is(err, os.ErrNotExist) {
			err = nil
		}
	}
	return session, err
}
func (s *Store) login(username, password string) (IssuedSession, error) {
	if err := validCredentials(username, password); err != nil {
		return IssuedSession{}, err
	}
	account, err := s.account(s.DB)
	if err != nil {
		return IssuedSession{}, err
	}
	if account == nil {
		return IssuedSession{}, fail(401, "账号或密码不正确")
	}
	valid, err := verifyPassword(password, account.PasswordHash)
	if err != nil {
		return IssuedSession{}, err
	}
	if !valid || account.Username != trim(username) {
		return IssuedSession{}, fail(401, "账号或密码不正确")
	}
	var session IssuedSession
	err = transaction(s.DB, func(tx *sql.Tx) error {
		current, err := s.account(tx)
		if err != nil {
			return err
		}
		if current == nil || current.PasswordHash != account.PasswordHash {
			return fail(401, "密码已变更，请重新登录")
		}
		session, err = s.issueSession(tx, current.Username)
		return err
	})
	return session, err
}
func (s *Store) session(token string) (*Session, error) {
	if token == "" || len(token) > 200 {
		return nil, nil
	}
	var v Session
	err := s.DB.QueryRow("SELECT token_hash,csrf,expires_at FROM sessions WHERE token_hash=?", digest(token)).Scan(&v.TokenHash, &v.CSRF, &v.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) || err == nil && v.ExpiresAt <= time.Now().UnixMilli() {
		return nil, nil
	}
	return &v, err
}
func (s *Store) resetPassword(password string) error {
	if size(password) < 12 || size(password) > 256 {
		return fail(400, "密码须为 12–256 个字符")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	return transaction(s.DB, func(tx *sql.Tx) error {
		account, err := s.account(tx)
		if err != nil {
			return err
		}
		if account == nil {
			return fail(409, "管理员未初始化")
		}
		if _, err = tx.Exec("UPDATE admin SET password_hash=? WHERE id=1", hash); err != nil {
			return err
		}
		_, err = tx.Exec("DELETE FROM sessions")
		return err
	})
}
