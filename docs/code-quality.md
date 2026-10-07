# 代码规范与维护

以现有 TypeScript、Biome 和共享模型为基础。新增功能先沿用已有模块边界；复杂扩展通过代码实现，不增加通用插件或低代码层。目录总览和本地文件隔离规则见[项目结构](project-structure.md)。

## 模块职责

- `shared/catalog.ts` 定义公共目录、申请、迁移模型及运行时校验；引擎类型以这里的 `Engine` 为准。
- `shared/limits.ts` 定义前后端共同遵守的容量、分页和管理请求大小。领域含义不同的限制保持独立，避免因数值相同而误复用。
- `shared/resources.ts` 校验图片/模板地址并实现同源图片策略，界面通过 `src/hooks/useImageUrl.ts` 使用配置。新增图片入口不能绕过远程图片开关；不得增加固定外部代理或隐藏回退来源。
- `backend/` 是 Go 后端：`http.go` 负责传输和访问校验，`catalog.go` / `applications.go` 负责内容事务，`database.go` 保持 SQLite 与旧迁移兼容，`auth.go` / `backups.go` 提供认证和恢复。数据库写入与关联调整保持同一事务。
- `full_backup.go` 持有单一 ZIP 格式、校验与完整恢复，`operations.go` 持有运行版本和备份状态。日常备份统一使用 ZIP；历史 SQLite 只作为必要恢复输入。目录快照在同一事务读取，普通后台修改通过 `If-Match` 检查目录版本；冲突不自动覆盖草稿。
- 当前后端是一个应用包，同包的 `_test.go` 与源码放在同一目录，便于验证内部事务和边界。Go 以目录划分包；独立职责形成稳定接口后再拆包，不按实现与测试分别建目录。
- `scripts/export-runtime.ts` 从共享默认配置和限制生成 Go 使用的 JSON，避免手工维护第二套默认值。Go 对网络 JSON 进行严格类型、字段和关联校验；契约变化须同步两端及兼容测试。
- `src/components/admin/` 负责后台交互；`ui.tsx` 放共享界面控件。HTTP 请求在 `src/utils/adminApi.ts`，导入解析在 `src/utils/catalogImport.ts`。
- 展示配置由 `shared/catalog.ts` 的 `presentationSchema` 与 `backend/presentation.go` 共同校验；旧设置补默认值。`SiteLogo` 和 `SiteFooterInfo` 统一使用配置，浏览器元信息与服务端 HTML 同步。图片库交互复用 `admin/ImageField.tsx`，上传/读取/删除边界集中在 `backend/media.go`，文件位于数据目录，不能将 SVG 作为 HTML 插入页面。
- `src/utils/` 放可复用的解析、协调和数据转换；`src/hooks/` 管理 React 状态、订阅和副作用。全局浏览器类型声明集中在 `src/env.d.ts`。

复用 `src/components/atoms/Icons.tsx` 中已有图标，调用方显式设置所需尺寸和线宽。符号仅在有跨文件调用方时导出，删除确认无引用的实现，不保留预备组件库。

## 类型与命名

外部 JSON、浏览器存储和文件内容先视为 `unknown`，使用共享 schema 或明确类型守卫后再进入业务逻辑。泛型 HTTP 返回值只提供静态类型，不替代运行时校验。优先复用共享模型，不保留无调用方的预留类型，不用非空断言掩盖缺失值。

后台消费响应使用 `requestAdminData` 与 `shared/adminApi.ts` 中的响应 schema；仅忽略成功响应正文的操作使用 `requestAdminApi`。个人站点的存储写入成功后才更新 React 状态；失败保留原数据和表单，不能提示成功或静默退化为内存保存。

函数使用能说明动作的名称，如 `trashSite`、`restoreSite`；避免布尔参数改变同一个函数的动作含义。界面事件回调使用 `onClose`、`onPageChange` 等 `onX` 名称；后台动作执行器使用 `runAction`。布尔值表达条件，如 `canReplace`。局部名称在短作用域内保持简洁，跨模块类型与导出符号说明领域归属。

重命名内部符号时同步全部调用方；API 路径、持久化键和迁移格式另有兼容责任，不能作为普通命名整理随意修改。注释解释边界、取舍和失败处理，不宣称外部服务永久可靠。重要结构变更同步相关项目文档。

站内说明只写使用者需要知道的操作、数据保存与服务行为；技术栈、部署、数据库恢复和开发命令写入项目文档。可用功能的说明随公开配置变化。

## 界面样式

首页、后台与公开页面复用 `atoms/Button.tsx` 的 `buttonVariants`、`atoms/Input.tsx` 的 `inputVariants` 和主题变量。同类操作使用 36 px 常规按钮与单行表单控件，32 px 紧凑按钮；控件、卡片及气泡圆角为 8 px，弹窗为 16 px。分类徽章与卡片快捷操作按内容密度使用较小尺寸，避免把所有元素扩成常规按钮。

弹窗复用 `atoms/Dialog.tsx`；有特殊结构的个人站点表单和命令面板沿用相同 `dialog-*` 样式及 `useDialogLifecycle`。头尾固定、内容区单独滚动，不能让滚动条破坏外框圆角。启停设置使用 `Switch`，多选与确认使用 `Checkbox`；手机表单输入保持 16 px 字号，长名称与分类须限制宽度或换行。键盘聚焦、触屏操作、禁用和错误状态也属于视觉回归范围。

## 格式与检查

文件使用 UTF-8 和 LF。缩进由 `.editorconfig` 与 `biome.json` 控制；TypeScript、JSON 等使用 tab，Markdown、YAML、Shell 使用空格。Biome 负责支持文件的格式和导入排序，Go 使用官方 gofmt。版本化 Markdown、YAML、SQL 和根配置文件检查 LF、末尾换行；非 Markdown 文件还清除行末空白，Markdown 的双空格换行保留。基础文本检查不替代 Markdown/YAML/SQL 的语法或完整排版检查。

`migrations/` 中的 SQL 是例外：已发布文件的原始字节参与数据库迁移校验，格式化工具不会改写它们；新增迁移在发布前整理，发布后保持不可变。

检查环境需要 Bun、Go/C 编译器、Git 和 ShellCheck 0.11.0（加入 PATH）。ShellCheck 使用[官方发行版](https://github.com/koalaman/shellcheck/releases/tag/v0.11.0)，不引入 npm 下载包装器；Linux CI 固定安装同一版本。缺少工具时明确失败，不静默跳过。Go 和检查命令共用 Windows PATH 读取逻辑。

测试还需要 Node 22.18+；`check:full` 的部署演练需要 Bash、Python 3，浏览器回归需要预先安装 Chromium。

| 命令 | 范围 |
| --- | --- |
| `bun run format` | Biome 格式化、gofmt、基础文本格式修复，不做危险的 Lint 修复 |
| `bun run format:check` | 只检查上述格式，不修改文件 |
| `bun run lint` | Biome 格式/Lint/导入顺序、Go 格式与 vet、基础文本规范、ShellCheck |
| `bun run lint:fix` | 安全自动修复后执行 Go/Shell 检查，无法自动修复的问题仍报错 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run check` | Lint、类型检查、共享测试、界面测试和 Go 测试 |
| `bun run check:full` | 日常检查，加前后端生产构建、真实浏览器回归和部署演练 |

按需单独运行 `lint:frontend`、`lint:go`、`lint:shell`。CI 与发版脚本复用 `check:full`；CI 额外运行 Go race 和 Docker 构建。格式化不会扫描本地 `.agents` 或未跟踪的个人计划文档。

```bash
bun run format
bun run check
# 首次运行完整浏览器回归前安装 Chromium
bunx playwright install chromium
bun run check:full
```

`lint:fix` 只执行安全自动修复，仍需审查差异；不要直接对全库执行未限定规则的 unsafe 修复。`lint` 包含格式、导入排序和警告检查。禁止为让检查通过而宽泛关闭规则或添加无依据的断言。

整理无用文件、导出或依赖时可运行 `bunx knip --no-progress`；工具按需执行，不加入应用依赖。扫描结果仍需核对 CLI、动态导入和配置入口，不能直接批量删除。

测试优先覆盖数据边界、事务、恢复与异步竞态。样式和简单机械重命名通过针对性检查验证；影响长表单、滚动、焦点或移动端布局时做浏览器回归。测试使用隔离数据，不操作实际管理员账号或业务数据库。

Happy DOM 验证状态、事件和焦点；`tests/e2e` 使用独立临时数据库、随机端口与真实 Chromium 验证冲突、跨页刷新、上传、完整恢复和错误恢复。浏览器安装只需首次执行；产物默认位于系统临时目录的 `inavx-playwright-results`，可通过 `PLAYWRIGHT_OUTPUT_DIR` 指定。部署演练使用本地 Docker stub 和临时 SQLite 文件，不连接服务器。CI 同时验证 Linux 与 Windows 后端入口，Linux 运行 Go race、浏览器回归和部署演练；测试依赖不进入应用运行环境。
