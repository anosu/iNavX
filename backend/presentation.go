package main

import (
	"html"
	"net/url"
)

func presentationImage(value string, settings Settings, base string) string {
	if value == "" || !resourceURL(value) {
		return ""
	}
	root, err := url.Parse(base)
	if err != nil {
		return ""
	}
	ref, err := url.Parse(value)
	if err != nil {
		return ""
	}
	resolved := root.ResolveReference(ref)
	if !settings.RemoteImagesEnabled && (resolved.Scheme != root.Scheme || resolved.Host != root.Host) {
		return ""
	}
	return resolved.String()
}

func presentationHead(settings Settings, base string) (string, string) {
	icon := presentationImage(settings.Presentation.FaviconURL, settings, base)
	if icon == "" {
		icon = base + "/favicon.svg"
	}
	extra := ""
	if touch := presentationImage(settings.Presentation.TouchIconURL, settings, base); touch != "" {
		extra += `<link rel="apple-touch-icon" href="` + html.EscapeString(touch) + `" />`
	}
	if share := presentationImage(settings.Presentation.ShareImageURL, settings, base); share != "" {
		extra += `<meta property="og:image" content="` + html.EscapeString(share) + `" /><meta name="twitter:image" content="` + html.EscapeString(share) + `" />`
	}
	return `<link rel="icon" href="` + html.EscapeString(icon) + `" />`, extra
}

type FooterLink struct {
	Label string `json:"label" required:"true"`
	URL   string `json:"url" required:"true"`
}

type Presentation struct {
	LogoDarkURL       string       `json:"logoDarkUrl"`
	FaviconURL        string       `json:"faviconUrl"`
	TouchIconURL      string       `json:"touchIconUrl"`
	ShareImageURL     string       `json:"shareImageUrl"`
	Author            string       `json:"author"`
	Keywords          string       `json:"keywords"`
	Subtitle          string       `json:"subtitle"`
	SearchPlaceholder string       `json:"searchPlaceholder"`
	Announcement      string       `json:"announcement"`
	InfoText          string       `json:"infoText"`
	AboutIntro        string       `json:"aboutIntro"`
	FooterText        string       `json:"footerText"`
	FooterLinks       []FooterLink `json:"footerLinks"`
	ShowInfoPanel     bool         `json:"showInfoPanel"`
	ShowClock         bool         `json:"showClock"`
	ShowStats         bool         `json:"showStats"`
	ShowAboutGuide    bool         `json:"showAboutGuide"`
}

func defaultPresentation() Presentation {
	return Presentation{SearchPlaceholder: "搜索站点...", InfoText: "个人收藏保存在当前浏览器。公共目录由管理员维护。", FooterLinks: []FooterLink{}, ShowInfoPanel: true, ShowClock: true, ShowStats: true, ShowAboutGuide: true}
}

func (p *Presentation) validate() error {
	for _, value := range []string{p.LogoDarkURL, p.FaviconURL, p.TouchIconURL, p.ShareImageURL} {
		if !resourceURL(value) {
			return fail(400, "品牌图片地址无效")
		}
	}
	for _, field := range []struct {
		value *string
		limit int
	}{
		{&p.Author, 100}, {&p.Keywords, 500}, {&p.Subtitle, 200}, {&p.SearchPlaceholder, 100}, {&p.Announcement, 2000}, {&p.InfoText, 2000}, {&p.AboutIntro, 10000}, {&p.FooterText, 1000},
	} {
		*field.value = trim(*field.value)
		if !text(*field.value, field.limit, false) {
			return fail(400, "站点展示文字无效")
		}
	}
	if p.SearchPlaceholder == "" || len(p.FooterLinks) > 8 {
		return fail(400, "搜索提示或页脚链接无效")
	}
	for i := range p.FooterLinks {
		link := &p.FooterLinks[i]
		link.Label = trim(link.Label)
		if !text(link.Label, 60, true) || link.URL == "" || !resourceURL(link.URL) {
			return fail(400, "页脚链接无效")
		}
	}
	if p.FooterLinks == nil {
		p.FooterLinks = []FooterLink{}
	}
	return nil
}
