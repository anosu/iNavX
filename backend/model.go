package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
)

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string           { return e.Message }
func fail(status int, message string) error { return &APIError{status, message} }
func now() string                           { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }
func trim(value string) string {
	return strings.TrimFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r == '\ufeff' })
}
func updatedTime(previous string) string {
	stamp := time.Now().UTC().Truncate(time.Millisecond)
	if old, err := time.Parse(time.RFC3339Nano, previous); err == nil && !stamp.After(old) {
		stamp = old.Add(time.Millisecond)
	}
	return stamp.Format("2006-01-02T15:04:05.000Z")
}
func size(value string) int { return len(utf16.Encode([]rune(value))) }

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

func validID(value string) bool { return idPattern.MatchString(value) }
func validTime(value string) bool {
	if !strings.HasSuffix(value, "Z") {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
func validNullableTime(value *string) bool { return value == nil || validTime(*value) }
func text(value string, max int, required bool) bool {
	return size(value) <= max && (!required || value != "")
}

type Category struct {
	ID        string `json:"id" required:"true"`
	Name      string `json:"name" required:"true"`
	SortOrder int    `json:"sortOrder" required:"true"`
}
type CategoryInput struct {
	Name      string `json:"name" required:"true"`
	SortOrder int    `json:"sortOrder" required:"true"`
}
type SiteInput struct {
	Name        string   `json:"name" required:"true"`
	URL         string   `json:"url" required:"true"`
	Description string   `json:"description"`
	CategoryID  string   `json:"categoryId" required:"true"`
	IconURL     string   `json:"iconUrl"`
	Pinned      bool     `json:"pinned"`
	Tags        []string `json:"tags"`
	SortOrder   int      `json:"sortOrder"`
}
type Site struct {
	SiteInput
	ID        string  `json:"id" required:"true"`
	CreatedAt string  `json:"createdAt" required:"true"`
	UpdatedAt string  `json:"updatedAt" required:"true"`
	DeletedAt *string `json:"deletedAt" required:"nullable"`
}
type Engine struct {
	ID        string `json:"id" required:"true"`
	Name      string `json:"name" required:"true"`
	SearchURL string `json:"searchUrl" required:"true"`
	IconURL   string `json:"iconUrl" required:"true"`
	Enabled   bool   `json:"enabled" required:"true"`
}
type Features struct {
	BookmarkImport bool `json:"bookmarkImport" required:"true"`
	BookmarkExport bool `json:"bookmarkExport" required:"true"`
	CustomSites    bool `json:"customSites" required:"true"`
	ClearImported  bool `json:"clearImported" required:"true"`
	HideBuiltin    bool `json:"hideBuiltin" required:"true"`
}
type Settings struct {
	Name                  string   `json:"name" required:"true"`
	Description           string   `json:"description" required:"true"`
	LogoURL               string   `json:"logoUrl" required:"true"`
	DefaultTheme          string   `json:"defaultTheme" required:"true"`
	Features              Features `json:"features" required:"true"`
	FaviconTemplate       string   `json:"faviconTemplate" required:"true"`
	MetadataProxyTemplate string   `json:"metadataProxyTemplate" required:"true"`
	RemoteImagesEnabled   bool     `json:"remoteImagesEnabled"`
	MetadataFetchEnabled  bool     `json:"metadataFetchEnabled"`
	BackupIntervalHours   int      `json:"backupIntervalHours" required:"true"`
	BackupKeep            int      `json:"backupKeep" required:"true"`
	ApplicationsEnabled   bool     `json:"applicationsEnabled"`
}

func (s *Settings) UnmarshalJSON(data []byte) error {
	type plain Settings
	value := plain{ApplicationsEnabled: true}
	if err := strictJSON(data, &value); err != nil {
		return err
	}
	*s = Settings(value)
	return nil
}

type Catalog struct {
	Revision   string     `json:"revision" required:"true"`
	Categories []Category `json:"categories" required:"true"`
	Sites      []Site     `json:"sites" required:"true"`
	Engines    []Engine   `json:"engines" required:"true"`
	Settings   Settings   `json:"settings" required:"true"`
}
type ApplicationInput struct {
	Name              string   `json:"name" required:"true"`
	URL               string   `json:"url" required:"true"`
	Description       string   `json:"description"`
	SuggestedCategory string   `json:"suggestedCategory"`
	Tags              []string `json:"tags"`
}
type Submission struct {
	ApplicationInput
	Website      string `json:"website"`
	CaptchaToken string `json:"captchaToken"`
}
type Application struct {
	ApplicationInput
	ID            string  `json:"id" required:"true"`
	Status        string  `json:"status" required:"true"`
	ReviewNote    string  `json:"reviewNote" required:"true"`
	SiteID        *string `json:"siteId" required:"nullable"`
	SiteDeletedAt *string `json:"siteDeletedAt"`
	CreatedAt     string  `json:"createdAt" required:"true"`
	UpdatedAt     string  `json:"updatedAt" required:"true"`
	ReviewedAt    *string `json:"reviewedAt" required:"nullable"`
}
type Review struct {
	Action            string     `json:"action" required:"true"`
	ExpectedUpdatedAt string     `json:"expectedUpdatedAt" required:"true"`
	ReviewNote        string     `json:"reviewNote"`
	Site              *SiteInput `json:"site,omitempty"`
	SiteID            string     `json:"siteId,omitempty"`
}
type Migration struct {
	Format        string        `json:"format" required:"true"`
	FormatVersion int           `json:"formatVersion" required:"true"`
	AppVersion    string        `json:"appVersion" required:"true"`
	ExportedAt    string        `json:"exportedAt" required:"true"`
	Data          Catalog       `json:"data" required:"true"`
	Applications  []Application `json:"applications"`
}
type Limits struct{ Sites, Categories, Engines, Applications, Pending, PageSize, BodyBytes int }
type Defaults struct {
	Categories []Category `json:"categories"`
	Engines    []Engine   `json:"engines"`
	Settings   Settings   `json:"settings"`
	Limits     Limits     `json:"limits"`
}

// Required fields and nullability belong to the same types used on the wire.
func presence(data json.RawMessage, t reflect.Type) error {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if bytes.Equal(data, []byte("null")) {
		return nil
	}
	if t.Kind() == reflect.Slice {
		if t.Elem().Kind() != reflect.Struct {
			return nil
		}
		var values []json.RawMessage
		if err := json.Unmarshal(data, &values); err != nil {
			return err
		}
		for _, value := range values {
			if err := presence(value, t.Elem()); err != nil {
				return err
			}
		}
		return nil
	}
	if t.Kind() != reflect.Struct {
		return nil
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.Anonymous {
			if err := presence(data, field.Type); err != nil {
				return err
			}
			continue
		}
		key := strings.Split(field.Tag.Get("json"), ",")[0]
		value, ok := object[key]
		if ok && bytes.Equal(bytes.TrimSpace(value), []byte("null")) && field.Type.Kind() != reflect.Pointer {
			return fail(400, "字段不能为 null："+key)
		}
		required := field.Tag.Get("required")
		if required != "" && (!ok || required == "true" && bytes.Equal(value, []byte("null"))) {
			return fail(400, "缺少有效字段："+key)
		}
		if ok && !bytes.Equal(value, []byte("null")) {
			if err := presence(value, field.Type); err != nil {
				return err
			}
		}
	}
	return nil
}
func strictJSON(data []byte, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fail(400, "JSON 字段或类型无效")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fail(400, "JSON 格式不正确")
	}
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return fail(400, "JSON 不能为空")
	}
	return presence(data, reflect.TypeOf(value).Elem())
}
func (v *SiteInput) validate() error {
	v.Name = trim(v.Name)
	v.URL = trim(v.URL)
	v.Description = trim(v.Description)
	if !text(v.Name, 100, true) || !text(v.Description, 1000, false) || !validID(v.CategoryID) || !resourceURL(v.IconURL) || v.SortOrder < 0 || v.SortOrder > 1000000 {
		return fail(400, "站点字段无效")
	}
	if _, err := normalizeURL(v.URL); err != nil {
		return err
	}
	return validateTags(&v.Tags)
}
func validateTags(tags *[]string) error {
	if len(*tags) > 30 {
		return fail(400, "最多添加 30 个标签")
	}
	values := []string{}
	seen := map[string]bool{}
	for _, tag := range *tags {
		tag = trim(tag)
		if !text(tag, 100, true) {
			return fail(400, "标签不能为空，且不超过 100 个字符")
		}
		if !seen[tag] {
			seen[tag] = true
			values = append(values, tag)
		}
	}
	*tags = values
	return nil
}
func (v *CategoryInput) validate() error {
	v.Name = trim(v.Name)
	if !text(v.Name, 100, true) || v.SortOrder < 0 || v.SortOrder > 1000000 {
		return fail(400, "分类字段无效")
	}
	return nil
}
func validateEngines(values []Engine, limit int) error {
	if len(values) > limit {
		return fail(400, "搜索引擎数量超限")
	}
	ids := map[string]bool{}
	for i := range values {
		v := &values[i]
		v.Name = trim(v.Name)
		if !validID(v.ID) || ids[v.ID] || !text(v.Name, 100, true) || !resourceURL(v.IconURL) || !strings.Contains(v.SearchURL, "{q}") {
			return fail(400, "搜索引擎字段无效")
		}
		if _, err := normalizeURL(strings.ReplaceAll(v.SearchURL, "{q}", "example")); err != nil {
			return err
		}
		ids[v.ID] = true
	}
	return nil
}
func (v *Settings) validate() error {
	v.Name = trim(v.Name)
	v.Description = trim(v.Description)
	if !text(v.Name, 100, true) || !text(v.Description, 1000, false) || !resourceURL(v.LogoURL) || v.DefaultTheme != "light" && v.DefaultTheme != "dark" && v.DefaultTheme != "system" || !validTemplate(v.FaviconTemplate, "{domain}") || !validTemplate(v.MetadataProxyTemplate, "{url}") || v.BackupIntervalHours < 0 || v.BackupIntervalHours > 8760 || v.BackupKeep < 1 || v.BackupKeep > 365 {
		return fail(400, "站点设置无效")
	}
	return nil
}
func (v *ApplicationInput) validate() error {
	v.Name = trim(v.Name)
	v.URL = trim(v.URL)
	v.Description = trim(v.Description)
	v.SuggestedCategory = trim(v.SuggestedCategory)
	if !text(v.Name, 100, true) || !text(v.Description, 1000, false) || !text(v.SuggestedCategory, 100, false) {
		return fail(400, "申请字段无效")
	}
	if err := validateTags(&v.Tags); err != nil {
		return err
	}
	_, err := normalizeURL(v.URL)
	return err
}
func (v *Application) validate() error {
	if err := v.ApplicationInput.validate(); err != nil {
		return err
	}
	if !validID(v.ID) || !text(v.ReviewNote, 1000, false) || !validTime(v.CreatedAt) || !validTime(v.UpdatedAt) || !validNullableTime(v.ReviewedAt) || !validNullableTime(v.SiteDeletedAt) || v.SiteID != nil && !validID(*v.SiteID) {
		return fail(400, "申请记录无效")
	}
	switch v.Status {
	case "pending":
		if v.ReviewedAt != nil || v.SiteID != nil || v.SiteDeletedAt != nil {
			return fail(400, "待审核申请状态无效")
		}
	case "rejected":
		if v.ReviewedAt == nil || v.SiteID != nil || v.SiteDeletedAt != nil {
			return fail(400, "拒绝申请状态无效")
		}
	case "approved", "duplicate":
		if v.ReviewedAt == nil || (v.SiteID == nil) == (v.SiteDeletedAt == nil) {
			return fail(400, "收录申请关联无效")
		}
	default:
		return fail(400, "申请状态无效")
	}
	return nil
}
func (v *Migration) validate(l Limits) error {
	if v.Format != "inav-catalog" || v.FormatVersion < 1 || v.FormatVersion > 4 || !text(v.AppVersion, 100, false) || !validTime(v.ExportedAt) || v.FormatVersion == 1 && len(v.Applications) > 0 {
		return fail(400, "迁移包版本或信息无效")
	}
	c := &v.Data
	if len(c.Sites) > l.Sites || len(c.Categories) > l.Categories || len(v.Applications) > l.Applications {
		return fail(400, "迁移包数量超限")
	}
	if err := c.Settings.validate(); err != nil {
		return err
	}
	if err := validateEngines(c.Engines, l.Engines); err != nil {
		return err
	}
	cats, names, sites, urls, apps, pending := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for i := range c.Categories {
		item := &c.Categories[i]
		input := CategoryInput{item.Name, item.SortOrder}
		if err := input.validate(); err != nil {
			return err
		}
		item.Name = input.Name
		if !validID(item.ID) || cats[item.ID] || names[item.Name] {
			return fail(400, "分类 ID 或名称重复")
		}
		cats[item.ID] = true
		names[item.Name] = true
	}
	for i := range c.Sites {
		item := &c.Sites[i]
		if err := item.SiteInput.validate(); err != nil {
			return err
		}
		if !validID(item.ID) || sites[item.ID] || !cats[item.CategoryID] || !validTime(item.CreatedAt) || !validTime(item.UpdatedAt) || !validNullableTime(item.DeletedAt) {
			return fail(400, "站点记录或关联无效")
		}
		u, _ := normalizeURL(item.URL)
		if item.DeletedAt == nil {
			if urls[u] {
				return fail(400, "活动站点 URL 重复")
			}
			urls[u] = true
		}
		sites[item.ID] = true
	}
	for i := range v.Applications {
		item := &v.Applications[i]
		if v.FormatVersion < 4 && len(item.Tags) > 0 {
			return fail(400, "旧版迁移包不支持申请标签")
		}
		if v.FormatVersion < 3 && item.SiteDeletedAt != nil {
			return fail(400, "旧版迁移包不支持已删除站点关联")
		}
		if err := item.validate(); err != nil {
			return err
		}
		if apps[item.ID] || item.SiteID != nil && !sites[*item.SiteID] {
			return fail(400, "申请 ID 或关联无效")
		}
		apps[item.ID] = true
		if item.Status == "pending" {
			u, _ := normalizeURL(item.URL)
			if pending[u] {
				return fail(400, "待审核申请 URL 重复")
			}
			pending[u] = true
		}
	}
	if len(pending) > l.Pending {
		return fail(400, "待审核申请数量超限")
	}
	if c.Categories == nil {
		c.Categories = []Category{}
	}
	if c.Sites == nil {
		c.Sites = []Site{}
	}
	if c.Engines == nil {
		c.Engines = []Engine{}
	}
	if v.Applications == nil {
		v.Applications = []Application{}
	}
	return nil
}
func marshal(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("encode model: %v", err))
	}
	return string(data)
}
