package main

import "database/sql"

type MergeReport struct {
	Added               int      `json:"added"`
	Skipped             int      `json:"skipped"`
	Conflicts           []string `json:"conflicts"`
	ApplicationsAdded   int      `json:"applicationsAdded"`
	ApplicationsSkipped int      `json:"applicationsSkipped"`
}

func replaceCatalog(tx *sql.Tx, c Catalog) error {
	for _, table := range []string{"applications", "sites", "categories"} {
		if _, err := tx.Exec("DELETE FROM " + table); err != nil {
			return err
		}
	}
	for _, v := range c.Categories {
		if _, err := tx.Exec("INSERT INTO categories(id,name,sort_order) VALUES(?,?,?)", v.ID, v.Name, v.SortOrder); err != nil {
			return err
		}
	}
	for _, v := range c.Sites {
		if err := insertSite(tx, v); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("UPDATE configuration SET settings=?,engines=? WHERE id=1", marshal(c.Settings), marshal(c.Engines)); err != nil {
		return err
	}
	return touch(tx)
}
func (s *Store) importMigration(pkg Migration, mode string) (MergeReport, error) {
	report := MergeReport{Conflicts: []string{}}
	if err := pkg.validate(s.Defaults.Limits); err != nil {
		return report, err
	}
	err := transaction(s.DB, func(tx *sql.Tx) error {
		if mode == "replace" {
			if err := replaceCatalog(tx, pkg.Data); err != nil {
				return err
			}
			for _, v := range pkg.Applications {
				if err := insertApplication(tx, v); err != nil {
					return err
				}
			}
			return touch(tx)
		}
		existing, err := s.snapshot(tx, true)
		if err != nil {
			return err
		}
		catsByName := map[string]Category{}
		catIDs := map[string]bool{}
		sitesByID := map[string]Site{}
		activeByURL := map[string]Site{}
		catMap := map[string]string{}
		siteMap := map[string]string{}
		for _, v := range existing.Categories {
			catsByName[v.Name] = v
			catIDs[v.ID] = true
		}
		for _, v := range existing.Sites {
			sitesByID[v.ID] = v
			if v.DeletedAt == nil {
				u, _ := normalizeURL(v.URL)
				activeByURL[u] = v
			}
		}
		for _, v := range pkg.Data.Categories {
			target, ok := catsByName[v.Name]
			if !ok {
				target = v
				if catIDs[v.ID] {
					target.ID = uuid()
				}
				if _, err = tx.Exec("INSERT INTO categories(id,name,sort_order) VALUES(?,?,?)", target.ID, target.Name, target.SortOrder); err != nil {
					return err
				}
				catsByName[target.Name] = target
				catIDs[target.ID] = true
			}
			catMap[v.ID] = target.ID
		}
		for _, v := range pkg.Data.Sites {
			u, _ := normalizeURL(v.URL)
			old, exists := sitesByID[v.ID]
			oldURL, _ := normalizeURL(old.URL)
			if v.DeletedAt != nil && exists && old.DeletedAt != nil && oldURL == u {
				report.Skipped++
				siteMap[v.ID] = old.ID
				continue
			}
			if duplicate, ok := activeByURL[u]; v.DeletedAt == nil && ok {
				report.Skipped++
				siteMap[v.ID] = duplicate.ID
				if duplicate.Name != v.Name || duplicate.Description != v.Description {
					report.Conflicts = append(report.Conflicts, v.Name)
				}
				continue
			}
			original := v.ID
			if exists {
				v.ID = uuid()
			}
			v.CategoryID = catMap[v.CategoryID]
			if err = insertSite(tx, v); err != nil {
				return err
			}
			sitesByID[v.ID] = v
			if v.DeletedAt == nil {
				activeByURL[u] = v
			}
			siteMap[original] = v.ID
			report.Added++
		}
		apps, err := allApplications(tx)
		if err != nil {
			return err
		}
		appIDs := map[string]bool{}
		pendingURLs := map[string]bool{}
		for _, v := range apps {
			appIDs[v.ID] = true
			if v.Status == "pending" {
				u, _ := normalizeURL(v.URL)
				pendingURLs[u] = true
			}
		}
		for _, v := range pkg.Applications {
			u, _ := normalizeURL(v.URL)
			if appIDs[v.ID] || v.Status == "pending" && pendingURLs[u] {
				report.ApplicationsSkipped++
				continue
			}
			if v.SiteID != nil {
				mapped, ok := siteMap[*v.SiteID]
				if !ok {
					return fail(400, "申请关联站点无法映射")
				}
				v.SiteID = &mapped
			}
			if err = insertApplication(tx, v); err != nil {
				return err
			}
			appIDs[v.ID] = true
			if v.Status == "pending" {
				pendingURLs[u] = true
			}
			report.ApplicationsAdded++
		}
		combined, err := s.snapshot(tx, true)
		if err != nil {
			return err
		}
		all, err := allApplications(tx)
		if err != nil {
			return err
		}
		check := Migration{Format: "inav-catalog", FormatVersion: 4, AppVersion: "validate", ExportedAt: now(), Data: combined, Applications: all}
		if err = check.validate(s.Defaults.Limits); err != nil {
			return err
		}
		return touch(tx)
	})
	return report, err
}
