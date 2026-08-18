# Tasks

## 第一批：后端实锤 Bug 与账务一致性
- [x] Task 1: 修复删除分组改错持仓记录
  - [x] 在 models/holding.js 新增 `updateByGroupId(groupId, userId, fields)`（`UPDATE holdings SET ... WHERE group_id=? AND user_id=?`）
  - [x] groupController.delete 改用 `updateByGroupId(id, ...)` 后再删除分组
- [x] Task 2: 统一 pending 结算返回值检查
  - [x] holdingController.list 触发结算处检查 `updateToConfirmed` 返回值
  - [x] transactionController.settlePending 两处检查返回值，返回 false 时跳过持仓更新
- [x] Task 3: 统一本地日期
  - [x] 后端新增 server/utils/date.js 提供 `getLocalToday()` 与 `normalizeDateStr`
  - [x] 替换 fundService/dailyProfitService/planService/fundController/models/dailyProfit 中 UTC 日期推导
  - [x] 前端 FundDetailPage/StatsPage 改用 dayjs 本地日期
  - [x] 抽取公共 `normalizeDateStr`（现 4 处重复合并）

## 第二批：稳定性与性能
- [x] Task 4: globalCache 缓存击穿防护
  - [x] `getOrFetch` 维护 `inFlight` Map 去重在途请求
- [x] Task 5: 后端 Map 缓存并入 globalCache 或加 TTL 清理
  - [x] holdingsCache/etfLinkageCache/assetAllocCache 并入 globalCache 或加惰性清理与容量上限
- [x] Task 6: 批量穿透估值基准请求优化
  - [x] 基准涨跌幅在批量入口算一次传入 `getHoldingsEstimatedOverlay`
- [x] Task 7: 前端定时器泄漏修复
  - [x] Header.tsx 内部 setTimeout 句柄存入 ref 并在 cleanup 清理
- [x] Task 8: 数据页竞态与重复请求
  - [x] FundDetailPage 合并重复 history 请求、加 cancelled 标记
  - [x] MarketDetailPage/StatsPage 异步响应加竞态保护
- [x] Task 9: batchGetInfo N+1 优化
  - [x] 改为 WHERE code IN / fund_code IN 批量查询建 Map
- [x] Task 10: quotes.js 聚合并行化
  - [x] fetchIndices/fetchSectors 等用 Promise.all 并行
- [x] Task 11: useIsMobile hook
  - [x] 新增 web/src/hooks/useIsMobile.ts，替换各页面一次性 isMobile
- [x] Task 12: useMarketData 死代码与轮询重叠
  - [x] 删除 alive 死代码，加 inFlight 防重叠
- [x] Task 13: 死代码清理
  - [x] indices.js 内 return null 遗留函数删除
  - [x] fundService 未使用导出确认后移除
  - [x] 前端 MOCK 数据、[DEBUG] console.log 清理

## 第三批：界面美化与一致性
- [x] Task 14: 浅色主题品牌色统一为金色
  - [x] 保留 App.tsx antToken 与 App.css 金色实现
  - [x] 同步更新 doc/DESIGN_SYSTEM.md 品牌色描述为金色，消除文档与实现分歧
- [x] Task 15: 默认主题保留深色并同步文档
  - [x] index.html / themeStore 默认值保持 'dark'（现状）
  - [x] 同步更新 doc/DESIGN_SYSTEM.md 默认主题描述为深色，消除文档与实现分歧
- [x] Task 16: 修复未定义 CSS 变量 --accent-green
  - [x] App.css 双主题下补充 --accent-green / --accent-green-dim
- [x] Task 17: 移动端取消自选可达
  - [x] WatchlistPage 删除按钮移动端常显或长按/滑动
- [x] Task 18: 底部导航前缀匹配
  - [x] BottomTabBar 改用 startsWith 匹配
- [x] Task 19: 状态标签与硬编码色收敛
  - [x] FundListItem 抽独立 UpdateIndicator 组件去重
  - [x] 硬编码色值收敛为 CSS 变量（gain/loss/accent-gold）
  - [x] 组件内 `<style>` 收敛到 App.css（优先处理主要页面）

## 第四批：安全与加固
- [x] Task 20: 认证与请求安全
  - [x] 引入 express-rate-limit 对登录/注册限流
  - [x] 启用 helmet、限制 CORS 来源、隐藏 x-powered-by
  - [x] 启动时校验 JWT_SECRET 等必需环境变量
- [x] Task 21: 导入接口安全与临时文件清理
  - [x] multer 加 limits.fileSize 与 fileFilter
  - [x] 导入处理完成后在 finally 删除临时文件
- [x] Task 22: hideAmountStore 异常保护
  - [x] 顶层读 localStorage 加 try/catch 兜底

# Task Dependencies
- Task 1 依赖 holding model 修改（同批内）
- Task 3 涉及多文件，建议先建 utils/date.js 再替换
- Task 14 已确定品牌色为金色，不阻塞后续配色收敛
- 其余任务相互独立，可并行