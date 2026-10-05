package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

const applicationColumns = "id,name,url,description,suggested_category,tags,status,review_note,site_id,site_deleted_at,created_at,updated_at,reviewed_at"

func scanApplication(row scanner) (Application, error) {
	var v Application
	var tags string
	err := row.Scan(&v.ID, &v.Name, &v.URL, &v.Description, &v.SuggestedCategory, &tags, &v.Status, &v.ReviewNote, &v.SiteID, &v.SiteDeletedAt, &v.CreatedAt, &v.UpdatedAt, &v.ReviewedAt)
	if err == nil {
		err = json.Unmarshal([]byte(tags), &v.Tags)
	}
	return v, err
}
func insertApplication(q queryer, v Application) error {
	u, err := normalizeURL(v.URL)
	if err != nil {
		return err
	}
	_, err = q.Exec("INSERT INTO applications(id,name,url,normalized_url,description,suggested_category,tags,status,review_note,site_id,site_deleted_at,created_at,updated_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", v.ID, v.Name, v.URL, u, v.Description, v.SuggestedCategory, marshal(v.Tags), v.Status, v.ReviewNote, v.SiteID, v.SiteDeletedAt, v.CreatedAt, v.UpdatedAt, v.ReviewedAt)
	return err
}
func applicationCounts(q queryer) (map[string]int, error) {
	counts := map[string]int{"pending": 0, "approved": 0, "rejected": 0, "duplicate": 0}
	rows, err := q.Query("SELECT status,count(*) FROM applications GROUP BY status")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err = rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts[status] = count
	}
	return counts, rows.Err()
}
func allApplications(q queryer) ([]Application, error) {
	values := []Application{}
	rows, err := q.Query("SELECT " + applicationColumns + " FROM applications ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		v, err := scanApplication(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, v)
	}
	return values, rows.Err()
}

type ApplicationList struct {
	Items  []Application  `json:"items"`
	Total  int            `json:"total"`
	Counts map[string]int `json:"counts"`
}

func (s *Store) listApplications(status, search string, page int) (ApplicationList, error) {
	result := ApplicationList{Items: []Application{}}
	where := " WHERE 1=1"
	args := []any{}
	if status != "" {
		where += " AND status=?"
		args = append(args, status)
	}
	if search != "" {
		search = strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(search)
		where += " AND (name LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')"
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if err := s.DB.QueryRow("SELECT count(*) FROM applications"+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	counts, err := applicationCounts(s.DB)
	if err != nil {
		return result, err
	}
	result.Counts = counts
	args = append(args, s.Defaults.Limits.PageSize, (page-1)*s.Defaults.Limits.PageSize)
	rows, err := s.DB.Query("SELECT "+applicationColumns+" FROM applications"+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		v, err := scanApplication(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, v)
	}
	return result, rows.Err()
}
func (s *Store) submit(q queryer, input ApplicationInput) error {
	if err := input.validate(); err != nil {
		return err
	}
	u, _ := normalizeURL(input.URL)
	var duplicates int
	if err := q.QueryRow("SELECT count(*) FROM applications WHERE normalized_url=? AND status='pending'", u).Scan(&duplicates); err != nil {
		return err
	}
	if duplicates > 0 {
		return nil
	}
	counts, err := applicationCounts(q)
	if err != nil {
		return err
	}
	total := 0
	for _, count := range counts {
		total += count
	}
	if total >= s.Defaults.Limits.Applications || counts["pending"] >= s.Defaults.Limits.Pending {
		return fail(503, "申请队列暂时已满，请稍后再试")
	}
	stamp := now()
	v := Application{ApplicationInput: input, ID: uuid(), Status: "pending", ReviewNote: "", CreatedAt: stamp, UpdatedAt: stamp}
	if err = insertApplication(q, v); err != nil {
		return err
	}
	return touch(q)
}
func (s *Store) review(q queryer, id string, value Review) (Application, error) {
	old, err := scanApplication(q.QueryRow("SELECT "+applicationColumns+" FROM applications WHERE id=?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return old, fail(404, "申请不存在")
	}
	if err != nil {
		return old, err
	}
	if value.Action != "approved" && value.Action != "rejected" && value.Action != "duplicate" || !validTime(value.ExpectedUpdatedAt) || !text(trim(value.ReviewNote), 1000, false) {
		return old, fail(400, "审核内容无效")
	}
	if value.Action == "approved" && value.Site == nil || value.Action != "approved" && value.Site != nil || value.Action == "duplicate" && !validID(value.SiteID) || value.Action != "duplicate" && value.SiteID != "" {
		return old, fail(400, "审核操作字段无效")
	}
	if old.Status != "pending" {
		if old.Status != value.Action {
			return old, fail(409, "该申请已处理，请刷新列表")
		}
		return old, nil
	}
	if old.UpdatedAt != value.ExpectedUpdatedAt {
		return old, fail(409, "申请已变化，请重新打开审核")
	}
	var siteID *string
	if value.Action == "approved" {
		site, err := s.saveSite(q, *value.Site, "")
		if err != nil {
			return old, err
		}
		siteID = &site.ID
	}
	if value.Action == "duplicate" {
		site, err := requireSite(q, value.SiteID)
		if err != nil || site.DeletedAt != nil {
			return old, fail(400, "请选择已收录的有效站点")
		}
		siteID = &site.ID
	}
	stamp := updatedTime(old.UpdatedAt)
	old.Status = value.Action
	old.SiteID = siteID
	old.ReviewNote = trim(value.ReviewNote)
	old.UpdatedAt = stamp
	old.ReviewedAt = &stamp
	if _, err = q.Exec("UPDATE applications SET status=?,site_id=?,review_note=?,reviewed_at=?,updated_at=? WHERE id=?", old.Status, siteID, old.ReviewNote, stamp, stamp, id); err != nil {
		return old, err
	}
	return old, touch(q)
}
func (s *Store) deleteApplication(q queryer, id, expected string) error {
	var updated string
	if err := q.QueryRow("SELECT updated_at FROM applications WHERE id=?", id).Scan(&updated); errors.Is(err, sql.ErrNoRows) {
		return fail(404, "申请不存在")
	} else if err != nil {
		return err
	}
	if updated != expected {
		return fail(409, "申请已变化，请刷新后重试")
	}
	if _, err := q.Exec("DELETE FROM applications WHERE id=?", id); err != nil {
		return err
	}
	return touch(q)
}
