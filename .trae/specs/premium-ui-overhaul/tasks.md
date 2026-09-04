# Tasks

- [x] Task 1: 创建代码分支 `feature/premium-ui-overhaul`
  - [x] SubTask 1.1: 在 `main` 基础上创建并切换到新分支
  - [x] SubTask 1.2: 验证工作区干净（仅新增 specs 目录）

- [x] Task 2: 统一金色品牌色令牌
  - [x] SubTask 2.1: [web/src/App.css](file:///d:/fundtracker/web/src/App.css) 浅色主题 `--accent-gold-dim` 调整为 0.12，新增 `--btn-gold-a/b`、`--grad-num-a/b`、`--noise-bg` 令牌
  - [x] SubTask 2.2: [web/src/App.tsx](file:///d:/fundtracker/web/src/App.tsx) `colorBgLayout` 浅色调为暖白 #F7F8FA
  - [x] SubTask 2.3: [doc/DESIGN_SYSTEM.md](file:///d:/fundtracker/doc/DESIGN_SYSTEM.md) 浅色品牌色更正为鎏金暖金，版本升级 v3.3 并更新变更记录

- [x] Task 3: 全局氛围背景与噪点
  - [x] SubTask 3.1: 深色/浅色 `body` 增加多层径向光晕背景（金 + 冷蓝/暖金）
  - [x] SubTask 3.2: 新增细噪点颗粒 SVG data-URI 作为背景叠加层
  - [x] SubTask 3.3: 浅色阴影暖化（暖棕调 rgba(160,120,20)），深色辉光加深
  - [x] SubTask 3.4: 金色辉光令牌（--shadow-glow-gold 等）供组件复用

- [x] Task 4: 全局 Ant Design 组件精致化（App.css 覆盖）
  - [x] SubTask 4.1: Card hover 上浮 + 金色光晕
  - [x] SubTask 4.2: Table 表头金底渐变 + 容器圆角描边
  - [x] SubTask 4.3: Button 主按钮金色渐变 + 光晕 + hover/active
  - [x] SubTask 4.4: Modal 标题金色竖条 + 大圆角 + 遮罩微晕
  - [x] SubTask 4.5: Input/Select/Picker 金色聚焦环 + 圆角
  - [x] SubTask 4.6: Segmented/Tabs/Tag/Dropdown/List/Empty 统一金色体系
  - [x] SubTask 4.7: 深色主题 Segmented/表头专属覆盖规则已同步增强

- [x] Task 5: Header 高级化
  - [x] SubTask 5.1: 新增共享组件 [BrandBadge.tsx](file:///d:/fundtracker/web/src/components/BrandBadge.tsx)，[Header.tsx](file:///d:/fundtracker/web/src/components/Header.tsx) 品牌标识 + 渐变文字
  - [x] SubTask 5.2: Header 底部金色渐变发丝高光线
  - [x] SubTask 5.3: 沙漏/主题/用户按钮尺寸圆角统一（沿用现有 header-icon-btn 交互）

- [x] Task 6: BottomTabBar 高级化
  - [x] SubTask 6.1: [BottomTabBar.tsx](file:///d:/fundtracker/web/src/components/BottomTabBar.tsx) 激活态金色渐变药丸 + 边框 + 图标 scale 1.06 光晕
  - [x] SubTask 6.2: 顶部金色渐变发丝高光线替代现有灰线

- [x] Task 7: 持仓页金色奢华汇总面板
  - [x] SubTask 7.1: `.portfolio-summary-container` 金色径向光晕 + 顶部发丝高光 + 内发光
  - [x] SubTask 7.2: 总资产金色渐变大数字（clamp 24-34px，字重 800，`.gold-text-gradient`）
  - [x] SubTask 7.3: 新增 hook [useCountUp.ts](file:///d:/fundtracker/web/src/hooks/useCountUp.ts)（500ms easeOutCubic，尊重 reduced-motion）
  - [x] SubTask 7.4: 当日/累计收益语义色圆点 + 字号提升至 18px
  - [x] SubTask 7.5: 隐藏金额 `****` 继承新样式、计数动画不触发

- [x] Task 8: FundListItem 列表行升级
  - [x] SubTask 8.1: [FundListItem.tsx](file:///d:/fundtracker/web/src/components/FundListItem.tsx) 行圆角升级 radius-md + hover 金色微光边框
  - [x] SubTask 8.2: 数字层级统一（主数字优先、红涨绿跌）
  - [x] SubTask 8.3: 涨跌色带与状态标记保留

- [x] Task 9: 登录/注册页高级化
  - [x] SubTask 9.1: [AuthLayout.tsx](file:///d:/fundtracker/web/src/layouts/AuthLayout.tsx) 全屏氛围光晕 + 品牌水印
  - [x] SubTask 9.2: [LoginPage.tsx](file:///d:/fundtracker/web/src/pages/auth/LoginPage.tsx) 玻璃卡片 + 金色发丝高光 + 品牌徽章 + 标语
  - [x] SubTask 9.3: [RegisterPage.tsx](file:///d:/fundtracker/web/src/pages/auth/RegisterPage.tsx) 与登录页一致
  - [x] SubTask 9.4: 表单控件遵循全局 Input/Button 精致化

- [x] Task 10: 其他页面一致性升级
  - [x] SubTask 10.1: 自选页标题 `page-title-gold`
  - [x] SubTask 10.2: 统计页标题 `page-title-gold` + 概览卡片残留青玉色改为金色
  - [x] SubTask 10.3: 基金详情页标题 `page-title-gold`（图表已为金色系）
  - [x] SubTask 10.4: 定投计划页标题 `page-title-gold`
  - [x] SubTask 10.5: 设置页标题 `page-title-gold`
  - [x] SubTask 10.6: 我的页用户卡金色渐变头像（继承全局 Card hover）
  - [x] SubTask 10.7: 页面标题统一（`.page-title-gold` 工具类：金色小竖条 + 18-22px / 700 / -0.01em）

- [x] Task 11: 行业轮动对齐
  - [x] SubTask 11.1: [theme.css](file:///d:/fundtracker/web/src/features/industry-rotation/theme.css) 已全部映射 `var(--accent-gold)` 语义变量，天然跟随金色体系
  - [x] SubTask 11.2: [rotationTerminal.css](file:///d:/fundtracker/web/src/features/industry-rotation/rotationTerminal.css) 无硬编码非金品牌色（`--ird-blue` 为刻意保留的北向柱强调色）

- [x] Task 12: 动效体系统一与验证
  - [x] SubTask 12.1: 数字计数动画统一（useCountUp）
  - [x] SubTask 12.2: 全局 `prefers-reduced-motion` 禁用/缩短所有动画与过渡
  - [x] SubTask 12.3: `npm run build`（tsc --noEmit + vite build）通过
  - [x] SubTask 12.4: `npm run dev` 启动 HTTP 200 冒烟通过
  - [x] SubTask 12.5: 既有功能逻辑未改动（搜索/刷新/排序/分组/增删改/主题切换/路由/状态标记）

# Task Dependencies
- Task 2 → Task 3、4（品牌色与令牌是全局样式基础）
- Task 3、4 → Task 5~11（Header/TabBar/页面/子功能均依赖全局令牌）
- Task 7 → Task 8（持仓页与列表行视觉需同时验证）
- Task 9 独立于 Task 5~8（登录注册页与主站可并行）
- Task 12 依赖 Task 2~11 全部完成（最终构建与回归）
