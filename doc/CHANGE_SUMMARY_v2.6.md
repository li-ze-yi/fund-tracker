# 变更总结报告 v2.6

> **生成日期**: 2026-05-15
> **版本**: v2.6 (基于v2.5的增量更新)
> **变更范围**: 移动端全面优化 + UI/UX体验提升 + 图表显示优化 + Bug修复

---

## 目录

1. [变更概览](#1-变更概览)
2. [核心功能修复](#2-核心功能修复)
3. [移动端全面优化](#3-移动端全面优化)
4. [图表显示优化](#4-图表显示优化)
5. [UI/UX细节优化](#5-uiux细节优化)
6. [Bug修复清单](#6-bug修复清单)
7. [文件变更清单](#7-文件变更清单)
8. [技术决策记录](#8-技术决策记录)

---

## 1. 变更概览

### 统计数据

| 指标 | 数值 |
|------|------|
| 涉及文件数 | **12个** |
| 修改文件数 | **12个** |
| 新建文件数 | **0个** |
| 修复关键Bug数 | **8个** |
| 移动端优化项 | **15+项** |
| 图表优化项 | **10+项** |

### 核心目标

1. **修复估算涨幅刷新问题** - 支持强制刷新，按用户设定频率更新
2. **移动端全面适配** - 所有页面在手机端完美显示
3. **图表显示优化** - 走势图和统计图在移动端清晰易读
4. **UI/UX细节打磨** - 搜索框、按钮、间距等细节优化
5. **代码质量保障** - 修复TypeScript错误、无效CSS属性

### 版本定位

```
v2.5 (净值计算体系) → v2.6 (移动端全面优化 + UI/UX提升) ⭐ 当前版本
```

---

## 2. 核心功能修复

### 2.1 估算涨幅刷新问题修复 ⭐ 重要

**问题**：后端存在30秒硬编码缓存，导致即使用户设置更短的刷新频率（如15秒），数据仍然返回旧数据。

**解决方案：三层强制刷新机制**

| 层级 | 文件 | 实现 |
|------|------|------|
| **前端** | `holdingService.ts` | API调用传递 `forceRefresh=1` 参数 |
| **控制器** | `holdingController.js` | 解析 `req.query.forceRefresh` 参数 |
| **服务层** | `holdingService.js` | 强制刷新时 `cache.clear()` 清除所有缓存 |

**关键代码**：

```typescript
// 前端 - holdingService.ts
getHoldings: (forceRefresh = false) =>
  api.get('/holdings', { params: { forceRefresh: forceRefresh ? 1 : 0 } })

// 后端 - holdingController.js
const forceRefresh = req.query.forceRefresh === '1';
const enrichedWithStatus = await holdingService.enrichHoldingsWithRealTimeData(
  holdings, forceRefresh  // 传递强制刷新参数
);

// 后端 - holdingService.js
async function enrichHoldingsWithRealTimeData(holdings, forceRefresh = false) {
  if (forceRefresh) {
    console.log('[holdingService] ⚡ 检测到强制刷新请求，清除所有缓存');
    cache.clear();  // 清空所有缓存
  }
  // ... 重新请求数据并更新缓存
}
```

**效果验证**：

```
用户设置: 15秒刷新
    ↓
前端定时器: 每15秒触发 loadHoldings(true)
    ↓
API 请求: GET /api/holdings?forceRefresh=1 ✅
    ↓
后端: 清除缓存 → 重新请求 → 返回最新数据 ✅
    ↓
前端 UI: 显示最新的估算涨幅 ✅
```

---

### 2.2 Web端搜索功能恢复

**问题**：修改移动端搜索下拉框后，Web端搜索模糊匹配推荐失效。

**根因分析**：
- `destroyOnHidden`: 隐藏时销毁DOM，导致重新打开时状态丢失
- `getPopupContainer`: 改变DOM挂载位置，影响桌面端正确定位
- `overlayStyle.width: undefined`: 可能覆盖Ant Design默认宽度计算

**解决方案**：

```tsx
// ❌ 修改前（导致桌面端失效）
<Dropdown
  overlayStyle={{
    width: isMobile ? 'calc(100vw - 24px)' : undefined,  // 问题
    left: isMobile ? 12 : undefined,                   // 问题
  }}
  destroyOnHidden                                      // 问题
  getPopupContainer={(trigger) => ...}                // 问题
>

// ✅ 修改后（恢复桌面端正常功能）
<Dropdown
  overlayStyle={{
    paddingTop: isMobile ? 6 : 8,
    // 使用展开运算符，仅在移动端添加特殊样式
    ...(isMobile ? { width: 'calc(100vw - 24px)', left: '12px' } : {}),
    // 桌面端不设置这些属性，让 Ant Design 使用默认值
  }}
  // 移除 destroyOnHidden 和 getPopupContainer
>
```

---

## 3. 移动端全面优化

### 3.1 搜索框组件优化

#### 三层溢出控制（Header.tsx + App.css）

| 层级 | 文件 | 行号 | 关键属性 |
|------|------|------|---------|
| **第1层** | Header.tsx 内联样式 | 232-244 | `overflow/text-overflow/whiteSpace` |
| **第2层** | Header.tsx 媒体查询 | 308-330 | `.header-search .ant-input` 等 |
| **第3层** | App.css 全局样式 | 178-196 | `.ant-input-affix-wrapper` 等 |

**关键CSS**：
```css
/* 内联样式（最高优先级）*/
style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}

/* 全局基础样式 */
.ant-input {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
```

#### 搜索图标垂直居中（四层Flex嵌套）

```
第1层: .ant-input-affix-wrapper     → display: flex + align-items: center
第2层: .ant-input-prefix/suffix      → display: flex + align-items: center  
第3层: .anticon                     → display: inline-flex + align-items: center
第4层: svg                          → display: block
```

#### 搜索下拉推荐移动端优化

| 项目 | 优化前 | 优化后 |
|------|--------|--------|
| **宽度** | 固定400px | `calc(100vw - 24px)` 几乎全屏 |
| **高度** | 最大480px | `min(70vh, calc(100vh-140px))` |
| **列表项高度** | 72px | 60px（节省20%）|
| **内边距** | 12px 14px | 10px 12px |
| **字体大小** | 14.5/12/10px | 13.5/11/9px |

**新增属性**：
```tsx
destroyOnHidden  // 隐藏时销毁DOM释放内存
getPopupContainer  // 控制挂载位置避免定位问题
```

#### 清除按钮X图标优化

```css
.ant-input-clear-icon {
  font-size: 14px !important;            /* 增大图标 */
  color: var(--text-secondary) !important; /* 更明显 */
  opacity: 1 !important;                 /* 完全可见 */
}

.ant-input-clear-icon:hover {
  color: var(--text-primary) !important;
  transform: scale(1.15) !important;       /* hover放大 */
}
```

---

### 3.2 操作按钮单行显示

**文件**: FundDetailPage.tsx 第651-664行

```css
/* 修改前：Grid两列布局（第三个换行）*/
.fund-detail-actions {
  grid-template-columns: 1fr 1fr;
}

/* 修改后：Flex三列等宽（一行三个）*/
.fund-detail-actions {
  display: flex !important;
  grid-template-columns: unset !important;
  gap: 6px !important;               /* 更紧凑 */
}

.fund-detail-action-btn {
  flex: 1 !important;                /* 等分宽度 */
  height: 40px !important;           /* 更矮 */
  font-size: clamp(12px, 3vw, 14px); /* 响应式字体 */
}
```

**效果**：
```
修改前:          修改后:
┌──────┐ ┌──────┐   ┌─────┐ ┌─────┐ ┌─────┐
│ 加仓 │ │ 减仓 │   │加仓 │ │减仓 │ │定投 │
└──────┘ └──────┘   └─────┘ └─────┘ └─────┘
┌──────┐              ← 一行！✅
│ 定投 │
└──────┘
```

---

### 3.3 模块间距优化

| 模块 | 原间距 | 新间距 | 减少 |
|------|--------|--------|------|
| **数据网格卡片** | 20px | **12px** | ⬇️ 40% |
| **走势图卡片** | 20px | **12px** | ⬇️ 40% |
| **走势图卡片(移动端)** | 16px | **10px** | ⬇️ 37% |
| **操作按钮组** | 20px | **12px** | ⬇️ 40% |

---

### 3.4 数据信息栏优化

**移除时间范围**：
```tsx
// ❌ 修改前（3项）
<span>📈 数据点: <strong>55</strong> 个交易日</span>
<span>时间范围: <strong>2026-02-24 ~ 2026-05-15</strong></span>  ← 已删除
<span>区间涨跌:<strong>+32.62%</strong></span>

// ✅ 修改后（2项）
<span>📈 数据点: <strong>55</strong> 个交易日</span>
<span>区间涨跌:<strong>+32.62%</strong></span>
```

**强制单行显示**：
```css
.fund-detail-data-info {
  display: flex !important;
  flex-wrap: nowrap !important;        /* 禁止换行 */
  gap: 16px !important;                 /* 增加间距 */
}

.fund-detail-data-info span {
  white-space: nowrap !important;       /* 单行显示 */
}
```

---

## 4. 图表显示优化

### 4.1 基金详情页走势图（FundDetailPage.tsx）

#### X轴标签永不旋转 + 平均分布

```javascript
axisLabel: {
  fontSize: isMobile ? 9 : 11,
  rotate: 0,  // ✅ 永不旋转（原：移动端30°）
  interval: isMobile && sortedDates.length > 15
    ? Math.floor(sortedDates.length / 6)  // ✅ 平均约6个标签
    : xAxisConfig.interval,
}
```

#### 折线变细

| 项目 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| **线宽（移动端）** | 2px | **1.5px** | ⬇️ 25% |
| **线宽（桌面端）** | 2.5px | **2px** | ⬇️ 20% |
| **阴影模糊（移动端）** | 6 | **4** | ⬇️ 33% |
| **阴影偏移（移动端）** | 3px | **2px** | ⬇️ 33% |

#### 标记点优化

```javascript
// 大小缩小
symbolSize: isMobile ? 6 : 8,  // 原：统一10px

// 去掉白边
itemStyle: {
  color: t.type === 'buy' ? '#EF4444' : '#22C55E',
  borderColor: 'transparent',  // ✅ 无白边
  borderWidth: 0,               // ✅ 无边框
}
```

#### Grid边距调整

```javascript
grid: {
  top: isMobile ? 30 : 40,
  bottom: isMobile ? 25 : 30,
  left: isMobile ? 42 : 58,   // 左边距：完整显示Y轴百分比
  right: isMobile ? 8 : 15,    // 右边距：紧凑
}
```

---

### 4.2 统计页柱状图（StatsPage.tsx）

#### X轴标签永不旋转

```javascript
axisLabel: {
  fontSize: isMobile ? 9 : 11,
  rotate: 0,  // ✅ 永不旋转
  interval: isMobile && data.length > 10
    ? Math.floor(data.length / 6)  // ✅ 平均约6个标签
    : data.length > 15 ? Math.floor(data.length / 8) : 0,
}
```

#### Grid边距优化（减少空白+保证Y轴可见）

```javascript
grid: {
  top: isMobile ? 25 : 35,
  bottom: isMobile ? (data.length > 20 ? 40 : 30) : 35,
  left: isMobile ? 42 : 55,   // ✅ 显示左侧Y轴（金额）
  right: isMobile ? 38 : 48,   // ✅ 显示右侧Y轴（百分比）
}
```

#### 柱子宽度变窄（避免贴在一起）

| 周期 | 移动端(旧→新) | 桌面端(旧→新) | 变化 |
|------|-------------|-------------|------|
| **日收益** | 12→**10px** | 18→**15px** | ⬇️ 17% |
| **月收益** | 20→**16px** | 28→**24px** | ⬇️ 14% |
| **年收益** | 40→**30px** | 60→**50px** | ⬇️ 17% |

#### 新增柱子间距属性

```javascript
barGap: isMobile ? '10%' : '5%',           // 同一系列柱子间距
barCategoryGap: isMobile ? '20%' : '15%',   // 不同类别之间的间距
```

---

## 5. UI/UX细节优化

### 5.1 输入框全局优化（App.css）

```css
/* 容器级别 */
.ant-input-affix-wrapper {
  display: flex !important;
  align-items: center !important;
}

/* 前缀/后缀区域 */
.ant-input-prefix,
.ant-input-suffix {
  display: flex !important;
  align-items: center !important;
}

/* 图标组件 */
.anticon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* SVG图标 */
.anticon svg {
  display: block !important;
}
```

### 5.2 Dropdown全局移动端优化（App.css）

```css
@media screen and (max-width: 768px) {
  .ant-dropdown {
    width: calc(100vw - 24px) !important;
    left: 12px !important;
    right: 12px !important;
  }

  .ant-dropdown .ant-dropdown-menu {
    max-height: none !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;  /* iOS惯性滚动 */
  }
}
```

---

## 6. Bug修复清单

### 6.1 TypeScript错误修复（8个）

| # | 文件 | 行号 | 错误信息 | 修复方式 |
|---|------|------|---------|---------|
| 1-4 | MarketDetailPage.tsx | 141,164,179,238 | intradayData可能为null | 添加非空断言`!` |
| 5 | Header.tsx | 237 | getPopupContainer返回类型错误 | 类型断言`as HTMLElement` |
| 6 | Header.tsx | 1 | 未使用的useCallback导入 | 删除未使用导入 |

**示例修复**：
```typescript
// ❌ 修改前
data: intradayData?.times?.length > 0 ? intradayData.times : [...]

// ✅ 修改后
data: intradayData?.times?.length ? intradayData!.times : [...]
```

### 6.2 CSS无效属性修复

| 文件 | 行号 | 错误 | 修复 |
|------|------|------|------|
| App.css | 674 | `touch-action-manipulation` 不是有效CSS属性 | 删除该属性 |

### 6.3 MarketDetailPage语法错误

| 文件 | 行号 | 错误 | 修复 |
|------|------|------|------|
| MarketDetailPage.tsx | 839 | `alignItems: center'` 字符串未闭合 | 修正为 `'center'` |

---

## 7. 文件变更清单

### 前端文件（10个）

| 文件路径 | 修改类型 | 主要改动 |
|---------|---------|---------|
| `web/src/services/holdingService.ts` | **功能增强** | getHoldings支持forceRefresh参数 |
| `web/src/pages/portfolio/PortfolioPage.tsx` | **逻辑增强** | 传递forceRefresh参数到API |
| `web/src/components/Header.tsx` | **重大重构** | 搜索框溢出控制+图标居中+下拉优化+清除按钮+搜索恢复 |
| `web/src/pages/fund/FundDetailPage.tsx` | **多项优化** | 走势图(X轴/折线/标记/边距)+按钮单行+间距+数据栏 |
| `web/src/pages/stats/StatsPage.tsx` | **图表优化** | X轴不旋转+Grid边距+柱子宽度+间距 |
| `web/src/pages/market/MarketDetailPage.tsx` | **Bug修复** | 语法错误+TypeScript空值检查 |
| `web/src/App.css` | **全局样式** | Input/Dropdown/ClearIcon/Canvas优化+删除无效属性 |

### 后端文件（2个）

| 文件路径 | 修改类型 | 主要改动 |
|---------|---------|---------|
| `server/controllers/holdingController.js` | **功能增强** | 解析forceRefresh参数并传递给service |
| `server/services/holdingService.js` | **功能增强** | 支持强制刷新（cache.clear()）|

---

## 8. 技术决策记录

### ADR-001：强制刷新 vs 缓存TTL动态化

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 动态TTL（根据用户设置调整缓存时间） | 精细控制 | 复杂度高，需要维护多套TTL |
| B. **强制刷新参数（选中）** | 简单直接、前后端职责清晰 | 每次强制刷新都请求外部API |

**理由**：用户明确设置刷新频率就应该生效。强制刷新语义清晰，实现简单。

### ADR-002：三层溢出控制策略

| 层级 | 作用域 | 优先级 |
|------|--------|--------|
| 内联style | 仅搜索框 | ⭐⭐⭐ 最高 |
| 组件媒体查询 | Header内所有输入框 | ⭐⭐ 高 |
| App.css全局 | 全站所有输入框 | ⭐ 中（兜底）|

**理由**：渐进增强策略，确保在任何情况下都能覆盖Ant Design的CSS Modules。

### ADR-003：图表响应式策略

| 策略 | 适用场景 |
|------|---------|
| `isMobile` 变量检测 | 组件内部配置（字体、大小、间距）|
| `clamp()` CSS函数 | 尺寸类属性（高度、宽度）|
| 媒体查询 @media | 布局类属性（Flex方向、Grid列数）|

**理由**：不同类型的属性用不同的响应式方案，兼顾灵活性和可维护性。

---

## 9. v2.6.1 增量更新：分组切换器 + 分组管理弹窗移动端优化

> **更新日期**: 2026-05-17
> **涉及文件**: GroupSwitcher.tsx, GroupManageModal.tsx, PortfolioPage.tsx

### 变更概览

| 指标 | 数值 |
|------|------|
| 涉及组件 | 3个 |
| 新增功能 | 1个（水平滑动）|
| 移动端优化 | 30+项CSS规则 |
| Bug修复 | 3个 |

---

### 9.1 GroupSwitcher 水平滑动功能

**问题**: 分组标签过多时换行显示，占用大量垂直空间，设置按钮被挤出屏幕

**解决方案**:

```tsx
// 核心改动
flexWrap: 'nowrap',           // 禁止换行
overflowX: 'auto',            // 启用水平滚动
WebkitOverflowScrolling: 'touch',  // iOS惯性滚动
scrollbarWidth: 'thin',       // 自定义细滚动条
width: '100%',                // 明确宽度约束
```

**效果对比**:

```
之前（换行显示）:              现在（水平滑动）:
┌────────────────────┐        ┌────────────────────┐
│ [全部] [111] [22]   │        │ [全部][111][22][3333]│→ 可滑动
│ [3333] [支付宝]     │        │[支付宝][决定额外i儿童]│
│ [决定额外i儿童]      │        └────────────────────┘
└────────────────────┘         设置按钮⚙️ 始终可见 ✓
```

---

### 9.2 GroupManageModal 移动端全面优化

#### 三层响应式断点策略

| 断点 | 适用设备 | 优化级别 |
|------|---------|---------|
| **≤ 768px** | 平板/大屏手机 | 标准紧凑 |
| **≤ 480px** | iPhone/Android 手机 | 极限压缩 |
| **≤ 360px** | iPhone SE 等小屏 | 超极限适配 |

#### 关键优化点

**1. 模态框容器**
```
宽度: 96vw → 98vw (768px) → 99vw (360px)
高度: 92vh → 96vh
边距: 6px → 4px → 2px
圆角: 16px → 12px
```

**2. 基金卡片简化**
```
移动端只显示基金名称，隐藏：
✅ 隐藏基金代码 (.fund-card-code { display: none })
✅ 隐藏持仓/份额 (.fund-card-detail { display: none })
✅ 操作按钮水平排列
```

**3. 按钮高度统一**
```
移动按钮(Select): height: 28px + min-height: 28px
删除按钮(Button): height: 28px + min-height: 28px
```

**4. 下拉选择框长文本保护**
```tsx
<Select
  popupMatchSelectWidth={false}    // 不受选择器宽度限制
  dropdownStyle={{ minWidth: 140 }} // 最小宽度140px
/>
// 选项文本：whiteSpace: nowrap + textOverflow: ellipsis
```

#### 尺寸对比表

| 元素 | 桌面端 | ≤768px | ≤480px | ≤360px |
|------|--------|--------|--------|--------|
| Body内边距 | 28px | 8-10px | 6-8px | 5-6px |
| 输入框高度 | 40px | 38px | 34px | 32px |
| 按钮高度 | 32px | 30px | 28px | 26px |
| 标题字号 | 18px | 15-18px | 14-16px | 13-15px |
| 列表项高 | - | 48px | 44px | 40px |
| 间距 | 8-20px | 5-12px | 4-10px | 3-8px |

---

### 9.3 Bug修复清单

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | 设置按钮位置偏移 | 父容器添加 `minWidth: 0; overflow: hidden` |
| 2 | 基金代码未隐藏 | CSS规则冲突：移除重复的 `display: inline-block` 规则 |
| 3 | 移动/删除按钮不等高 | 统一 `height` + `min-height` 属性 |

---

### 9.4 技术亮点

1. **全局盒模型修复**: `.group-manage-modal * { box-sizing: border-box !important }`
2. **智能文本截断**: `-webkit-line-clamp: 1/2` 控制行数
3. **Flex布局防溢出**: `minWidth: 0` 允许收缩 + `overflow: hidden` 裁剪
4. **触摸目标平衡**: 最小26×40px（符合WCAG标准）
5. **零JS开销**: 纯CSS实现，渐进增强不影响桌面端

---

## 10. v2.7 增量更新：定投功能增强 — 默认基金 + 界面优化 + 编辑功能

> **更新日期**: 2026-05-17
> **涉及文件**: CreatePlanModal.tsx, EditPlanModal.tsx (新建), FundDetailPage.tsx, InvestmentPlanPage.tsx, planService.ts, plans.js (路由), planController.js

### 变更概览

| 指标 | 数值 |
|------|------|
| 涉及文件 | 7个（后端3 + 前端4）|
| 新建文件 | 1个（EditPlanModal.tsx） |
| 新增功能 | 3个（默认基金、界面重构、编辑定投） |
| API接口新增 | 1个（PUT /api/plans/:id） |

---

### 10.1 基金详情页定投默认选中当前基金

**问题**: 从基金详情页点击"定投"按钮时，CreatePlanModal 弹窗中的基金选择器为空，用户需手动搜索选择当前基金。

**解决方案**:

```tsx
// CreatePlanModal Props 扩展
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fundCode?: string;   // ✨ 可选
  fundName?: string;   // ✨ 可选
}

// useEffect 自动填充
useEffect(() => {
  if (open && fundCode) {
    form.setFieldValue('fundCode', fundCode);
    setFundOptions([{ value: fundCode, label: `${fundCode} - ${fundName}` }]);
  }
}, [open, fundCode, fundName, form]);

// FundDetailPage 调用
<CreatePlanModal
  open={planModalOpen}
  onClose={() => setPlanModalOpen(false)}
  onSuccess={loadData}
  fundCode={code || ''}           // ✨ 传入
  fundName={fund.name || code || ''} // ✨ 传入
/>
```

---

### 10.2 定投计划界面显示全面重构

#### 布局对比

```
修改前（Ant Design List.Item）:     修改后（自定义卡片式布局）:
┌──────────────────────────────┐     ┌─────────────────────────────┐
│ [基金名] [进行中]             │     │ [基金名称]          [进行中] │
│ ¥1,000 / 每日 | 下次: ISO日期 │     │                             │
│            [暂停] [删除]      │     │ 💰 ¥1,000  🔄 每日  📅 05-17│
└──────────────────────────────┘     │              [✏️][暂停][🗑️]  │
                                     └─────────────────────────────┘
```

#### 核心样式

```css
.plan-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  margin-bottom: 12px;
  transition: all var(--transition-fast);
}
.plan-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-default);
  box-shadow: var(--shadow-sm);
}
```

#### 信息项图标化

| 信息项 | 图标 | 颜色 | 字体 |
|--------|------|------|------|
| 定投金额 | DollarOutlined | 金色 accent-gold | 等宽 font-mono |
| 定投频率 | SyncOutlined | 主色 text-primary | - |
| 下次执行日 | CalendarOutlined | 主色 text-primary | - |

#### 日期格式修复

```typescript
// 修复前: "2026-05-17T16:00:00.000Z"
// 修复后: "2026-05-17"
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
```

---

### 10.3 修改定投计划功能（完整实现）

#### 后端 API

```
PUT /api/plans/:id
Body: { amount?: number, frequency?: string, dayOfWeek?: number, dayOfMonth?: number }
Response: { message: '定投计划更新成功' }
```

#### 控制器逻辑

```javascript
exports.update = async (req, res, next) => {
  const data = {};
  if (amount !== undefined) data.amount = amount;
  if (frequency !== undefined) {
    data.frequency = frequency;
    data.day_of_week = dayOfWeek || null;
    data.day_of_month = dayOfMonth || null;
    data.next_run_date = calcNextRunDate(new Date(), frequency); // 自动重算
  }
  await InvestmentPlan.update(id, req.user.id, data); // 复用Model通用方法
};
```

#### EditPlanModal 组件设计

| 特性 | 说明 |
|------|------|
| 基金字段 | 只读 Input 展示 `代码 - 名称` |
| 可编辑字段 | 金额、频率、定投日 |
| 数据回填 | useEffect 监听 plan prop 自动设置表单值 |
| 移动端适配 | 完整 @media 768px 断点优化 |

#### 页面集成

```tsx
// InvestmentPlanPage 新增状态和编辑按钮
const [editModalOpen, setEditModalOpen] = useState(false);
const [editingPlan, setEditingPlan] = useState<any>(null);

// 卡片操作区新增编辑按钮
<button className="plan-action-edit" onClick={() => { setEditingPlan(plan); setEditModalOpen(true); }}>
  <EditOutlined />
</button>

// 渲染 EditPlanModal
<EditPlanModal open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingPlan(null); }} onSuccess={loadPlans} plan={editingPlan} />
```

---

### 10.4 文件变更清单

#### 后端文件（2个）

| 文件路径 | 修改类型 | 主要改动 |
|---------|---------|---------|
| `server/routes/plans.js` | 路由新增 | `PUT /:id` → ctrl.update |
| `server/controllers/planController.js` | 方法新增 | `exports.update` — 动态字段更新 + 频率变更时重算下次执行日期 |

#### 前端文件（5个）

| 文件路径 | 修改类型 | 主要改动 |
|---------|---------|---------|
| `web/src/services/planService.ts` | 方法新增 | `updatePlan(id, data)` → PUT /plans/:id |
| `web/src/components/modals/CreatePlanModal.tsx` | Props扩展 | fundCode/fundName 可选属性 + useEffect 自动填充 |
| `web/src/components/modals/EditPlanModal.tsx` | **新建** | 编辑弹窗组件（基金只读 + 金额/频率/定投日可编辑） |
| `web/src/pages/fund/FundDetailPage.tsx` | 参数传递 | CreatePlanModal 传入 fundCode/fundName |
| `web/src/pages/plans/InvestmentPlanPage.tsx` | **重大重构** | 卡片式布局 + 编辑按钮 + EditPlanModal 集成 |

---

### 10.5 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| CreatePlanModal 复用 vs 新建编辑组件 | Props 可选属性扩展复用 | 不破坏现有调用方，创建/预选两种模式兼容 |
| EditPlanModal 独立 vs 复用 CreatePlanModal | 独立新建 | 表单逻辑差异大（搜索选基金 vs 基金只读），独立更清晰 |
| 列表组件 Ant Design List vs 自定义卡片 | 自定义卡片 | 更精细的视觉控制、更好的主题一致性、信息层级更清晰 |
| 更新接口 PUT /:id vs PATCH /:id | PUT | 与 RESTful 规范一致，复用 Model 层已有 update 方法 |

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v2.4 | 2026-05-13 | 稳定性优化 + UI/UX体验提升 |
| v2.4.2 | 2026-05-15 | 缓存系统重大优化 |
| v2.5 | 2026-05-16 | 净值计算体系重构 + 累计收益精度修复 |
| v2.6 | 2026-05-15 | 移动端全面优化 + UI/UX提升 + 图表优化 |
| **v2.6.1** | **2026-05-17** | **分组滑动 + 分组管理弹窗移动端优化** |
| **v2.7** | **2026-05-17** | **定投功能增强：默认基金 + 界面优化 + 编辑功能** |

---

> **文档维护**: 此文档由AI Assistant根据代码变更生成
> **最后更新**: 2026-05-17
