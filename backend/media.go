package main

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var mediaNamePattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|gif|webp|ico|svg)$`)

type MediaFile struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Size int64  `json:"size"`
}
type MediaLibraryItem struct {
	MediaFile
	UsedBy     []string `json:"usedBy"`
	ModifiedAt string   `json:"modifiedAt"`
}

func (s *Store) mediaReferences(c Catalog) map[string][]string {
	refs := map[string][]string{}
	add := func(value, label string) {
		u, err := url.Parse(value)
		if err != nil {
			return
		}
		if u.IsAbs() && u.Scheme+"://"+u.Host != s.Config.Origin && u.Scheme+"://"+u.Host != s.Config.PublicOrigin {
			return
		}
		if !strings.HasPrefix(u.Path, "/media/") {
			return
		}
		name := strings.TrimPrefix(u.Path, "/media/")
		if mediaNamePattern.MatchString(name) {
			refs[name] = append(refs[name], label)
		}
	}
	for _, site := range c.Sites {
		label := "站点：" + site.Name
		if site.DeletedAt != nil {
			label = "回收站：" + site.Name
		}
		add(site.IconURL, label)
	}
	for _, engine := range c.Engines {
		add(engine.IconURL, "搜索引擎："+engine.Name)
	}
	p := c.Settings.Presentation
	for _, field := range []struct{ value, label string }{{c.Settings.LogoURL, "Logo"}, {p.LogoDarkURL, "深色 Logo"}, {p.FaviconURL, "浏览器图标"}, {p.TouchIconURL, "移动端图标"}, {p.ShareImageURL, "分享封面"}} {
		add(field.value, "站点设置："+field.label)
	}
	for _, link := range p.FooterLinks {
		add(link.URL, "页脚链接："+link.Label)
	}
	return refs
}

func imageExtension(data []byte, maxMediaBytes int) (string, error) {
	if len(data) == 0 || len(data) > maxMediaBytes {
		return "", fail(400, "图片需在 2 MiB 以内")
	}
	switch http.DetectContentType(data) {
	case "image/png":
		return "png", nil
	case "image/jpeg":
		return "jpg", nil
	case "image/gif":
		return "gif", nil
	case "image/webp":
		return "webp", nil
	case "image/x-icon":
		return "ico", nil
	}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	root, depth := false, 0
	allowed := map[string]bool{}
	for _, name := range strings.Fields("svg g path rect circle ellipse line polyline polygon defs clipPath mask linearGradient radialGradient stop pattern title desc use text tspan style symbol") {
		allowed[name] = true
	}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fail(400, "图片格式无效")
		}
		switch value := token.(type) {
		case xml.StartElement:
			if depth == 0 {
				if root || value.Name.Local != "svg" || (value.Name.Space != "" && value.Name.Space != "http://www.w3.org/2000/svg") {
					return "", fail(400, "SVG 根节点无效")
				}
				root = true
			}
			depth++
			if !allowed[value.Name.Local] {
				return "", fail(400, "SVG 包含不支持的活动内容，请使用静态 SVG")
			}
			for _, attr := range value.Attr {
				if strings.HasPrefix(strings.ToLower(attr.Name.Local), "on") || (attr.Name.Local == "href" && !strings.HasPrefix(attr.Value, "#")) {
					return "", fail(400, "SVG 不允许脚本或外部引用")
				}
			}
		case xml.EndElement:
			depth--
		case xml.Directive:
			return "", fail(400, "SVG 不允许文档类型声明")
		case xml.ProcInst:
			if value.Target != "xml" {
				return "", fail(400, "SVG 不允许处理指令")
			}
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(value)) != "" {
				return "", fail(400, "图片格式无效")
			}
		}
	}
	if !root || depth != 0 {
		return "", fail(400, "支持 PNG、JPEG、GIF、WebP、ICO 和静态 SVG")
	}
	return "svg", nil
}

func (a *App) mediaRoutes() {
	dir := filepath.Join(a.Store.Config.DataDir, "media")
	a.route("GET /api/admin/media", func(w http.ResponseWriter, r *http.Request) error {
		catalog, err := a.Store.snapshot(a.Store.DB, true)
		if err != nil {
			return err
		}
		refs := a.Store.mediaReferences(catalog)
		entries, err := os.ReadDir(dir)
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		items := []MediaLibraryItem{}
		for _, entry := range entries {
			if !mediaNamePattern.MatchString(entry.Name()) || entry.Type()&os.ModeSymlink != 0 || entry.IsDir() {
				continue
			}
			info, err := entry.Info()
			if os.IsNotExist(err) {
				continue
			}
			if err != nil {
				return err
			}
			usedBy := refs[entry.Name()]
			if usedBy == nil {
				usedBy = []string{}
			}
			items = append(items, MediaLibraryItem{MediaFile{entry.Name(), "/media/" + entry.Name(), info.Size()}, usedBy, info.ModTime().UTC().Format("2006-01-02T15:04:05.000Z")})
		}
		sort.Slice(items, func(i, j int) bool {
			if items[i].ModifiedAt == items[j].ModifiedAt {
				return items[i].Name < items[j].Name
			}
			return items[i].ModifiedAt > items[j].ModifiedAt
		})
		return jsonResponse(w, 200, map[string]any{"items": items, "revision": catalog.Revision})
	})
	a.route("POST /api/admin/media", func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			Data string `json:"data" required:"true"`
		}
		if err := readJSON(r, &input); err != nil {
			return err
		}
		if len(input.Data) > base64.StdEncoding.EncodedLen(a.Store.Defaults.Limits.MediaBytes) {
			return fail(413, "图片需在 2 MiB 以内")
		}
		data, err := base64.StdEncoding.Strict().DecodeString(input.Data)
		if err != nil {
			return fail(400, "图片编码无效")
		}
		ext, err := imageExtension(data, a.Store.Defaults.Limits.MediaBytes)
		if err != nil {
			return err
		}
		a.writeMu.Lock()
		defer a.writeMu.Unlock()
		if a.maintenance.Load() {
			return fail(503, "正在恢复数据，请稍后重试")
		}
		if err = os.MkdirAll(dir, 0700); err != nil {
			return err
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return err
		}
		if len(entries) >= a.Store.Defaults.Limits.MediaFiles {
			return fail(400, "图片库最多 200 项，请先删除不用的图片")
		}
		name := uuid() + "." + ext
		path := filepath.Join(dir, name)
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(data)
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil {
			_ = os.Remove(path)
			if writeErr != nil {
				return writeErr
			}
			return closeErr
		}
		return jsonResponse(w, 201, MediaFile{name, "/media/" + name, int64(len(data))})
	})
	a.route("DELETE /api/admin/media/{name}", func(w http.ResponseWriter, r *http.Request) error {
		var input struct {
			AllowReferenced bool `json:"allowReferenced"`
		}
		if err := readJSON(r, &input); err != nil {
			return err
		}
		name := r.PathValue("name")
		if !mediaNamePattern.MatchString(name) {
			return fail(404, "图片不存在")
		}
		a.writeMu.Lock()
		defer a.writeMu.Unlock()
		if a.maintenance.Load() {
			return fail(503, "正在恢复数据，请稍后重试")
		}
		catalog, err := a.Store.snapshot(a.Store.DB, true)
		if err != nil {
			return err
		}
		if r.Header.Get("If-Match") != `"`+catalog.Revision+`"` {
			return fail(409, "图片引用已变化，请刷新图片库后重新确认")
		}
		if len(a.Store.mediaReferences(catalog)[name]) > 0 && !input.AllowReferenced {
			return fail(409, "图片仍被引用，请确认影响后删除")
		}
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			if os.IsNotExist(err) {
				return fail(404, "图片不存在")
			}
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"ok": true})
	})
	a.route("GET /media/{name}", func(w http.ResponseWriter, r *http.Request) error {
		name := r.PathValue("name")
		if !mediaNamePattern.MatchString(name) {
			return fail(404, "图片不存在")
		}
		path := filepath.Join(dir, name)
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			return fail(404, "图片不存在")
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		types := map[string]string{".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
		w.Header().Set("Content-Type", types[filepath.Ext(name)])
		http.ServeFile(w, r, path)
		return nil
	})
}
