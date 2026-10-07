# 运行、部署与恢复

本项目提供单管理员后台与匿名收录申请、审核。操作流程见[后台使用指南](admin-guide.md)，目录与数据归属见[项目结构](project-structure.md)。

后端以单实例 Go / SQLite 运行，生产容器没有 Node、Bun 或 npm 运行时依赖。公共前台支持静态或分离托管；完整 Workers / D1 与 Vercel Functions 后端尚未适配。

## 本地开发

使用 Bun 1.3.12 安装前端依赖，后端需要 Go 1.27.1 与 C 编译器（SQLite 使用 CGO）。Linux 安装 gcc，macOS 安装命令行开发工具；Windows 可使用 MinGW-w64，将其 bin 目录加入 PATH，也可使用 WSL 或 Docker Compose。Node 22.18+ 仅用于前端测试工具。下文环境变量命令使用 Bash 语法；PowerShell 可改用 `.env` 与 Bun 脚本。

```bash
bun install --frozen-lockfile
export APP_ORIGIN=http://localhost:5173
bun run dev:server
```

另一个终端启动前端：

```bash
bun dev
```

打开 `http://localhost:5173`，后台位于 `/admin`。Vite 将 `/api` 转发到端口 3000。后端 APP_ORIGIN 必须与浏览器页面来源一致，CLI 与服务使用相同数据目录。

获取一次性初始化凭据：

```bash
bun run dev:server setup-token
```

在后台输入凭据并设置唯一管理员账号，密码至少 12 个字符。凭据在初始化后失效。凭据文件和数据库位于 DATA_DIR，访客个人数据仍位于各浏览器。

`bun run` 会加载 `.env` 并将环境变量传给子进程；直接运行 Go 或二进制时需自行设置环境变量。WSL 中先运行 `bun run build:runtime`，再在仓库根目录执行 `APP_ORIGIN=http://localhost:5173 go run ./backend`；前端可在 Windows 终端执行 `bun dev`。

构建、测试和本地生产运行：

```bash
bun run build
bun run test
bun run lint
bun run test:server
bun run build:server
bun start
```

`bun run lint:fix` 自动修复安全的格式与 lint 问题；修复后仍需审查差异并运行上述检查。模块职责、命名和校验约定见[代码规范](code-quality.md)。

生产运行默认地址 `http://localhost:3000`。直接运行 `./bin/inav serve`（Windows 为 `./bin/inav.exe serve`）即可，不需要 JavaScript 运行时；保留 `runtime/defaults.json`、`package.json`、`dist/`、`migrations/` 和 `seed/sites.json`。CLI 与服务使用相同工作目录、DATA_DIR 和 BACKUP_DIR。Bun 脚本支持原生 Windows 的 Go 构建和测试。

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec app inav setup-token
```

在 `.env` 中设置 APP_ORIGIN 为实际后台访问来源，包含协议、域名和非默认端口。例如 HTTPS 反向代理下设置 `https://nav.example.com`。该值用于修改请求来源校验和 Secure Cookie，不能随意填成容器内部地址。

PORT 是 Compose 的宿主机映射端口，容器内监听端口固定为 3000。公共前台与后台同域时 PUBLIC_ORIGIN 留空。容器以 UID/GID 1000 非 root 用户运行，数据库和备份分别保存在 `app_data` 与 `app_backups` 命名卷。绑定宿主目录时需要授予此用户写权限。

首次启动会执行 SQL 迁移、导入内置站点并生成初始化凭据。种子内容只导入一次，升级不会覆盖后台编辑。

`seed/sites.json` 保留用于新数据库初始化和显式纯静态部署，不包含在全栈浏览器构建中。全栈首页先等待公共目录接口；缓存仅在读取失败时兜底并显示提示，无缓存时显示错误与重试入口。空目录是有效响应，不恢复示例内容。

原始种子数据中的 DeepSeek 与 DeepSeek 文档指向同一 URL。初始化保留两个原 ID，将重复项移入回收站；可在回收站编辑正确地址后恢复。

后台保存站点、分类、设置和引擎立即生效。同一浏览器跨页通知、重新联网或切回页面会触发公共目录刷新；其他浏览器持续停留的页面不使用实时推送，可手动刷新。主题和排序保留个人选择，后台停用的公共功能及引擎不再提供。

Linux / amd64 的生产镜像实测：小目录进程 RSS 约 14 MiB；1000 条目录预热空闲约 19 MiB，200 次读取、并发 4 峰值约 23 MiB；单次密码登录约 45 MiB，10000 条导入/导出/合并/备份约 53 MiB，原生恢复约 33 MiB。约每 5 ms 采样，数值受字段长度和负载影响。Compose 的 128 MiB 是保护上限，GOMEMLIMIT=64MiB 是 Go 软限制，两者都不代表常驻占用；Docker stats 与 RSS 的缓存统计口径也不同。

## 图片、辅助服务与站点信息

默认不依赖外部图标和元数据接口，核心搜索、浏览、管理、备份和申请可在不配置这些服务时运行。后台可启用远程图片、配置站点图标模板、启用并配置元数据代理；具体字段见[后台指南](admin-guide.md#图片与辅助服务)。验证码默认关闭，Turnstile 配置仍由部署端持有，不开放任意验证码端点替换。

旧实例缺少 `remoteImagesEnabled` / `metadataFetchEnabled` 时按关闭处理；保留原模板与图片地址，不执行覆盖式数据迁移。需要继续使用旧来源时，在后台核对地址并开启对应开关。静态模式没有后台，修改 `shared/defaults.ts`、内置数据和 `public/` 资源后重新构建。

全栈服务的 `/robots.txt` 和 `/sitemap.xml` 根据 `PUBLIC_ORIGIN`（配置分离前台时）或 `APP_ORIGIN` 生成，不使用请求 Host 或固定演示域名。站点地图仅列出首页和使用指南，管理、接口和申请路径在 robots 中排除；robots 不替代认证。纯静态构建只提供通用 robots，不附带演示域名站点地图；需要索引时自行生成实际域名的 sitemap 并配置托管端。分离前台仍须将这两个地址代理到后端或在托管端生成。

站内 `/about` 面向访客，介绍搜索、收藏、备份和收录申请。技术栈、部署、账号初始化与服务器恢复只在项目文档说明，不向访客展示项目运维细节。

## 备份

后台“备份与迁移”提供迁移包导出、完整备份生成、校验、下载和永久删除；同时显示运行版本与最近备份状态。

- 迁移包包含公共内容、分类、配置、引擎、回收站及申请审核记录，不含管理员凭据与会话。Turnstile 和受信代理环境配置由部署端维护，不写入迁移包。
- 完整 ZIP 备份包含 `inav.sqlite`、`media/` 和 `manifest.json`（格式 `inav-backup`、版本 1、每个文件的大小和 SHA-256）。SQLite 与媒体在应用写锁保护下采集，文件以流式方式写入，不将整库或图库加载进内存。数据库文件上限 512 MiB，媒体沿用图片库容量限制。
- 访客个人备份由首页“导出”菜单生成，包含个人条目、隐藏和偏好；不属于服务器备份。
- 外部图片仍使用 URL，远程资源不随迁移包复制。
- 上传图片保存在 `DATA_DIR/media/`（默认 `data/media/`），完整 ZIP 已包含该目录；历史 SQLite 文件和 JSON 迁移包仍只包含图片地址。部署 `.env`、反向代理配置和访客个人数据不在 ZIP 中，应分别安全保存。

运行中的实例可通过后台创建完整备份。CLI 完整备份要求先停站，以独占实例锁阻止其他进程修改媒体：

```bash
docker compose stop app </dev/null
docker compose run --rm -T app backup </dev/null
docker compose up -d --no-build --wait app </dev/null
```

命令输出备份文件名，可复制到宿主机：

```bash
docker compose cp app:/app/backups/实际备份文件名.zip ./inav-backup.zip
```

自动备份的间隔和保留份数在后台设置，间隔为 0 时关闭自动备份。应用每分钟检查是否到期，重启时也会检查并补做一次到期备份；停机期间不会执行任务，也不会补齐每一个历史周期。备份使用 SQLite 一致性备份接口，不直接复制活跃主文件。删除数据不会修改旧备份，需要时可分别删除备份文件。

日常自动备份统一生成 ZIP；迁移保护仍可生成 SQLite 快照。两类文件分别按后台保留份数清理，升级前独立回退目录不受该策略影响。自动备份失败写入日志与后台状态。异机存储的目标由部署者指定，本项目不内置云存储凭据或擅自上传备份。

## 迁移包导入与恢复

后台先读取文件并展示文件名与数量摘要，随后选择操作。解析期间显示进度提示；切换文件后只采用最新选择的预览。导入错误显示在导入区域，修正或重新选择文件后再试：

- 合并导入：保留当前配置；匹配分类名称；相同活动 URL 跳过；冲突条目列在结果中。导入申请时映射关联站点，同 ID 的申请和重复待审核 URL 跳过，不覆盖当前审核结果。
- 覆盖恢复：仅用于完整迁移包，需要输入 `REPLACE`；替换公共内容、配置与申请历史，保留当前实例的管理员账号。

当前导出格式为版本 5，包含分类颜色、申请建议标签，并支持关联站点已永久删除的审核记录。版本 1～4 仍可导入，旧分类缺少颜色时补为空字符串（自动配色），旧申请缺少标签时补为空数组。新增 `categories.color` 列在启动时通过 `0004_category_color` 自动迁移，不修改已有分类名称和排序。版本 5 迁移包不能交给旧程序读取；升级前保留数据库备份，回退旧程序需同时恢复升级前数据库。版本 1 不含申请记录，覆盖恢复会清空当前申请历史，执行前自动备份。纯站点 JSON 和个人备份继续只用于合并公共条目。空分类、空站点和空引擎列表均合法，重启不会重新播种。

输入文件最大 8 MB，迁移模型最多 10000 个站点（含回收站）、1000 个分类和 100 个引擎。合并后也遵守这些上限。JSON 版本和关联分类校验失败时不会写入。预览后数据若变化，需要重新预览。

申请历史最多 10000 条。新版迁移包校验申请状态、审核时间及关联站点；收到新申请或处理申请也会让已有导入预览失效，避免覆盖新内容。

每次执行前生成数据库备份。恢复期间暂时拒绝其他修改请求，实际替换在数据库事务中进行。

站点 JSON、个人备份、Netscape 书签 HTML 只用于合并公共条目。它们不能覆盖整站设置，个人备份中的偏好不会被上传。

## 完整备份恢复

必须先停止服务。先完整检查 ZIP 路径、数量、大小、校验清单及解包后数据库的数据模型、迁移版本、完整性和外键。验证发生在临时目录；不通过时不替换当前内容。已有实例恢复前再生成完整备份。数据库与媒体统一恢复，并清除历史会话。

```bash
docker compose stop app </dev/null
docker compose run --rm -T --entrypoint sh app -c 'umask 077; cat > /app/backups/restore.zip' < ./inav-backup.zip
docker compose run --rm -T app verify-backup /app/backups/restore.zip </dev/null
docker compose run --rm -T app restore /app/backups/restore.zip </dev/null
docker compose up -d --no-build --wait app </dev/null
```

该上传方式让恢复文件由容器用户创建，避免下载文件的宿主 UID 和权限导致无法读取。新服务器先创建数据卷，再上传文件和执行恢复命令。恢复后使用备份中的管理员账号登录。备份的数据库版本高于目标镜像时拒绝恢复，应使用匹配的镜像。

本地二进制的对应命令：

```bash
./bin/inav verify-backup /absolute/path/to/backup.zip
./bin/inav restore /absolute/path/to/backup.zip
```

## 升级与回滚

如果进程在完整恢复期间中断，下一次启动先根据 `.restore-recovery/state.json` 回退到恢复前的数据库和媒体，不提供半恢复服务。不要手动删除仍含状态标记的恢复目录。文件校验用于发现损坏，不替代备份来源信任或加密。历史 `.sqlite` 可继续传给 `restore`，仅恢复数据库，媒体须另行匹配。

已有按提交保存源码的实例可使用部署脚本：

```bash
bash scripts/deploy.sh your-ssh-host /opt/stacks/inavx 完整40位提交哈希 --check
bash scripts/deploy.sh your-ssh-host /opt/stacks/inavx 完整40位提交哈希
```

脚本要求 Compose 的 app 镜像为 `inavx:<版本>`、build context 为 `./releases/<40位提交>`，数据路径为 `data/inav.sqlite`、`data/media` 与 `backups`。先只读预检，再上传已提交源码、构建、停站备份、迁移并核对原有字段及媒体、等待健康并写入 `deployment.json`。失败保存新数据副本并恢复匹配的旧 Compose/数据库。涉及删除或重写业务列的迁移需单独制定核对策略，默认脚本会拒绝不一致。脚本不会展开 `.env`、部署未提交文件或清理其他项目；旧发布与回退数据由部署者按已验证的恢复需求保留，不自动删除。

浏览器不维护多代旧资源。旧页面资源失效时显示明确的刷新入口，不自动刷新或尝试兼容旧管理写入。站点、分类、设置和引擎修改请求必须提供 `If-Match: "目录版本"`，缺少版本返回 428，版本过期返回 409；图片删除也检查图片库读取时的目录版本。认证、图片上传、备份等操作不使用该目录前置条件。

升级允许短暂停站：

```bash
docker compose stop app
docker compose run --rm app backup
docker compose build app
docker compose run --rm app migrate
docker compose up -d app
```

启动及 migrate 命令会检查数据库版本，发现待执行迁移时先创建升级前备份。迁移失败以非零状态退出，服务不会继续启动。保留原 Drizzle SQL 和日志以兼容旧数据库；新增迁移应添加 SQL、日志条目和回归验证，不修改已发布迁移的内容或哈希。Go 可直接升级原 Node 实例的数据卷，不重新创建管理员。

回滚时，旧镜像不一定能读取新数据库。先使用匹配镜像和升级前数据库备份完成恢复，再启动服务；保留原镜像或版本标签与对应备份。

## 密码重置

密码重置会使所有历史会话失效。通过终端临时传入 ADMIN_PASSWORD，不把密码写入项目配置：

```bash
export ADMIN_PASSWORD='替换成至少12字符的新密码'
docker compose run --rm -e ADMIN_PASSWORD app reset-password
unset ADMIN_PASSWORD
```

本地也可通过标准输入传入密码：

```bash
./bin/inav reset-password
```

输入密码并结束标准输入后执行。该命令不会在输出中打印密码。

永久删除管理员账号与全部会话时，先停止服务，再运行 `docker compose run --rm app reset-admin DELETE`。公共目录与申请不受影响；重新启动后通过一次性凭据创建管理员。此命令不会自动删除旧备份中的账号数据，旧备份可在后台单独删除。

## 公共前台分离与静态模式

公共前台可指定独立后台地址：

```bash
VITE_PUBLIC_API_URL=https://backend.example.com bun run build
```

后端 PUBLIC_ORIGIN 设置为公共前台的实际来源。公开读取和匿名申请接口允许此来源跨域，申请 JSON 请求支持预检；管理员后台继续访问后端自己的 `/admin`。

保留纯静态模式：

```bash
VITE_STATIC_MODE=true bun run build
```

静态模式使用内置 JSON 和现有构建期功能开关，不请求后端，也不提供可用的管理接口。动态品牌元数据由 Docker 服务返回；静态托管改变初始 HTML 元数据仍需重新构建或平台侧处理。

完整 Workers + D1 与 Vercel Functions 部署尚未实现，不能把本地 SQLite 数据卷直接用于这些平台。

## 匿名申请与防滥用

访客入口为 `/submit`，后台“站点设置”可以停止接收新申请，历史记录仍可审核。升级默认开启申请入口。提交不会直接发布，不保存访客 IP，不要求邮箱和账号，不提供状态查询与通知。公共接口只返回开关和验证码公开 key，不返回申请列表。

每个连接地址在 15 分钟内最多尝试 5 次，申请请求最大 8 KB，待审核队列上限 500 条；同 URL 的待审核申请不会重复落库。隐藏诱捕字段命中时返回接收提示但不保存。限流存在进程内存中，重启后重置。

登录/初始化每个连接地址在 15 分钟内最多尝试 10 次，成功后清除此地址的计数；同时处理 1 个密码验证请求，繁忙时返回 429，避免叠加 scrypt 内存。匿名申请为每个地址 5 次 / 15 分钟。两者共用受信代理地址解析，计数仍只保存在进程内存。

反向代理下，默认会按代理连接地址合并限流。需要识别真实客户端地址时，设置 `TRUSTED_PROXY_IPS` 为实际代理的完整 IP 地址（逗号分隔，不支持 CIDR）；只有这些连接发来的合法单个 `X-Real-IP` 才生效。代理必须覆盖客户端传入的同名头，并通过网络限制确保应用只允许代理连接。不要随意信任宿主机网关或填写访客地址。未设置时忽略所有客户端 IP 头。

按需启用 Cloudflare Turnstile：在 `.env` 同时填写 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY`，并在 Turnstile 控制台允许实际公共前台域名；然后重新创建应用容器。公开 key 提供给表单，secret 仅用于服务端验证。填写一个而缺少另一个会阻止启动。前端验证码 action 为 `submit`，服务端同时检查结果、域名和 action，验证不可用时不接收申请。

数据库升级新增 applications 表，旧公共内容、管理员凭据和浏览器个人数据保持兼容。上线前仍按本文件的停站、备份和 migrate 步骤操作。
