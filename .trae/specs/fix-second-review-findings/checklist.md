# Checklist

## 工作流
- [x] 改动在从 dev 检出的独立功能分支（fix/second-review-findings）上进行，未直接提交 dev/main
- [x] 后端全部 JS node --check 通过
- [x] 前端 tsc --noEmit 零错误

## 第一阶段：阻断性 Bug
- [x] importExportController.js 已导入 getLocalToday，休市/缺 updateTime 时导入不抛 ReferenceError
- [x] PUT /settings 仅改 refreshFrequency 时 valuation_overrides 保持不变
- [x] GET /import-export/template 返回表头 xlsx，前端「下载导入模板」可用
- [x] 批量估值按 effectiveMethod 分组拉取，缓存键与估算方法一致，单基金覆盖真实生效

## 第二阶段：DRY 重构
- [x] 买卖结算只剩一份公共函数，pending/即时买入/新购确认三条路径口径一致
- [x] 更新状态判定只剩一份公共函数，单查/批查/持仓聚合返回 update_status 一致
- [x] 确认净值链复用 resolveConfirmedNav（结算场景走 getConfirmedNavByDate），无重复实现
- [x] 金额→份额→成本反算共用 computeSharesAndCost，create 与 update 一致

## 第三阶段：接口瘦身与数据正确性
- [x] /api/holdings 响应不含 DB 全字段与整包 realTimeData 冗余，前端无 undefined 读取
- [x] estimated_change 与 estimated_change_pct 语义已统一，无歧义
- [x] 交易「净值来源」要么持久化、要么显式清除，不再静默丢弃
- [x] holdingController.update 按 Holding.findById(id) 定位持仓

## 第四阶段：构建链路与质量
- [x] web build 先 tsc 类型检查，类型错误阻断发布
- [x] 前后端 ESLint 可执行，未导入符号可被捕获
- [x] 结算公共函数有单元测试且覆盖费用/份额/成本反算

## 第五阶段：文档 / 依赖 / 安全 / 精度
- [x] README 接口文档与实际路由一致，announcements 表已补充
- [x] capacitor 三包主版本一致
- [x] JWT_SECRET 为强随机且走环境注入，.env 已 gitignore
- [x] MarketDetailPage tooltip 与卡片涨跌幅基准一致（昨收），午休分隔线跟随 selectedIndex
- [x] statsController 月/年收益率分母口径正确