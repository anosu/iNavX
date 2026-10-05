package main

import (
	whatwg "github.com/nlnwa/whatwg-url/url"
	"strings"
)

func normalizeURL(value string) (string, error) {
	value = trim(value)
	if size(value) > 4096 {
		return "", fail(400, "网址过长")
	}
	u, err := whatwg.Parse(value)
	if err != nil || u == nil || u.Scheme() != "http" && u.Scheme() != "https" || u.Username() != "" || u.Password() != "" {
		return "", fail(400, "请输入不含账号密码的 HTTP / HTTPS 地址")
	}
	return u.Href(false), nil
}
func resourceURL(value string) bool {
	if value == "" {
		return true
	}
	if value != trim(value) || size(value) > 4096 {
		return false
	}
	for _, r := range value {
		if r <= 32 || r == '\\' {
			return false
		}
	}
	if strings.HasPrefix(value, "/") {
		return !strings.HasPrefix(value, "//")
	}
	_, err := normalizeURL(value)
	return err == nil
}
func validTemplate(value, placeholder string) bool {
	return value == "" || size(value) <= 4096 && strings.Contains(value, placeholder) && resourceURL(strings.ReplaceAll(value, placeholder, "example"))
}
