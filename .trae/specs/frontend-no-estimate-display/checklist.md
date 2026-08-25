# Checklist

## 类型定义验证
- [x] FundListItem.tsx 的 update_status 类型包含 'no_estimate'
- [x] WatchlistPage.tsx 的 update_status 类型包含 'no_estimate'
- [x] PortfolioPage.tsx 的 update_status 类型包含 'no_estimate'
- [x] FundDetailPage.tsx 的 fund 为 useState<any>，无需类型定义

## FundListItem 改动验证
- [x] renderUpdateIndicator 新增 case 'no_estimate' 分支（在 case 'confirmed' 之前）
- [x] no_estimate 徽章显示"前一日"（灰色 #6B7280 + 浅灰背景）
- [x] no_estimate 不再走 default 分支显示"已确认"
- [x] 持仓模式：no_estimate 时估算涨幅列下方追加带括号日期 `(MM-DD)`
- [x] 持仓模式：4 个数值列正常显示前一日数据，不置灰
- [x] 自选模式：no_estimate 时净值显示 '--'（opacity 0.4）
- [x] 自选模式：涨幅保留前一日数据

## FundDetailPage 改动验证
- [x] no_estimate 状态下净值区域显示 '--'
- [x] no_estimate 状态下涨幅标签为"前一日涨幅"
- [x] no_estimate 状态下涨幅值正常显示 estimated_change
- [x] no_estimate 状态下当日收益正常显示（基于前一日涨幅计算）
- [x] no_estimate 状态下涨幅值下方追加带括号日期 `(MM-DD)`

## 编译验证
- [x] TypeScript 编译不报新错误（仅 3 个预先存在的无关错误：Header.tsx/PortfolioPage.tsx settings、api.ts env）
