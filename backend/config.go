package main

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	DataDir, BackupDir, DatabasePath, MigrationsDir, SeedPath, DefaultsPath, DistDir string
	Host, Origin, PublicOrigin, SiteKey, SecretKey                                   string
	Port                                                                             int
	TrustedProxies                                                                   map[string]bool
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func absolute(path string) string {
	value, err := filepath.Abs(path)
	if err != nil {
		panic(err)
	}
	return value
}
func origin(value string) (string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		return "", fmt.Errorf("来源地址无效")
	}
	if u.Port() == "80" && u.Scheme == "http" || u.Port() == "443" && u.Scheme == "https" {
		u.Host = u.Hostname()
	}
	return u.Scheme + "://" + u.Host, nil
}
func loadConfig() (Config, error) {
	c := Config{DataDir: absolute(env("DATA_DIR", "data")), BackupDir: absolute(env("BACKUP_DIR", "backups")), MigrationsDir: absolute("migrations"), SeedPath: absolute("src/data/sites.json"), DefaultsPath: absolute("runtime/defaults.json"), DistDir: absolute("dist"), Host: env("HOST", "0.0.0.0"), SiteKey: os.Getenv("TURNSTILE_SITE_KEY"), SecretKey: os.Getenv("TURNSTILE_SECRET_KEY"), TrustedProxies: map[string]bool{}}
	var err error
	c.Port, err = strconv.Atoi(env("PORT", "3000"))
	if err != nil || c.Port < 1 || c.Port > 65535 {
		return c, fmt.Errorf("PORT 无效")
	}
	c.Origin, err = origin(env("APP_ORIGIN", fmt.Sprintf("http://localhost:%d", c.Port)))
	if err != nil {
		return c, err
	}
	if value := os.Getenv("PUBLIC_ORIGIN"); value != "" {
		c.PublicOrigin, err = origin(value)
		if err != nil {
			return c, err
		}
	}
	if (c.SiteKey == "") != (c.SecretKey == "") {
		return c, fmt.Errorf("Turnstile 必须同时配置 SITE_KEY 和 SECRET_KEY")
	}
	for _, address := range strings.Split(os.Getenv("TRUSTED_PROXY_IPS"), ",") {
		address = strings.TrimSpace(address)
		if address != "" {
			if net.ParseIP(address) == nil {
				return c, fmt.Errorf("TRUSTED_PROXY_IPS 无效")
			}
			c.TrustedProxies[net.ParseIP(address).String()] = true
		}
	}
	c.DatabasePath = filepath.Join(c.DataDir, "inav.sqlite")
	return c, nil
}
