<div align="center">

<img src="public/favicon.svg" alt="iNav Logo" width="64" height="64" />

# iNav

**轻、快、优雅的个人导航站**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[Demo](https://nav.dogxi.me) · [快速开始](#快速开始) · [功能特性](#功能特性) · [性能指标](#性能指标) · [待办规划](#待办规划)

</div>

---

## 预览

https://nav.dogxi.me

![desktop-home](./preview/desktop-home.webp)

<details>
  <summary>展开查看更多预览</summary>

  <br />

| 桌面端首页                                   | 移动端首页                                 | 命令面板                       | 创建站点                                   |
| -------------------------------------------- | ------------------------------------------ | ------------------------------ | ------------------------------------------ |
| ![desktop-home](./preview/desktop-home.webp) | ![mobile-home](./preview/mobile-home.webp) | ![panel](./preview/panel.webp) | ![create-site](./preview/create-site.webp) |

</details>

---

## 简介

iNav 是一个以 **i（intelligent & instant）** 为核心理念设计的个人导航站。  
专注于**极致使用体验**，而不是功能堆砌：

- 打开即用，任意键聚焦搜索
- ⌘K 命令面板秒级跳转任意站点
- 自定义添加 / 编辑 / 删除站点，数据永久保存在本地
- 浏览器书签一键导入，保留文件夹标签
- 亮暗主题零闪烁切换
- 公共后台管理、个人备份与匿名收录审核
- 默认不调用图标与元数据外部服务，按需配置辅助服务

---

## 快速开始

### 部署使用

单管理员后台与 Docker Compose 运行方式见 [部署、备份与恢复](docs/deployment.md)，操作流程见 [后台使用指南](docs/admin-guide.md)。后台入口为 `/admin`，支持站点、分类、设置、搜索引擎、回收站、申请审核和备份管理；访客个人数据仍保存在浏览器。

源码职责、命名、数据校验和检查命令见 [代码规范](docs/code-quality.md)。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/anosu/iNavX)

也可继续采用纯静态前台部署，构建时设置 `VITE_STATIC_MODE=true`；完整后端优先通过 Docker Compose 运行。

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/anosu/iNavX.git
cd iNavX

# 安装依赖
bun install --frozen-lockfile

# 启动后端，另一个终端启动前端
export APP_ORIGIN=http://localhost:5173
bun run dev:server
bun dev

# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

开发首页为 `http://localhost:5173`，后台为 `/admin`，访客申请为 `/submit`。首次使用后台运行 `go run ./backend setup-token` 获取初始化凭据。开发时 APP_ORIGIN 使用 `http://localhost:5173`，CLI 与服务使用相同数据目录。

后端需要 Go 1.27.1 与 C 编译器，Windows 建议通过 WSL 或 Docker 运行。`bun run preview` 仅预览静态文件；生产后台先执行 `bun run build:server`，再执行 `bun start`。生产容器只运行 Go 与 SQLite，没有 Node/Bun 运行时；Node 22.18+ 仅用于前端测试工具。

### 添加自定义站点

**方式一：通过 UI 添加（本地）**

该方式仅本地添加，不修改公共目录。公共内容通过 `/admin` 管理。

点击 Header 右侧的「+ 添加」按钮，填写表单后自动保存到 `localStorage`。

**方式二：后台管理公共内容**

访问 `/admin` 完成初始化后管理站点与分类，保存即生效。初始化方法见[部署说明](docs/deployment.md)。

**方式三：编辑纯静态模式数据**

纯静态模式可编辑 `src/data/sites.json` 后重新构建；全栈模式中此文件只用于首次初始化：

```json
{
  "id": "my-site",
  "name": "我的站点",
  "url": "https://example.com",
  "description": "站点描述",
  "iconUrl": "",
  "category": "效率",
  "pinned": false,
  "tags": ["工具"]
}
```

默认分类由 `shared/defaults.ts` 中的 `DEFAULT_CATEGORIES` 定义；全栈模式通过后台管理分类，纯静态模式修改默认分类后重新构建。

### 导入浏览器书签

1. Chrome / Firefox：菜单 → 书签 → 导出书签，得到 `.html` 文件
2. 点击页面工具栏中的「导入书签」按钮
3. 选择文件，导入到“其他”分类，同时保留文件夹标签；导入后可以编辑分类

---

## 功能特性

### 搜索与导航

| 功能                        | 说明                                                          |
| --------------------------- | ------------------------------------------------------------- |
| **任意键聚焦搜索**          | 非输入状态下按任意可打印字符，搜索框立即获焦                  |
| **多字段模糊搜索**          | 同时搜索站点名称、描述、标签、URL                             |
| **搜索关键词高亮**          | 匹配字符在卡片中实时高亮                                      |
| **搜索引擎快捷跳转**        | 输入关键词后可选 Google / Bing / DuckDuckGo / GitHub 直接搜索 |
| **分类筛选**                | 横向滚动分类标签条，点击筛选，再次点击取消                    |
| **Ctrl/Cmd + 1~9 快捷打开** | 搜索状态下，前 9 个结果可用数字键直接打开                     |

### 命令面板（⌘K）

- `⌘K` / `Ctrl+K` 打开或关闭命令面板
- 模糊搜索 + 相关度排序：名称完全匹配 > 前缀匹配 > 包含匹配 > 描述/标签匹配
- 键盘上下导航，`Enter` 执行选中项（站点在新标签页打开），`Esc` 关闭
- 无输入时分组展示最近打开、置顶站点和可用操作；最近记录只保存在本浏览器，可清空
- 搜索分类、标签后跳转首页筛选，也可使用已启用的搜索引擎检索
- 输入 `>` 仅查找操作：添加站点、切换主题、清除筛选、管理和收录申请等（按功能开关显示）
- 操作同时显示英文 ID 和中文说明，支持 `>add`、`>theme`、`>reset`、`>admin`、`>submit`、`>help`、`>clear-history`；可用英文 ID 或中文说明搜索，方向键选择后按 Enter 执行
- `>copy github` 选择并复制网站地址；`>hide github` 选择公共站点并确认本地隐藏。不输入站点名时列出可操作站点；隐藏仅影响本浏览器，支持恢复

### 站点管理

后台 `/admin` 管理公共内容：首页内容概览、分区导航、筛选与分页、手机卡片、站点编辑对话框、未保存提醒，以及保存后的反馈。

- **添加站点**：名称、URL、描述、分类、标签、置顶；默认使用文字图标，可指定本站图片或配置图标来源
- **编辑站点**：Hover 快捷按钮或右键菜单触发
- **删除站点**：带二次确认，防止误操作
- **内置站点本地隐藏**：可隐藏不需要的内置站点，随时恢复
- **置顶**：置顶站点始终排在网格首位

### 匿名收录申请

- 首页页脚与信息面板提供 `/submit` 入口，后台可以停止接收。
- 申请无需账号或邮箱，默认待审核；管理员可编辑后批准、拒绝或标记重复。
- 批准使用数据库事务，重复操作不重复创建站点；审核备注仅管理员可见。
- 提交限流、隐藏诱捕字段和可选 Turnstile 验证，部署配置见运行文档。
- 申请与审核历史纳入原生备份和版本 2 迁移包；仍接受版本 1 迁移包。
- 暂不提供申请状态查询、通知或申诉。

### 右键上下文菜单

在任意站点卡片上**右键**（桌面）或**长按 600ms**（移动端）弹出菜单：

- 在新标签页打开 / 复制链接
- 编辑 / 置顶（仅自定义或导入站点）
- 删除 / 本地隐藏（带二次确认）

菜单自动检测屏幕边界，滚动时自动关闭，支持键盘上下导航。

### 书签导入 / 导出

- **导入**：支持 Chrome / Firefox 标准 Netscape 书签 HTML，递归遍历文件夹，归入“其他”并保留文件夹标签
- **导出 JSON**：导出当前所有可见站点为结构化 JSON
- **导出书签 HTML**：导出为浏览器可直接导入的书签文件，按分类分组
- **个人备份与恢复**：保存和恢复个人条目、隐藏记录与偏好

### 主题系统

- 跟随系统偏好（`prefers-color-scheme`）或手动切换亮 / 暗色
- **零闪烁**：`<head>` 内联脚本在 FCP 前设置 `data-theme`，彻底消除白闪
- 主题偏好持久化到 `localStorage`，刷新后恢复

### 图片与辅助服务

默认不加载远程图标、不调用外部元数据代理，也没有固定第三方预连接。后台“站点设置 → 图片与辅助服务”可独立启用远程图片和链接标题/描述获取，并设置图标与元数据模板；搜索引擎地址和图标在“搜索引擎”中维护。可使用站内图片路径，例如 `/icons/example.svg`。Cloudflare Turnstile 是默认关闭的可选验证码，通过部署环境配置。

升级后，旧配置缺少的两个开关默认关闭，已保存的图片和模板地址不删除；需要继续使用时在后台启用。使用说明位于站内 `/about`，只介绍访客操作；开发、部署与恢复在本仓库文档中维护。

---

## 快捷键

| 快捷键                   | 功能                             |
| ------------------------ | -------------------------------- |
| `⌘K` / `Ctrl+K`          | 打开或关闭命令面板                     |
| 任意可打印字符           | 聚焦搜索框（非输入状态）         |
| `Ctrl+数字` / `⌘ + 数字` | 搜索状态下直接打开第 N 个结果    |
| `↑` `↓`                  | 命令面板导航                     |
| `Enter`                  | 命令面板：在新标签页打开选中站点 |
| `Esc`                    | 关闭命令面板 / 表单 / 弹窗       |
| 右键 / 长按              | 打开站点上下文菜单               |

---

## 性能指标

> 以下为原静态版本使用 Chrome Lighthouse 测量的历史数据，未对本次后台版本重新测量。

<img src="./preview/lighthouse.webp" alt="lighthouse" style="width: 400px;" />

| 指标              | 数值   | 说明                                    |
| ----------------- | ------ | --------------------------------------- |
| Performance       | 100    | 生产构建 preview 模式                   |
| Accessibility     | 100    | WCAG AA 色彩对比度全通过                |
| Best Practices    | 100    |                                         |
| SEO               | 100    | robots.txt + sitemap.xml                |
| 首屏 JS（gzip）   | ~111KB | react-dom 56KB + router 30KB + app 21KB |
| 主 chunk（gzip）  | 21KB   | 懒加载后的应用代码                      |
| TypeScript 覆盖率 | 100%   | strict 模式，零 any                     |

---

## 待办规划

1.0 版本规划：

- [x] 实现 iNav 后端 API
- [x] 实现 iNav 管理后台页面
- [x] 实现 iNav 更多自定义配置（后台一键设置）
- [x] 实现自定义分类
- [ ] 实现 iNav 浏览器扩展
- [x] 添加 Docker Compose 部署文件（运行验收见部署文档）
- [x] 匿名收录申请、管理员审核与申请数据迁移
- [ ] ...

新功能及建议欢迎提 [Issue](../../issues)，如果一拍即合，就会加入规划事项 = =。

---

## 控制功能可见性

全栈模式通过后台设置控制公共功能可见性。纯静态模式编辑 `src/config/features.ts`：

```ts
export const ALLOW_BOOKMARK_IMPORT = true // 书签导入入口
export const ALLOW_BOOKMARK_EXPORT = true // 书签导出入口
export const ALLOW_CUSTOM_SITES = true // 添加自定义站点
export const ALLOW_HIDE_BUILTIN = true // 本地隐藏内置站点
```

---

## License

MIT © [dogxii](https://github.com/dogxii)
