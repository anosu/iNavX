# 项目结构与文件归属

## 目录

```text
backend/             Go HTTP、SQLite、认证、媒体、备份与同包测试
shared/              TypeScript 数据契约、默认配置、校验与同目录单元测试
src/
  components/        atoms 基础控件、molecules 组合控件、organisms 页面区块、admin 后台
  config/            纯静态模式的构建期开关
  data/              纯静态目录适配器，不保存线上数据
  hooks/             React 状态、订阅与副作用
  pages/             路由页面
  utils/             浏览器存储、API、解析与数据转换
seed/                新数据库初始化与纯静态构建共用的示例目录
migrations/          已发布 SQL、顺序日志及历史元数据
public/              浏览器直接访问的静态资源
scripts/             构建、检查、发布与部署入口
tests/
  ui/                Happy DOM 交互测试
  e2e/               Playwright 浏览器回归与隔离夹具
  deploy.test.sh     本地部署与回退演练
docs/                使用、开发和部署文档，assets/ 存放文档图片
.github/workflows/   Linux 与 Windows CI
```

根目录保留包管理、编译、格式化、容器及托管配置，便于工具直接发现。Go 测试留在同包目录；共享模型测试与模型相邻；跨组件交互和端到端测试归入 `tests/`。不为目录整齐拆分尚无独立接口的 Go 应用包。具体模块边界见[代码规范](code-quality.md#模块职责)。

## 数据与配置边界

全栈模式以后台数据库为公共数据源。`seed/sites.json` 只在新数据库初始化时导入，或被显式纯静态构建读取；`shared/defaults.ts` 提供初始设置，`scripts/export-runtime.ts` 将共享默认值和限制生成到 `runtime/` 供 Go 读取。生成文件不手工维护、不提交。

`src/data/staticCatalog.ts` 负责将种子转换为静态目录，全栈浏览器构建不加载它。线上空目录是有效状态；修改种子不会更新既有实例。`migrations/` 的已发布 SQL 原始字节参与哈希验证，禁止移动、改写或格式化已有迁移。

## 本地与运行文件

| 路径 | 归属与处理 |
| --- | --- |
| `.agents/local-docs/` | 本地计划、审查与实例运维记录，保留但忽略 |
| `.agents/notes/` | 本地决策笔记，保留但忽略 |
| `.env`、`.env.*` | 本地环境配置，忽略；仅 `.env.example` 作为无凭据模板提交 |
| `data/`、`backups/` | 默认实例数据库、媒体与备份，忽略；不要通过清理源码删除 |
| `dist/`、`dist-ssr/`、`dist-server/`、`bin/`、`runtime/` | 可重新生成的构建产物，忽略 |
| `node_modules/`、`*.tsbuildinfo` | 依赖和编译缓存，忽略 |
| `test-results/`、`playwright-report/`、`coverage/` | 测试产物，忽略；E2E 默认写入系统临时目录 |

SQLite 文件及其 WAL/SHM/journal 边文件也被忽略，避免临时实例误提交。自定义 DATA_DIR、BACKUP_DIR 和测试输出路径应置于仓库外或上述忽略目录。下载的 ZIP 备份放入 `backups/`，不使用覆盖所有 ZIP 的规则，以免隐藏未来合法测试夹具。

`.gitignore` 管理版本控制边界，`.dockerignore` 管理本地容器构建上下文。文档图片、迁移元数据、种子和测试源码属于项目文件，必须提交；部署脚本只上传 `git archive` 中的已提交内容。本地资料不作为运行、CI 或正式文档的依赖。

移动文件时同步导入、构建复制路径、测试入口和文档链接；完成后运行[相应检查](code-quality.md#格式与检查)，确认全栈与纯静态构建均可读取正确资源。
