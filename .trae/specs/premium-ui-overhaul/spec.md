# 全局 UI 高级化升级（金色奢华风双主题）Spec

## Why

当前应用已具备较完善的"金色 + 毛玻璃"设计系统基础（[DESIGN\_SYSTEM.md](file:///d:/fundtracker/doc/DESIGN_SYSTEM.md) v3.1、[App.css](file:///d:/fundtracker/web/src/App.css) 全局变量与深色/浅色主题），Header、持仓页、自选页、统计页等核心界面已有不错质感。但整体仍存在以下可提升点，未达到"高级"的顶级金融产品观感：

1. **背景层次单一**：页面背景仅有极淡的径向渐变，缺少高级质感所需的"氛围光晕 + 噪点颗粒"层次，深色与浅色都显得偏平。
2. **品牌一致性脱节**：设计文档规定浅色主题为青玉色（霜白碧 #2E8B7B），但实际实现浅色用金色（#B8860B），文档与实现不一致；浅色主题的金色偏暗、缺少光感。
3. **核心数据缺少仪式感**：持仓总资产、当日/累计收益等重要数字是普通文字呈现，缺少大数字展示、金色渐变、计数动画等"金融产品级"表现。
4. **登录/注册页简陋**：[AuthLayout.tsx](file:///d:/fundtracker/web/src/layouts/AuthLayout.tsx) 仅是居中卡片 + 纯色背景，与主站高级质感脱节。
5. **组件观感不统一**：部分页面与弹窗仍以默认 Ant Design 观感为主（卡片、表格、按钮等），与精致组件（Header 沙漏、分组切换器）存在明显质感差。
6. **交互细节不足**：悬停反馈、入场动画、数字动效可进一步打磨，形成统一的高级交互语言。

用户目标：**不破坏现有业务逻辑与双主题架构**，将整体 UI 升级为"金色奢华风"（金 + 深蓝 / 暖白），覆盖**全部页面与全部组件**，观感达到金融投资类应用的一流质感。

## What Changes

- **新分支**：在 `main` 基础上创建代码分支 `feature/premium-ui-overhaul` 进行开发，完成后由用户决定合并时机。

- **统一品牌色为金色体系**：浅色/深色均以金色为品牌主色（浅色微调为更亮更暖的金，深色保持墨玉金 #D4A84B），同时同步更新 [DESIGN\_SYSTEM.md](file:///d:/fundtracker/doc/DESIGN_SYSTEM.md) 消除文档与实现脱节。

- **全局氛围背景**：在 [App.css](file:///d:/fundtracker/web/src/App.css) 新增分层氛围背景（金色/蓝色径向光晕叠加 + 细噪点颗粒 SVG data-URI），深色与浅色各一套，营造"金蕴深蓝"的沉浸感。

- **全局 Ant Design 组件精致化**：通过 App.css 全局覆盖统一升级 Card、Table、Button、Modal、Input、Segmented、Tabs、List、Tag、Dropdown、Empty、Spin 等组件的质感（圆角、边框、阴影、hover 反馈、金色焦点环）。

- **核心页面逐页升级**：Header（品牌标识 + 金色渐变底光）、BottomTabBar（金色激活药丸动效）、持仓页（金色奢华汇总面板 + 大数字 + 计数动画）、自选页、基金详情页、行情页、统计页、定投计划页、我的/设置页、登录注册页（高级玻璃卡片 + 品牌氛围背景）。

- **行业轮动子功能对齐**：将 [theme.css](file:///d:/fundtracker/web/src/features/industry-rotation/theme.css) 的金色体系与新的全局令牌对齐。

- **动效体系**：统一入场动画、hover 微交互、数字计数动画，尊重 `prefers-reduced-motion`。

- **隐私模式保持**：隐藏金额开关逻辑不受影响，`****` 占位符继承升级后的字体与字号。

## Impact

- Affected specs: 无既有 spec 直接冲突（本仓库 specs 目录无同类全局美化条目）。

- Affected code:

  - 全局样式：[web/src/App.css](file:///d:/fundtracker/web/src/App.css)（主要改动）

  - 应用入口：[web/src/App.tsx](file:///d:/fundtracker/web/src/App.tsx)（Ant Design token 微调）

  - 主题存储：[web/src/store/themeStore.ts](file:///d:/fundtracker/web/src/store/themeStore.ts)

  - 布局：[web/src/layouts/MainLayout.tsx](file:///d:/fundtracker/web/src/layouts/MainLayout.tsx)、[web/src/layouts/AuthLayout.tsx](file:///d:/fundtracker/web/src/layouts/AuthLayout.tsx)

  - 组件：[web/src/components/\*.tsx](file:///d:/fundtracker/web/src/components)（Header、BottomTabBar、FundListItem、MarketIndexStrip、GroupSwitcher、AnnouncementBanner 等）

  - 页面：[web/src/pages/\*\*/\*.tsx](file:///d:/fundtracker/web/src/pages)（全部页面）

  - 行业轮动：[web/src/features/industry-rotation/theme.css](file:///d:/fundtracker/web/src/features/industry-rotation/theme.css)

  - 设计文档：[doc/DESIGN\_SYSTEM.md](file:///d:/fundtracker/doc/DESIGN_SYSTEM.md)（同步品牌色规范）

- 纯前端改动，无后端/数据影响；所有既有功能与状态流转保持不变。

## ADDED Requirements

### Requirement: 金色品牌色统一（双主题）

系统 SHALL 以金色体系作为唯一品牌色，浅色与深色主题均使用金色系强调色，消除浅色主题为青玉色的文档/实现脱节。

#### Scenario: 深色主题品牌色

- **WHEN** 用户处于深色主题（`data-theme="dark"`）

- **THEN** 品牌主色保持墨玉金 `--accent-gold: #D4A84B`，亮色 `--accent-gold-light: #F0D78C`，弱色 `--accent-gold-dim: rgba(212, 168, 75, 0.15)`

#### Scenario: 浅色主题品牌色

- **WHEN** 用户处于浅色主题（`data-theme="light"`）

- **THEN** 品牌主色为暖金 `--accent-gold: #B8860B`，亮色微调为更亮更暖的 `--accent-gold-light: #D4A84B`，弱色 `--accent-gold-dim: rgba(184, 134, 11, 0.12)`；数值在实现阶段以视觉对比度为准微调，保证浅色背景上金色文字/按钮的 WCAG AA 对比度

#### Scenario: Ant Design token 同步

- **WHEN** 应用切换主题

- **THEN** [App.tsx](file:///d:/fundtracker/web/src/App.tsx) 中 `colorPrimary` 与 CSS 变量保持一致的浅/深金色值

### Requirement: 全局氛围背景与噪点

系统 SHALL 为页面提供分层氛围背景，包含多层径向光晕与细噪点颗粒，深色与浅色各一套，营造沉浸式高级质感。

#### Scenario: 深色氛围背景

- **WHEN** 用户处于深色主题

- **THEN** `body` 背景为深蓝黑底（`#0B1120`）+ 顶部金色光晕 + 右上冷蓝光晕 + 底部金色微光的三层径向渐变叠加，并叠加一层透明度极低（约 2-4%）的细噪点颗粒（SVG data-URI feTurbulence），`background-attachment: fixed`

#### Scenario: 浅色氛围背景

- **WHEN** 用户处于浅色主题

- **THEN** `body` 背景为暖白底 + 顶部金色光晕 + 底部暖金光晕，叠加同样的细噪点颗粒；光晕透明度（约 3-5%）需保证文字对比度不受影响

#### Scenario: 性能与降级

- **WHEN** 用户设备偏好减少动态效果（`prefers-reduced-motion`）或移动端（≤768px）

- **THEN** 光晕/噪点为静态渲染（无动画），噪点作为背景图不随滚动移动，避免重绘开销；无功能性影响

### Requirement: 全局 Ant Design 组件精致化

系统 SHALL 通过 App.css 全局覆盖统一升级各 Ant Design 组件的质感，与金色奢华风格一致。

#### Scenario: Card 卡片

- **WHEN** 用户查看任意 `.ant-card`

- **THEN** 卡片使用 `var(--bg-card)` 背景、`var(--border-subtle)` 边框、`var(--radius-lg)` 圆角、`var(--shadow-md)` 阴影；hover 时轻微上浮（translateY(-1px)）+ `--shadow-lg` + 金色描边光晕

#### Scenario: Table 表格

- **WHEN** 用户查看任意 `.ant-table`

- **THEN** 表头使用 `var(--bg-elevated)` + 半透明金底 + `--text-secondary` 字色，表体行使用 `var(--bg-card)`，hover 行 `var(--bg-card-hover)`；表格容器圆角与描边统一为卡片级

#### Scenario: Button 按钮

- **WHEN** 用户查看任意 `.ant-btn-primary`

- **THEN** 主按钮使用金色渐变背景（135deg `--accent-gold` → `--accent-gold-light`）+ 金色光晕阴影（`--shadow-glow-gold`）+ 白色文字；hover 亮度提升、active 轻微下压；次要/危险按钮使用对应语义色系

#### Scenario: Modal 弹窗

- **WHEN** 用户打开任意 `.ant-modal`

- **THEN** 弹窗内容 `var(--bg-elevated)` + `--radius-xl` 大圆角 + `--shadow-lg`；头部标题前有金色渐变竖条或顶部金色发丝高光；遮罩带轻微暗化 + 金色微晕

#### Scenario: Input 输入框

- **WHEN** 用户聚焦任意 `.ant-input` / `.ant-input-affix-wrapper` / `.ant-input-number` / `.ant-select-selector` / `.ant-picker`

- **THEN** 聚焦态使用金色边框 + 金色焦点环（`box-shadow: 0 0 0 2px var(--accent-gold-dim)`），圆角 `--radius-md`；input 前缀/后缀图标居中对齐

#### Scenario: Segmented / Tabs / Tag / Dropdown / List / Empty

- **WHEN** 用户查看这些组件

- **THEN** Segmented 选中项金色渐变背景 + 光晕；Tabs 激活标签金色下划线 + 金色文字；Tag 使用 `--flat-bg` / `--accent-gold-dim` 背景与对应文字色；Dropdown 菜单使用 `--bg-elevated` + 圆角 + 悬浮行 `--bg-card-hover`；List 项边框 `--border-subtle`；Empty 图标带金色调、描述文字 `--text-secondary`

### Requirement: Header 高级化

系统 SHALL 升级 Header 的品牌标识与视觉细节，保持现有沙漏刷新、主题切换、搜索等交互功能不变。

#### Scenario: 品牌标识升级

- **WHEN** 用户查看 Header 左侧品牌标识

- **THEN** "养基发财" 文字保留金色渐变（`--accent-gold` → `--accent-gold-light`），前置一个金色渐变圆角徽章（内嵌金币/走势图标，SVG），整体形成品牌标识 + 文字的完整组合；文字字重 800、字距 -0.02em

#### Scenario: 金色渐变底光

- **WHEN** 用户查看 Header 底部

- **THEN** Header 底部有一条 1-2px 的金色渐变发丝高光线（浅色 `rgba(184,134,11,0.18)` → 透明；深色 `rgba(212,168,75,0.25)` → 透明），可选轻微流光动画（尊重 reduced-motion）

#### Scenario: 图标按钮统一

- **WHEN** 用户查看 Header 的沙漏、主题切换、用户按钮

- **THEN** 三个按钮尺寸/圆角/描边统一（42×42 桌面 / 36×36 移动，圆角 10px，1.5px 描边 `--border-strong`，`--bg-card` 背景），hover 时金色边框 + 金色光晕（沿用现有 `header-icon-btn` 交互）

### Requirement: BottomTabBar 高级化

系统 SHALL 升级底部导航栏的激活态与整体质感，保持五个 Tab 路由与高亮逻辑不变。

#### Scenario: 金色激活药丸

- **WHEN** 用户在某个 Tab 处于激活状态

- **THEN** 激活 Tab 使用金色渐变背景药丸（`--accent-gold-dim` → 半透明白）+ 金色图标光晕（沿用现有 drop-shadow），图标轻微放大（scale 1.05）且上浮；未激活 Tab 保持灰阶

#### Scenario: 顶部发丝线

- **WHEN** 用户查看底部导航栏顶部

- **THEN** TabBar 顶部有一条与 Header 一致的金色渐变发丝高光线，替代现有 `0 -1px 0 var(--border-subtle)`

### Requirement: 持仓页金色奢华汇总面板

系统 SHALL 将持仓页汇总区升级为"金色奢华"主视觉，突出总资产与当日/累计收益，同时保持分组切换、隐藏金额、排序交互不变。

#### Scenario: 奢华渐变面板

- **WHEN** 用户查看持仓页汇总容器（`.portfolio-summary-container`）

- **THEN** 面板使用金色系渐变（深色：墨玉金微光叠加在深蓝上；浅色：暖金微光叠加在暖白上），左上/右上角有金色径向光晕装饰，顶部有金色发丝高光线，底部有微弱金色内发光

#### Scenario: 总资产大数字 + 计数动画

- **WHEN** 用户查看持仓页总资产

- **THEN** 总资产数值使用 Display 级字号（桌面 ≥28px、移动 ≥20px）、字重 800、金色渐变文字（`--accent-gold` → `--accent-gold-light`，`-webkit-background-clip: text`），数值变化时播放 500ms 计数动画（向上/向下滚动到新值，尊重 reduced-motion）；当日/累计收益保留红涨绿跌语义色，字号提升至 18px

#### Scenario: 当日/累计收益微标

- **WHEN** 用户查看持仓页收益区

- **THEN** 当日收益与累计收益各自带一个小的语义色圆点指示（红/绿），标签文字使用 `--text-secondary`、字距 0.02em，数值等宽字体 `.number-tabular`

#### Scenario: 隐藏金额

- **WHEN** 用户开启"隐藏金额"

- **THEN** 总资产与收益数值显示 `****`，计数动画不触发；`****` 继承升级后字号字体，语义色圆点保留

### Requirement: 持仓/自选列表行（FundListItem）升级

系统 SHALL 升级持仓与自选列表行的视觉层级与交互反馈，保持字段、状态标记、点击跳转逻辑不变。

#### Scenario: 行卡片质感

- **WHEN** 用户查看持仓列表行（`.fund-list-item`）

- **THEN** 行使用 `var(--bg-row-even/odd)` + `--radius-md` 圆角 + `--border-subtle` 边框，左右两端与表头/汇总对齐；hover 时金色微光边框 + 轻微右移（沿用现有交互）+ 阴影加深

#### Scenario: 涨跌色带保留

- **WHEN** 某只基金估算上涨/下跌

- **THEN** 行左侧 3px 涨跌色带保留（红涨/绿跌渐变），不因美化而丢失

#### Scenario: 数字层级

- **WHEN** 用户查看行内估算涨幅、当日收益、累计收益

- **THEN** 主数字（估算涨幅/收益）字号与字重优先，辅助数字（百分比、收益率）降级；统一使用 `--font-mono` 等宽字体与红涨绿跌语义色

### Requirement: 登录/注册页高级化

系统 SHALL 将登录/注册页从纯色居中卡片升级为品牌氛围背景 + 高级玻璃卡片，保持表单字段与校验逻辑不变。

#### Scenario: 品牌氛围背景

- **WHEN** 用户访问 `/login` 或 `/register`

- **THEN** [AuthLayout.tsx](file:///d:/fundtracker/web/src/layouts/AuthLayout.tsx) 全屏使用与全局一致的氛围背景（金色光晕 + 噪点），可叠加一个放大的品牌徽章水印或金色光晕放射装饰；登录/注册卡片为 `--bg-glass` 玻璃质感 + `--radius-xl` 圆角 + 金色顶部发丝高光

#### Scenario: 品牌标识与标语

- **WHEN** 用户访问登录/注册页

- **THEN** 卡片头部显示金色渐变品牌标识（与 Header 一致的徽章 + "养基发财"）+ 一句短标语（如"让每一笔投资清晰可见"），替代/装饰现有 antd 标题

#### Scenario: 表单控件

- **WHEN** 用户在登录/注册页输入

- **THEN** 输入框与主按钮遵循全局 Input/Button 精致化规则（金色聚焦环、金色渐变主按钮）

### Requirement: 其他页面一致性升级

系统 SHALL 对自选、统计、基金详情、行情、定投计划、我的、设置页应用全局升级后的令牌与组件样式，并修正明显的观感不一致。

#### Scenario: 页面标题统一

- **WHEN** 用户查看自选/统计/定投/我的/设置等带页面标题的页面

- **THEN** 页面标题统一为：18-22px、字重 700、负字距 -0.01em、`--text-primary`，标题前可带金色小竖条装饰（与品牌一致）

#### Scenario: 内容卡片统一

- **WHEN** 用户查看这些页面的内容卡片/区块

- **THEN** 卡片遵循全局 Card 精致化规则（圆角、描边、阴影、hover 上浮）；统计页概览卡片、基金详情页数据卡片、定投计划卡片等继承升级后的令牌

#### Scenario: 图表卡片

- **WHEN** 用户查看基金详情/统计/行情的 ECharts 图表卡片

- **THEN** 图表卡片容器遵循卡片规则，图表主色/面积渐变与金色体系一致（沿用 [utils/echarts.ts](file:///d:/fundtracker/web/src/utils/echarts.ts) 现有取色逻辑，按需微调金色系）

### Requirement: 行业轮动子功能对齐

系统 SHALL 将行业轮动页面的独立主题样式与新全局金色令牌对齐。

#### Scenario: 轮动主题对齐

- **WHEN** 用户访问行业轮动页面（`/market/rotation`）

- **THEN** [theme.css](file:///d:/fundtracker/web/src/features/industry-rotation/theme.css) 与 [rotationTerminal.css](file:///d:/fundtracker/web/src/features/industry-rotation/rotationTerminal.css) 中的品牌色/强调色使用新的金色 CSS 变量（或与之等价的色值），深色/浅色下与全局视觉一致；功能与交互不变

### Requirement: 动效体系统一

系统 SHALL 统一页面的入场动画、hover 微交互与数字计数动画，形成一致的高级交互语言，并尊重 `prefers-reduced-motion`。

#### Scenario: 页面入场

- **WHEN** 用户进入任一页面/切换视图

- **THEN** 主要内容使用 `fadeInUp` 系入场动画（沿用现有 `animate-fade-in-up`），列表/卡片支持交错延迟（沿用现有 stagger）；移动端禁用列表入场动画（沿用现有规则）

#### Scenario: 数字计数动画

- **WHEN** 持仓页总资产、当日/累计收益数值变化

- **THEN** 数值以 500ms 计数滚动方式过渡（自定义 hook 或 CSS/JS 实现），尊重 `prefers-reduced-motion` 时直接跳变

#### Scenario: 减少动态偏好

- **WHEN** 用户设备开启 `prefers-reduced-motion`

- **THEN** 所有新增动画（计数、流光、光晕）禁用或缩短，保证可用性

## MODIFIED Requirements

### Requirement: 全局设计令牌（App.css `:root` 与 `[data-theme="dark"]`）

系统 SHALL 在现有 [App.css](file:///d:/fundtracker/web/src/App.css) 设计令牌基础上扩展/微调，而非重构：新增氛围背景相关令牌（光晕色、噪点）、暖色阴影令牌、金色辉光令牌；浅色主题品牌色从"文档中的青玉"统一为"实现中的暖金"。

#### Scenario: 浅色主题阴影暖化

- **WHEN** 用户处于浅色主题

- **THEN** `--shadow-sm/md/lg` 使用带暖棕调（如 `rgba(180, 136, 11, 0.06-0.12)` 叠加）的阴影，替代冷灰阴影，提升"鎏金"质感

#### Scenario: 深色主题阴影加深

- **WHEN** 用户处于深色主题

- **THEN** 阴影在现有基础上微调加深，配合氛围背景保持层次感

### Requirement: Ant Design token（App.tsx）

系统 SHALL 微调 [App.tsx](file:///d:/fundtracker/web/src/App.tsx) 的 `antToken`，使 Ant Design 组件的金色主色与 CSS 变量一致，并同步 `colorBgContainer` / `colorBgElevated` 等背景令牌。

### Requirement: 设计文档同步（DESIGN\_SYSTEM.md）

系统 SHALL 更新 [DESIGN\_SYSTEM.md](file:///d:/fundtracker/doc/DESIGN_SYSTEM.md)，将浅色主题品牌色从"霜白碧 #2E8B7B"更正为"暖金 #B8860B / #D4A84B"，使文档与实现一致；更新版本号与变更记录。

## REMOVED Requirements

无删除项（仅作样式增强，不删除任何既有功能、状态标记、字段与交互）。

## 视觉排版草图

### 1. 整体氛围背景结构

```
┌────────────────────────────────────────────────────────┐
│  radial-gold 金色光晕 (顶部)                            │
│   ┌──────────────────────────────────────────────┐     │
│   │  radial-blue 冷蓝光晕 (右上, 深色)             │     │
│   │                                               │     │
│   │             页面内容 (page-stage)              │     │
│   │                                               │     │
│   └──────────────────────────────────────────────┘     │
│        radial-gold 微光 (底部)                          │
│   ▲ 细噪点颗粒 overlay (2-4% 透明度)                    │
└────────────────────────────────────────────────────────┘
```

### 2. Header 结构

```
┌────────────────────────────────────────────────────────┐
│ [◉金] 养基发财    [🔍 搜索基金代码/名称 ⚙]    [⏳] [🌗] [👤] │
│ ── 金色渐变发丝高光 (1-2px) ─────────────────────────   │
└────────────────────────────────────────────────────────┘
```

### 3. 持仓页汇总面板

```
┌────────────────────────────────────────────────────────┐
│  金色径向光晕(左上)      [分组切换器 pills]  [⚙]         │
│  ───────────────────────────────────────────────       │
│  总资产            ● 当日收益        ● 累计收益          │
│  金色渐变大字         +¥123.45        +¥4,567.89         │
│  ¥888,888.88        (红/绿圆点)      (红/绿圆点)         │
│   ▲ 计数动画 500ms                                       │
│  ── 金色发丝高光 + 底部内发光 ──                         │
└────────────────────────────────────────────────────────┘
```

### 4. 登录页布局

```
┌────────────────────────────────────────────────────────┐
│                金色氛围背景 + 噪点                       │
│                                                         │
│          ┌───────────────────────────┐                  │
│          │  [◉金] 养基发财            │  ← 品牌徽章+文字  │
│          │  让每一笔投资清晰可见       │  ← 标语          │
│          │  ── 金色发丝高光 ──        │                  │
│          │  [👤 用户名       ]        │                  │
│          │  [🔒 密码         ]        │                  │
│          │  [  ✦ 登 录  ✦  ]         │  ← 金色渐变按钮   │
│          │  还没有账号？去注册          │                  │
│          └───────────────────────────┘                  │
│                玻璃卡片 --radius-xl                     │
└────────────────────────────────────────────────────────┘
```

### 5. 双主题品牌色对照（统一为金色体系）

| 令牌                    | 浅色主题（鎏金白）             | 深色主题（墨玉金）             |
| --------------------- | --------------------- | --------------------- |
| `--accent-gold`       | #B8860B               | #D4A84B               |
| `--accent-gold-light` | #D4A84B               | #F0D78C               |
| `--accent-gold-dim`   | rgba(184,134,11,0.12) | rgba(212,168,75,0.15) |
| 页面底色                  | 暖白 #F7F8FA            | 深蓝黑 #0B1120           |
| 氛围光晕                  | 金色 3-5%               | 金色+冷蓝 3-6%            |
| 阴影                    | 暖棕调                   | 深色加深                  |

### 6. 响应式要点

```
移动端 (≤768px):
  总资产字号 ≥20px，汇总面板紧凑
  列表行沿用现有移动端规则（高度 48px、隐藏部分列）
  登录/注册卡片 95vw 内、圆角 16px

桌面端 (>768px):
  总资产字号 ≥28px，金色渐变大字
  登录卡片 420px 宽、圆角 24px
```

## 验收标准（供 checklist 使用）

1. `web` 目录 `npm run build` 通过、`npm run dev` 可运行。
2. 深色/浅色双主题下，所有页面与弹窗观感统一为金色奢华风，无突兀的默认 antd 观感残留。
3. 所有既有功能（搜索、刷新、排序、分组、增删改、隐藏金额、主题切换、路由、状态标记）无回归。
4. 移动端（≤768px）布局不溢出，触摸区域 ≥44px，入场动画禁用规则生效。
5. `prefers-reduced-motion` 下新增动画全部禁用/缩短。
6. 隐私模式：金额显示 `****`，百分比不隐藏，色块/圆点保留。
7. 金色文字在双主题下对比度符合 WCAG AA（≥4.5:1）。

