/* ============================================================
   iNav Feature Flags
	   纯静态模式下的功能开关
	   - 连接后端时，以后台设置为准
   - 默认全部开启（true）
   ============================================================ */

/**
 * 是否允许用户自定义导入书签功能
 * - true：用户可以导入浏览器书签（HTML 文件）
 * - false：隐藏导入入口，用户无法导入书签
 */
export const ALLOW_BOOKMARK_IMPORT = true

/**
 * 是否允许用户手动添加自定义站点（添加卡片）
 * - true：用户可以添加/编辑/删除自定义站点
 * - false：隐藏「+ 添加」入口，用户无法自定义站点
 */
export const ALLOW_CUSTOM_SITES = true

/**
 * 是否允许用户导出书签/站点数据
 * - true：用户可以导出 JSON / HTML 书签文件
 * - false：隐藏导出入口
 */
export const ALLOW_BOOKMARK_EXPORT = true

/**
 * 是否允许用户清空导入的书签
 * - 仅在 ALLOW_BOOKMARK_IMPORT 为 true 时有效
 */
export const ALLOW_CLEAR_IMPORTED = true

/**
 * 是否允许用户对内置站点进行本地隐藏（本地删除）
 * - true：内置站点可以被本地标记为隐藏，不再显示
 * - false：内置站点不可隐藏
 */
export const ALLOW_HIDE_BUILTIN = true
