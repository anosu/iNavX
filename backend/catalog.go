package main

import (
	"database/sql"
	"errors"
)

func requireSite(q queryer, id string) (Site, error) {
	v, err := scanSite(q.QueryRow("SELECT "+siteColumns+" FROM sites WHERE id=?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return v, fail(404, "站点不存在")
	}
	return v, err
}
func requireCategory(q queryer, id string) error {
	var count int
	if err := q.QueryRow("SELECT count(*) FROM categories WHERE id=?", id).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fail(400, "分类不存在")
	}
	return nil
}
func checkURL(q queryer, value, id string) error {
	u, err := normalizeURL(value)
	if err != nil {
		return err
	}
	var name string
	err = q.QueryRow("SELECT name FROM sites WHERE normalized_url=? AND deleted_at IS NULL AND id<>?", u, id).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return fail(409, "已收录相同 URL："+name)
}
func (s *Store) saveSite(q queryer, input SiteInput, id string) (Site, error) {
	if err := input.validate(); err != nil {
		return Site{}, err
	}
	if err := requireCategory(q, input.CategoryID); err != nil {
		return Site{}, err
	}
	stamp := now()
	value := Site{SiteInput: input, ID: id, CreatedAt: stamp, UpdatedAt: stamp}
	if id != "" {
		old, err := requireSite(q, id)
		if err != nil {
			return value, err
		}
		value.CreatedAt = old.CreatedAt
		stamp = updatedTime(old.UpdatedAt)
		value.UpdatedAt = stamp
		value.DeletedAt = old.DeletedAt
	} else {
		var count int
		if err := q.QueryRow("SELECT count(*) FROM sites").Scan(&count); err != nil {
			return value, err
		}
		if count >= s.Defaults.Limits.Sites {
			return value, fail(409, "站点数量达到上限（含回收站）")
		}
		value.ID = uuid()
	}
	if value.DeletedAt == nil {
		if err := checkURL(q, value.URL, id); err != nil {
			return value, err
		}
	}
	if id == "" {
		if err := insertSite(q, value); err != nil {
			return value, err
		}
	} else {
		u, _ := normalizeURL(value.URL)
		if _, err := q.Exec("UPDATE sites SET name=?,url=?,normalized_url=?,description=?,category_id=?,icon_url=?,pinned=?,tags=?,sort_order=?,updated_at=? WHERE id=?", value.Name, value.URL, u, value.Description, value.CategoryID, value.IconURL, value.Pinned, marshal(value.Tags), value.SortOrder, stamp, id); err != nil {
			return value, err
		}
	}
	return value, touch(q)
}
func (s *Store) setDeleted(q queryer, id string, deleted bool) error {
	v, err := requireSite(q, id)
	if err != nil {
		return err
	}
	if !deleted {
		if err = checkURL(q, v.URL, id); err != nil {
			return err
		}
	}
	stamp := updatedTime(v.UpdatedAt)
	var when *string
	if deleted {
		when = &stamp
	}
	if _, err = q.Exec("UPDATE sites SET deleted_at=?,updated_at=? WHERE id=?", when, stamp, id); err != nil {
		return err
	}
	return touch(q)
}
func unlinkApplications(q queryer, where string, args ...any) error {
	var previous string
	if err := q.QueryRow("SELECT coalesce(max(updated_at),'') FROM applications WHERE site_id IN (SELECT id FROM sites WHERE "+where+")", args...).Scan(&previous); err != nil {
		return err
	}
	stamp := updatedTime(previous)
	params := append([]any{stamp, stamp}, args...)
	_, err := q.Exec("UPDATE applications SET site_id=NULL,site_deleted_at=?,updated_at=? WHERE site_id IN (SELECT id FROM sites WHERE "+where+")", params...)
	return err
}
func (s *Store) permanentSite(q queryer, id, expected string) error {
	old, err := requireSite(q, id)
	if err != nil {
		return err
	}
	if old.DeletedAt == nil {
		return fail(409, "请先将站点移入回收站")
	}
	if old.UpdatedAt != expected {
		return fail(409, "条目已变化，请刷新后重试")
	}
	if err = unlinkApplications(q, "id=?", id); err != nil {
		return err
	}
	if _, err = q.Exec("DELETE FROM sites WHERE id=?", id); err != nil {
		return err
	}
	return touch(q)
}
func (s *Store) saveCategory(q queryer, input CategoryInput, id string) (Category, error) {
	if err := input.validate(); err != nil {
		return Category{}, err
	}
	if id != "" {
		if err := requireCategory(q, id); err != nil {
			return Category{}, err
		}
	} else {
		var count int
		if err := q.QueryRow("SELECT count(*) FROM categories").Scan(&count); err != nil {
			return Category{}, err
		}
		if count >= s.Defaults.Limits.Categories {
			return Category{}, fail(409, "分类数量达到上限")
		}
	}
	var count int
	if err := q.QueryRow("SELECT count(*) FROM categories WHERE name=? AND id<>?", input.Name, id).Scan(&count); err != nil {
		return Category{}, err
	}
	if count > 0 {
		return Category{}, fail(409, "分类名称已存在")
	}
	value := Category{ID: id, Name: input.Name, SortOrder: input.SortOrder, Color: input.Color}
	if id == "" {
		value.ID = uuid()
		if _, err := q.Exec("INSERT INTO categories(id,name,sort_order,color) VALUES(?,?,?,?)", value.ID, value.Name, value.SortOrder, value.Color); err != nil {
			return value, err
		}
	} else {
		if _, err := q.Exec("UPDATE categories SET name=?,sort_order=?,color=? WHERE id=?", value.Name, value.SortOrder, value.Color, id); err != nil {
			return value, err
		}
	}
	return value, touch(q)
}
func (s *Store) deleteCategory(q queryer, id, target string, cascade bool) error {
	if err := requireCategory(q, id); err != nil {
		return err
	}
	if target != "" && cascade {
		return fail(400, "迁移和删除所属站点只能选择一种")
	}
	var count int
	if err := q.QueryRow("SELECT count(*) FROM sites WHERE category_id=?", id).Scan(&count); err != nil {
		return err
	}
	if target != "" {
		if target == id {
			return fail(400, "不能迁移到原分类")
		}
		if err := requireCategory(q, target); err != nil {
			return err
		}
		if _, err := q.Exec("UPDATE sites SET category_id=?,updated_at=? WHERE category_id=?", target, now(), id); err != nil {
			return err
		}
	} else if count > 0 {
		if !cascade {
			return fail(409, "请选择迁移站点或永久删除所属站点")
		}
		if err := unlinkApplications(q, "category_id=?", id); err != nil {
			return err
		}
		if _, err := q.Exec("DELETE FROM sites WHERE category_id=?", id); err != nil {
			return err
		}
	}
	if _, err := q.Exec("DELETE FROM categories WHERE id=?", id); err != nil {
		return err
	}
	return touch(q)
}
