# Checklist

## 第一批：后端实锤 Bug
- [x] 删除分组后，该分组下所有持仓的 group_id 均被置空，且未误改其它持仓
- [x] 三条 pending 结算路径均检查 updateToConfirmed 返回值，并发下不重复结算
- [x] 后端与前端所有"今天"日期均使用本地时区，凌晨跨天不出现错位
- [x] normalizeDateStr 已抽取为公共工具，无重复实现

## 第二批：稳定性与性能
- [x] getOrFetch 对同一 key 在途请求去重
- [x] 三个 Map 缓存可被清理，无无限增长
- [x] 批量穿透估值对基准指数只请求一次
- [x] Header 定时器 setTimeout 已随 cleanup 清理
- [x] 数据页快速切换时旧响应不再覆盖新数据，无重复 history 请求
- [x] batchGetInfo 无 N+1 查询
- [x] quotes.js 聚合请求并行执行
- [x] useIsMobile hook 监听 resize，各处已替换
- [x] useMarketData 无 alive 死代码，轮询不重叠
- [x] 死代码（return null 函数、MOCK 数据、[DEBUG] 日志）已清理

## 第三批：界面美化与一致性
- [x] 浅色主题品牌色全局统一（文档与实现一致，金色）
- [x] 默认主题为深色，DESIGN_SYSTEM 文档已同步
- [x] --accent-green 变量已定义，覆盖态颜色正常
- [x] 移动端可取消自选
- [x] 底部导航在详情页/子路由有关联高亮
- [x] 状态标签无重复渲染，硬编码色值已收敛为 CSS 变量

## 第四批：安全与加固
- [x] 登录/注册有限流，helmet 启用，CORS 受限，x-powered-by 隐藏
- [x] 启动时校验 JWT_SECRET 等必需环境变量
- [x] 导入接口限制文件大小/类型，临时文件已清理
- [x] hideAmountStore 在 localStorage 不可用时不会崩溃