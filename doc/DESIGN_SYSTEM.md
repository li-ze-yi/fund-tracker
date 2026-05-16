# 养基发财 设计系统规范 (Design System)

> **版本**: v2.0  
> **最后更新**: 2026-05-11  
> **适用范围**: Web端 (React + Ant Design 5.x)  

---

## 📋 目录

1. [设计理念](#设计理念)
2. [色彩系统](#色彩系统)
3. [字体系统](#字体系统)
4. [间距系统](#间距系统)
5. [圆角系统](#圆角系统)
6. [阴影系统](#阴影系统)
7. [动画系统](#动画系统)
8. [组件样式规范](#组件样式规范)
9. [响应式断点](#响应式断点)
10. [暗色主题适配指南](#暗色主题适配指南)

---

## 设计理念

### 核心原则

1. **金融专业性** - 采用深色主题 + 金色强调色，传递专业、可信赖的视觉感受
2. **信息层级清晰** - 通过字号、字重、颜色的梯度变化，建立清晰的信息架构
3. **数据可读性优先** - 等宽字体、合适的对比度、充分的留白，确保数据一目了然
4. **交互反馈明确** - 所有可点击元素都有明确的hover/active状态
5. **移动端友好** - 触摸区域≥44px，手势操作流畅自然

### 视觉风格定位

- **风格**: 深色专业风 (Dark Professional)
- **主色调**: 深蓝黑 (#0B1120) + 品牌金 (#D4A84B)
- **情感**: 可信赖、高效、现代
- **差异化**: 避免通用AI美学，追求独特的设计语言

---

## 色彩系统

### 主色调 (Primary Colors)

```css
:root[data-theme='dark'] {
  /* 品牌色系 */
  --accent-gold: #D4A84B;              /* 品牌主色 - 用于按钮、链接、强调 */
  --accent-gold-light: #F0D78C;        /* 品牌亮色 - 用于高亮文字 */
  --accent-gold-dim: rgba(212, 168, 75, 0.15);  /* 品牌弱色 - 用于背景填充 */
  
  /* 功能色 */
  --gain: #EF4444;                     /* 收益/上涨 - 红色（符合国际惯例）*/
  --loss: #22C55E;                     /* 亏损/下跌 - 绿色 */
  --gain-bg: rgba(239, 68, 68, 0.08);   /* 收益背景 */
  --loss-bg: rgba(34, 197, 94, 0.08);    /* 亏损背景 */
  --gain-border: rgba(239, 68, 68, 0.2);  /* 收益边框 */
  --loss-border: rgba(34, 197, 94, 0.2);  /* 亏损边框 */
}
```

**使用场景：**

| 颜色 | 使用场景 | 示例 |
|------|---------|------|
| `--accent-gold` | 主要按钮、活跃状态、品牌元素 | 登录按钮、TabBar选中项 |
| `--accent-gold-light` | 高亮链接、重要提示 | "去注册"链接 |
| `--accent-gold-dim` | 背景填充、标签背景 | 类型标签、输入框focus |
| `--gain` / `--loss` | 数据正负值显示 | 涨跌幅、收益金额 |

---

### 中性色 (Neutral Colors) - 背景层

```css
:root[data-theme='dark'] {
  /* 背景色阶 */
  --bg-base: #0B1120;                /* 页面底层背景 */
  --bg-secondary: #111827;          /* 次级区域背景 */
  --bg-elevated: #151F2E;           /* 卡片/弹窗背景 */
  --bg-card: rgba(255, 255, 255, 0.04);  /* 列表项背景 */
  --bg-card-hover: rgba(255, 255, 255, 0.08);  /* 列表项悬停 */
  --bg-input: rgba(255, 255, 255, 0.06);     /* 输入框背景 */
  --bg-glass: rgba(255, 255, 255, 0.03);      /* 毛玻璃效果 */
  --flat-bg: rgba(255, 255, 255, 0.05);       /* 扁平化背景 */
}
```

**层次关系：**
```
bg-base (最底层)
  └─ bg-secondary (次级容器)
       └─ bg-elevated (卡片/模态框)
            └─ bg-card (列表项)
                 └─ bg-card-hover (交互状态)
```

---

### 中性色 (Neutral Colors) - 文字层

```css
:root[data-theme='dark'] {
  /* 文字色阶 */
  --text-primary: #F1F5F9;          /* 主要文字 - 标题、重要数据 */
  --text-secondary: #94A3B8;        /* 次要文字 - 正文内容 */
  --text-tertiary: #8896AB;         /* 辅助文字 - 标签、提示 */  /* 新增 */
  --text-muted: #64748B;            /* 弱化文字 - placeholder、时间戳 */
  --text-dim: #475569;             /* 最弱文字 - 禁用状态、次要信息 */
}
```

**对比度标准（WCAG AA）：**
- Primary on Base: **15.2:1** ✅ (远超7:1要求)
- Secondary on Base: **7.8:1** ✅ (符合4.5:1要求)
- Tertiary on Base: **6.2:1** ✅ (符合4.5:1要求)

**新增浅色系文字颜色（v2.1 - 认证页面专用）：**

| 变量名 | 颜色值 | 用途 | 示例 |
|--------|--------|------|------|
| `--text-light-1` | `#f8f7f7` | 浅白色（主密码框图标） | RegisterPage 密码框 |
| `--text-light-2` | `#eee8e8` | 浅灰白（登录页图标） | LoginPage 密码框 |
| `--text-light-3` | `#e3dede` | 中等亮度（次要字段图标） | RegisterPage 确认密码框 |

**使用场景：**
- 深色背景下的交互元素（图标、按钮）
- 需要高可见性的UI组件
- 与深色主题形成对比的元素

**设计原则：**
- 所有颜色在 `#e0dcdc` ~ `#fafafa` 范围内
- 根据视觉层级选择不同亮度
- 主操作使用更亮的颜色，次要操作稍暗

---

### 中性色 (Neutral Colors) - 边框层

```css
:root[data-theme='dark'] {
  /* 边框色阶 */
  --border-default: rgba(255, 255, 255, 0.12);   /* 默认边框 */
  --border-subtle: rgba(255, 255, 255, 0.06);     /* 微弱边框 */
  --border-strong: rgba(255, 255, 255, 0.2);      /* 强调边框 */
}
```

---

### 渐变色预设 (Gradients)

```css
/* 金色渐变 - 用于重要卡片 */
.gold-gradient {
  background: linear-gradient(135deg, 
    rgba(212, 168, 75, 0.05), 
    rgba(17, 24, 39, 0.8)
  );
}

/* 用户头像渐变 */
.avatar-gradient {
  background: linear-gradient(135deg, 
    var(--accent-gold), 
    var(--accent-gold-light)
  );
}

/* 涨跌渐变条 - 用于自选列表 */
.gain-bar-gradient {
  background: linear-gradient(180deg, 
    rgba(239, 68, 68, 0.8), 
    rgba(239, 68, 68, 0.1)
  );
}

.loss-bar-gradient {
  background: linear-gradient(180deg, 
    rgba(34, 197, 94, 0.4), 
    rgba(34, 197, 94, 0.9)
  );
}

/* 图表面积填充 */
.chart-area-gradient {
  /* 三段式渐变：25% → 8% → 1% */
  fill: {
    type: 'linear',
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: 'rgba(212, 168, 75, 0.25)' },
      { offset: 0.5, color: 'rgba(212, 168, 75, 0.08)' },
      { offset: 1, color: 'rgba(212, 168, 75, 0.01)' },
    ],
  };
}
```

---

## 字体系统

### 字体族 (Font Families)

```css
:root {
  /* 显示字体 - 用于标题 */
  --font-display: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
                  'PingFang SC', 'Hiragino Sans GB', 
                  'Microsoft YaHei', sans-serif;
  
  /* 等宽字体 - 用于数字和代码 */
  --font-mono: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 
               'Liberation Mono', 'Courier New', monospace;
}
```

**使用规则：**
- 标题、正文 → `var(--font-display)`
- 数字、金额、代码 → `var(--font-mono)` (配合 `.number-tabular` 类)

---

### 字号阶梯 (Type Scale)

| 级别 | 字号 | 字重 | 行高 | 使用场景 |
|------|------|------|------|---------|
| **Display** | 32px | 800 | 1.2 | 核心数据（指数点位） |
| **H1** | 26-28px | 700-800 | 1.3 | 页面标题、关键指标 |
| **H2** | 22px | 700 | 1.3 | 区块标题、卡片标题 |
| **H3** | 18-20px | 600-700 | 1.4 | 子标题、重要数据 |
| **Body Large** | 17px | 600-700 | 1.5 | 强调数据（涨幅） |
| **Body** | 15px | 500-600 | 1.6 | 正文内容、列表项 |
| **Body Small** | 14-15px | 500 | 1.6 | 表格内容、次要信息 |
| **Caption** | 13px | 500-600 | 1.5 | 辅助说明、表格单元格 |
| **Small** | 12px | 400-500 | 1.4 | 标签、提示文字 |
| **Tiny** | 11px | 400-500 | 1.3 | 角标信息、时间戳 |
| **Micro** | 10.5-11px | 500-700 | 1.2 | 导航栏标签 |

**CSS示例：**
```css
/* 页面标题 */
.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

/* 核心数据 */
.key-metric-value {
  font-size: 26px;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
  color: var(--gain);
}

/* 标签文字 */
.label-text {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
```

---

### 数字格式化规范

**等宽字体类：**
```html
<span className="number-tabular">¥12,345.67</span>
```
```css
.number-tabular {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' on, 'lnum' on;
}
```

**千分位格式化：**
```javascript
// 推荐
value.toLocaleString('zh-CN', { 
  minimumFractionDigits: 2, 
  maximumFractionDigits: 2 
})
// 输出: ¥12,345.67
```

**特殊处理：**
- 大额显示：≥10000自动转为"X.X万"
- 百分比：保留2位小数
- 净值：保留4位小数
- 涨跌幅：保留2位小数，带+/-前缀

---

## 间距系统

### 基础单位

```css
:root {
  --space-unit: 4px;  /* 基础间距单位 */
}
```

### 间距阶梯 (Spacing Scale)

| Token | 值 | 使用场景 |
|-------|-----|---------|
| `space-xs` | 4px | 图标与文字间距、紧凑元素内边距 |
| `space-sm` | 8px | 小元素间距、Tag内边距 |
| `space-md` | 12px | 列表项内边距、表单元素间距 |
| `space-lg` | 16px | 卡片内边距、区块间距 |
| `space-xl` | 20px | 页面内边距、大区块间距 |
| `space-2xl` | 24px | 卡片大内边距、Section间距 |
| `space-3xl` | 32px | 页面主要区块分隔 |
| `space-4xl` | 48px | 页面底部留白（避免被TabBar遮挡） |

**实际应用：**
```css
/* 页面容器 */
.page-container {
  padding: 20px 16px;           /* xl + lg */
  padding-bottom: 100px;        /* 额外底部空间 */
}

/* 卡片 */
.card {
  margin-bottom: 20px;          /* xl */
  padding: 20px 24px;           /* xl + 2xl */
}

/* 列表项 */
.list-item {
  padding: 13px 16px;           /* md + lg */
  margin: 0 10px 2px;
}

/* 表单 */
.form-item {
  margin-bottom: 16px;          /* lg */
}
```

---

## 圆角系统

```css
:root {
  --radius-xs: 4px;    /* 小元素：Tag、Badge */
  --radius-sm: 8px;    /* 输入框、小按钮 */
  --radius-md: 12px;   /* 卡片、中等按钮 */
  --radius-lg: 16px;   /* 大卡片、Modal */
  --radius-xl: 24px;   /* 特殊展示卡片 */
  --radius-full: 9999px; /* 圆形：头像、图标按钮 */
}
```

**使用规范：**

| 组件 | 圆角值 | 示例 |
|------|--------|------|
| Tag/Badge | `--radius-xs` (4px) | 类型标签 |
| Input/Button | `--radius-sm` (8px) | 表单控件 |
| Card | `--radius-lg` (16px) | 内容卡片 |
| Modal | `--radius-lg` (16px) | 弹窗 |
| Avatar | `--radius-full` | 用户头像 |
| Pill按钮 | `--radius-full` | 分组切换器 |

---

## 阴影系统

```css
:root {
  /* 层级1：轻微悬浮 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  
  /* 层级2：卡片悬浮 */
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  
  /* 层级3：重要元素强调 */
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  
  /* 特殊：金色发光（用于品牌元素）*/
  --shadow-glow-gold: 0 0 20px rgba(212, 168, 75, 0.3);
}
```

**使用场景：**

| 阴影 | 应用 |
|------|------|
| `--shadow-sm` | 默认卡片、下拉菜单 |
| `--shadow-md` | Hover状态的卡片、Popover |
| `--shadow-lg` | Modal、重要数据卡片、Tooltip |
| `--shadow-glow-gold` | 用户头像、选中态按钮、CTA按钮 |

---

## 动画系统

### 过渡时长 (Transition Duration)

```css
:root {
  --duration-fast: 0.15s;   /* 快速反馈：按钮hover、颜色变化 */
  --duration-base: 0.25s;   /* 标准过渡：展开收起、淡入淡出 */
  --duration-slow: 0.35s;   /* 复杂动画：页面切换、模态框 */
}
```

### 过渡函数 (Easing Functions)

```css
:root {
  /* 标准 */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  
  /* 减速进入 */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  
  /* 加速退出 */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  
  /* 弹性效果（用于特殊交互）*/
  --ease-spring: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

### 预设过渡 (Transition Presets)

```css
/* 快速过渡 - 用于微交互 */
.transition-fast {
  transition: all var(--transition-fast) var(--ease-standard);
}

/* 标准过渡 - 用于布局变化 */
.transition-base {
  transition: all var(--transition-base) var(--ease-standard);
}

/* 完整定义 */
:root {
  --transition-fast: all 0.15s ease;
  --transition-base: all 0.25s ease;
}
```

### 关键帧动画 (Keyframe Animations)

```css
/* 淡入上移 - 用于页面加载 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 使用示例 */
.animate-fade-in-up {
  animation: fadeInUp 0.35s ease-out both;
}

/* 交错延迟 - 用于列表项 */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
/* ... */
```

---

## 状态颜色体系 (Status Color System) ⭐ v2.4新增

> **最后更新**: 2026-05-13  
> **适用组件**: FundListItem, Header, 所有含状态标签的界面

### 设计理念

状态颜色用于表达基金数据的**更新状态**和**可信度**，帮助用户快速判断数据的新鲜程度和可靠性。

### 四种核心状态

| 状态 | 英文标识 | 颜色 | 色值 | 图标 | 使用场景 |
|------|---------|------|------|------|---------|
| **休市** | `market_closed` | ⚫ 灰色 | `#6B7280` | ○ 空心圆点 | 周末/节假日/数据过期 |
| **估算中** | `estimating` | 🔴 红色 | `#EF4444` | ● 脉冲圆点 | 盘中实时估值（9:00-15:00） |
| **待确认** | `pending_confirm` | 🟠 橙色 | `#F97316` | ● 实心圆点 | 收盘后等待正式净值（15:00后） |
| **已确认** | `confirmed` | 🟡 浅金黄 | `#f5d584` | ● 实心圆点 | 基金公司确认的官方净值 |

### 颜色选择理由

1. **休市（灰色 #6B7280）**
   - 中性色，不引起用户注意
   - 表达"无交易活动"的平静状态
   - 与其他状态形成明显区分

2. **估算中（红色 #EF4444）**
   - 警示色，提醒用户"数据不确定"
   - 符合金融App的风险提示惯例
   - 配合脉冲动画增强警示效果

3. **待确认（橙色 #F97316）**
   - 过渡色，介于红（不确定）和黄（确定）之间
   - 表达"等待中"的状态
   - 比红色温和，比黄色醒目

4. **已确认（浅金黄 #f5d584）** ⭐ v2.4调整
   - 正面反馈色，传达"已完成"
   - 与品牌主色调（accent-gold）统一
   - 在深色/浅色主题下都清晰可见
   - **v2.4前为绿色(#22C55E)，现改为更符合金融调性的金黄色**

### 视觉规范

#### 标签样式模板

```typescript
// 通用状态标签样式（TypeScript）
const statusStyles = {
  market_closed: {
    color: '#6B7280',
    background: 'rgba(107, 114, 128, 0.1)',
    icon: '○', // 空心圆点
    animation: 'none',
    text: '休市', // 可附加星期信息：'休市(周六)'
  },
  estimating: {
    color: '#EF4444',
    background: 'rgba(239, 68, 68, 0.1)',
    icon: '●', // 脉冲动画圆点
    animation: 'pulse-red 3s ease-in-out infinite',
    text: '估算中',
  },
  pending_confirm: {
    color: '#F97316',
    background: 'rgba(249, 115, 22, 0.1)',
    icon: '●', // 静态实心圆点
    animation: 'none',
    text: '待确认',
  },
  confirmed: {
    color: '#f5d584',  // ⭐ 浅金黄色
    background: 'rgba(245, 213, 132, 0.15)',  // 淡金背景
    icon: '●', // 静态实心圆点
    animation: 'none',
    text: '已确认',
  },
};
```

#### 尺寸规范

| 属性 | 值 | 说明 |
|------|-----|------|
| 字号 | 10px | 紧凑显示 |
| 字重 | 500 (Medium) | 清晰可读 |
| 内边距 | 2px 6px (水平) | 适中紧凑 |
| 圆角 | 4px | 圆润现代感 |
| 圆点尺寸 | 6px × 6px | 小巧精致 |
| 间距 | gap: 4px | 圆点与文字间距 |

#### 动画规范

##### 估算中状态的脉冲动画

```css
@keyframes pulse-red {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.85);
  }
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #EF4444;
  display: inline-block;
  animation: pulse-red 3s ease-in-out infinite;
}
```

**参数说明：**
- 持续时间：3秒（舒缓不刺眼）
- 缓动函数：ease-in-out（平滑过渡）
- 循环次数：infinite（持续到状态改变）
- 缩放范围：1 → 0.85 → 1（微妙呼吸感）

### 使用示例

#### React 组件实现

```tsx
// FundListItem.tsx 中的状态渲染函数
const renderUpdateIndicator = () => {
  const status = fund.update_status || 'estimating';

  switch (status) {
    case 'market_closed':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '10px',
          fontWeight: 500,
          color: '#6B7280',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(107, 114, 128, 0.1)',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#6B7280',
          }}/>
          休市{fund.day_of_week ? `(${fund.day_of_week})` : ''}
        </span>
      );

    case 'confirmed':
      return (
        <span style={{
          /* ... 同上结构 ... */
          color: '#f5d584',  // 浅金黄
          background: 'rgba(245, 213, 132, 0.15)',
        }}>
          <span style={{ background: '#f5d584' }}/>
          已确认
        </span>
      );

    // ... 其他状态类似
  }
};
```

### 状态流转逻辑

```
时间轴：
─────────────────────────────────────────────────────→

9:00 ────────── 15:00 ────────── 次日9:00
 │                  │                   │
 ▼                  ▼                   ▼

[estimating]    [pending_confirm]   [confirmed]
 估算中           待确认              已确认
 (红色脉冲)       (橙色静态)         (金黄静态)
 
特殊情况：
├─ 周末/节假日 → [market_closed] 休市(灰色) + 星期信息
└─ 数据>48h未更新 → [market_closed] 数据未更新(灰色)
```

### 可访问性考虑

| 维度 | 实现方式 | 标准 |
|------|---------|------|
| **颜色对比度** | 所有颜色在深色背景对比度 > 4.5:1 | WCAG AA ✅ |
| **图标辅助** | 圆点 + 文字双重标识 | 不依赖颜色识别 ✅ |
| **动画控制** | 支持 `prefers-reduced-motion` | 无障碍访问 ✅ |
| **屏幕阅读器** | aria-label 包含完整状态文本 | 语义化 ✅ |

### 扩展指南

如需添加新状态，请遵循以下规范：

1. **选择合适的颜色** - 参考现有四色的语义梯度
2. **定义清晰的场景** - 何时显示此状态
3. **保持一致性** - 字号、间距、圆角与现有状态一致
4. **更新本文档** - 同步维护设计系统文档
5. **测试可读性** - 在深色/浅色主题下验证

---

## 组件样式规范

### Ant Design 5.x 全局覆盖

#### Card组件

```css
.ant-card {
  background: var(--bg-elevated) !important;
  border-color: var(--border-subtle) !important;
  border-radius: var(--radius-lg) !important;
}

.ant-card-head-title {
  color: var(--text-primary) !important;
  font-size: 16px !important;
  font-weight: 600 !important;
}

.ant-card-body {
  padding: 20px 24px !important;
}
```

#### Table组件

```css
.ant-table {
  background: transparent !important;
}

/* 表头 */
.ant-table-thead > tr > th {
  background: var(--bg-elevated) !important;
  color: var(--text-secondary) !important;
  border-bottom-color: var(--border-default) !important;
  font-weight: 600 !important;
}

/* 表体 */
.ant-table-tbody > tr > td {
  background: var(--bg-card) !important;
  color: var(--text-primary) !important;
  border-bottom-color: var(--border-subtle) !important;
}

/* Hover行 */
.ant-table-tbody > tr:hover > td {
  background: var(--bg-card-hover) !important;
}
```

#### Input组件

```css
.ant-input,
.ant-input-affix-wrapper {
  background: var(--bg-input) !important;
  border-color: var(--border-default) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-sm) !important;
}

/* Focus状态 */
.ant-input:focus,
.ant-input-focused {
  border-color: var(--accent-gold) !important;
  box-shadow: 0 0 0 2px var(--accent-gold-dim) !important;
}

/* Placeholder */
.ant-input::placeholder {
  color: var(--text-muted) !important;
}
```

#### Button组件

```css
/* 主要按钮 */
.ant-btn-primary {
  background: var(--accent-gold) !important;
  border-color: var(--accent-gold) !important;
  height: 46px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  box-shadow: 0 4px 14px rgba(212, 168, 75, 0.25) !important;
}

.ant-btn-primary:hover {
  background: var(--accent-gold-light) !important;
  border-color: var(--accent-gold-light) !important;
}

/* 文本按钮 */
.ant-btn-text {
  color: var(--text-secondary) !important;
}

.ant-btn-text:hover {
  color: var(--accent-gold) !important;
  background: var(--bg-card) !important;
}
```

#### Modal组件

```css
.ant-modal-content {
  background: var(--bg-elevated) !important;
  border-radius: var(--radius-lg) !important;
}

.ant-modal-header {
  background: transparent !important;
  border-bottom-color: var(--border-subtle) !important;
}

.ant-modal-title {
  color: var(--text-primary) !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}

.ant-modal-close-x {
  color: var(--text-muted) !important;
}
```

#### Tag组件（自定义样式）

```css
/* 类型标签 - 自选模式 */
.tag-type {
  font-size: 11px;
  line-height: 18px;
  padding: 0 6px;
  background: var(--accent-gold-dim);
  color: var(--accent-gold-light);
  border: none;
  border-radius: 4px;
  font-weight: 500;
}

/* 交易类型标签 - 买入/卖出 */
.tag-trade-buy {
  background: var(--gain-bg);
  color: var(--gain);
  border: 1px solid var(--gain-border);
  border-radius: 6px;
  padding: 2px 12px;
  font-weight: 600;
}

.tag-trade-sell {
  background: var(--loss-bg);
  color: var(--loss);
  border: 1px solid var(--loss-border);
  border-radius: 6px;
  padding: 2px 12px;
  font-weight: 600;
}
```

#### Empty组件

```css
.ant-empty-description {
  color: var(--text-secondary) !important;
  font-size: 14px !important;
}
```

---

## 响应式断点

```css
:root {
  /* 移动端优先的断点 */
  --breakpoint-sm: 480px;   /* 小屏手机 */
  --breakpoint-md: 768px;   /* 平板竖屏 */
  --breakpoint-lg: 1024px;  /* 平板横屏/小笔记本 */
  --breakpoint-xl: 1280px;  /* 桌面显示器 */
}

/* 媒体查询示例 */
@media (max-width: 480px) {
  .card-grid {
    grid-template-columns: 1fr;  /* 单列布局 */
  }
}

@media (min-width: 768px) and (max-width: 1024px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);  /* 双列布局 */
  }
}

@media (min-width: 1024px) {
  .card-grid {
    grid-template-columns: repeat(3, 1fr);  /* 三列布局 */
  }
}
```

---

## 暗色主题适配指南

### 必须遵循的原则

1. **避免纯黑** - 使用深蓝黑(#0B1120)而非纯黑(#000)，减少视觉疲劳
2. **降低对比度** - 文字不要用纯白(#FFF)，改用略灰的白(#F1F5F9)
3. **增加间距** - 暗色模式下适当增加元素间距，提升呼吸感
4. **微妙边框** - 使用低透明度白色边框(6%-12%)而非实线
5. **层次通过亮度区分** - 背景层次：base < secondary < elevated < card

### 常见陷阱及解决方案

#### ❌ 陷阱1：文字对比度过高
```css
/* 错误：刺眼 */
.title { color: #FFFFFF; }

/* 正确：柔和 */
.title { color: var(--text-primary); }  /* #F1F5F9 */
```

#### ❌ 陷阱2：卡片无边界感
```css
/* 错误：融入背景 */
.card { background: #111827; }

/* 正确：轻微浮起 */
.card { 
  background: var(--bg-elevated);  /* #151F2E */
  border: 1px solid var(--border-subtle);  /* 极弱边框 */
}
```

#### ❌ 陷阱3：阴影过重或过轻
```css
/* 错误：不协调 */
.card { box-shadow: 0 10px 30px rgba(0,0,0,0.8); }  /* 太重 */

/* 正确：适度 */
.card { box-shadow: var(--shadow-md); }  /* 使用预定义 */
```

---

## 设计Token使用检查清单

在开发新功能时，请确保：

### ✅ 颜色
- [ ] 是否使用了CSS变量而非硬编码颜色？
- [ ] 文字是否使用了正确的层级（primary/secondary/tertiary）？
- [ ] 正负数值是否使用了gain/loss配色？

### ✅ 字体
- [ ] 数字是否使用了`.number-tabular`类？
- [ ] 字号是否符合阶梯规范？
- [ ] 标题是否使用了负字距(`letter-spacing: -0.01em`)？

### ✅ 间距
- [ ] 内外边距是否使用了spacing scale？
- [ ] 页面底部是否有足够留白（避免TabBar遮挡）？

### ✅ 圆角/阴影
- [ ] 圆角是否使用了预定义值？
- [ ] 阴影是否使用了预定义值？
- [ ] 重要元素是否使用了`--shadow-glow-gold`？

### ✅ 动画
- [ ] 过渡时长是否使用了预定义值？
- [ ] hover状态是否有明确的视觉反馈？
- [ ] 列表渲染是否有交错延迟动画？

### ✅ 无障碍
- [ ] 交互元素是否有足够的触摸区域（≥44px）？
- [ ] 颜色对比度是否符合WCAG AA标准？
- [ ] 是否考虑了键盘导航？

---

## 维护指南

### 如何更新Design System

1. **修改CSS变量** - 在`:root[data-theme='dark']`中更新
2. **测试影响范围** - 确认所有引用该变量的组件
3. **更新本文档** - 同步修改对应的章节
4. **通知团队** - 通过PR描述变更内容

### 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-05-11 | 初始版本，基于v2.0优化工作建立 |
| v2.0 | 2026-05-11 | 新增`--text-tertiary`, `--primary`, `--accent-gold-*`变量；完善全局antd覆盖样式；建立完整的字体/间距/圆角/阴影/动画体系 |

---

**文档维护者**: Frontend Team  
**最后审核**: 2026-05-11  
**下次计划更新**: 根据新功能需求
