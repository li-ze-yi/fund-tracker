# 养基发财 - Fund Tracker

基金实时估值与持仓管理系统，支持跨平台持仓统一管理、实时估值追踪、分组统计、交易记录、投资计划及数据导入导出。

## 功能概览

- **实时估值追踪** — 盘中实时刷新基金估算净值与涨跌幅，刷新频率可自定义（15s/30s/60s/120s/手动）
- **持仓管理** — 添加/删除/编辑持仓，自动计算份额、成本单价、市值、收益
- **加减仓操作** — 支持买入/卖出记录，自动更新持仓，减仓提供快捷份额按钮（1/4、1/3、1/2、全部）
- **分组管理** — 自定义分组，分组汇总（总资产/当日收益/累计收益），一键切换
- **自选关注** — 独立自选列表，实时估值展示，支持排序
- **净值走势图** — 折线图展示历史净值，百分比 Y 轴，买卖点标注（红买绿卖）
- **历史收益统计** — 日/月/年收益柱状图，从首次持仓开始计算
- **定投计划** — 创建/暂停/恢复定投计划，自动记录买入交易
- **大盘指数** — 15 个国内外主要指数，折叠/展开双模式，多数据源容灾（新浪+腾讯）
- **批量导入导出** — 支持 Excel/CSV 格式，导入预览确认，导出可选范围和格式
- **数据状态标记** — 估算中（红色脉冲）/ 待确认（橙色）/ 已确认（金黄色），基于系统时间自动判断
- **事件驱动日收益** — 18:00 后自动计算并持久化当日收益，异步非阻塞
- **移动端全适配** — 完整响应式设计，手机端体验与桌面端一致，详见下方移动端适配说明

## 移动端适配

项目已全面适配手机端，采用 **响应式 Web 设计（RWD）** 方案，一套代码同时覆盖桌面端与移动端：

- **统一断点** — 以 `768px` 为移动端/桌面端分界线，CSS 媒体查询 + JS `isMobile` 双重判断
- **底部 Tab 导航** — 移动端自动切换为底部 Tab 栏（持仓/自选/统计/我的），毛玻璃背景 + 金色活跃指示
- **安全区域适配** — 通过 `env(safe-area-inset-*)` 适配 iPhone 刘海屏与底部 Home Indicator
- **流式响应字体** — 大量使用 `clamp()` 实现字体大小在 350px~768px 间平滑过渡（如 `clamp(13px, 3.2vw, 14px)`）
- **触摸交互优化** — 最小 44px 触摸目标、`touch-action` 手势控制、`-webkit-tap-highlight-color` 去除点击高亮
- **ECharts 图表适配** — 移动端自动调整字体、柱宽、图例、间距，支持触摸缩放与平移
- **Ant Design 组件适配** — Card、Modal、Form、Input、Dropdown、Button、Table、Tabs 等全部组件均有移动端样式覆盖
- **多级断点** — 768px（平板/大屏手机）→ 380px（小屏手机）→ 350px（极小屏），逐级精简显示内容
- **减少动画偏好** — 尊重系统 `prefers-reduced-motion` 设置，为敏感用户关闭动画

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |
| Zustand | 4.x | 状态管理 |
| React Router DOM | 6.x | 路由管理 |
| ECharts | 5.x | 图表库 |
| Axios | 1.x | HTTP 客户端 |
| Day.js | 1.x | 日期处理 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18 LTS | 运行环境 |
| Express | 4.x | Web 框架 |
| MySQL2 | 3.x | 数据库驱动 |
| JSONWebToken | 9.x | JWT 认证 |
| Bcryptjs | 2.x | 密码加密 |
| Node-cron | 3.x | 定时任务 |
| XLSX | 0.18.x | Excel 处理 |
| Multer | 1.4.x | 文件上传 |

### 数据库

MySQL 8.0+，核心表：`users`、`funds`、`holdings`、`transactions`、`groups`、`investment_plans`、`favorites`、`user_settings`、`daily_profits`、`feedbacks`

## 项目结构

```
realtime/
├── server/                          # 后端服务
│   ├── app.js                       # Express 入口
│   ├── config/
│   │   └── database.js              # 数据库连接池配置
│   ├── controllers/                 # 控制器层
│   │   ├── authController.js
│   │   ├── fundController.js
│   │   ├── holdingController.js
│   │   ├── transactionController.js
│   │   ├── planController.js
│   │   ├── statsController.js
│   │   ├── groupController.js
│   │   ├── favoriteController.js
│   │   ├── feedbackController.js
│   │   ├── importExportController.js
│   │   └── settingController.js
│   ├── models/                      # 数据模型层
│   ├── routes/                      # API 路由
│   ├── services/                    # 业务逻辑层
│   │   ├── fundService.js           # 基金数据服务（外部接口代理）
│   │   ├── holdingService.js        # 持仓服务
│   │   ├── dailyProfitService.js    # 日收益计算服务
│   │   ├── planService.js           # 定投服务
│   │   └── globalCache.js           # 全局缓存
│   └── scripts/
│       └── syncFunds.js             # 全量基金数据同步脚本
│
├── web/                             # 前端应用
│   ├── src/
│   │   ├── App.tsx                  # 应用入口
│   │   ├── App.css                  # 全局样式（CSS 变量、主题）
│   │   ├── main.tsx                 # 渲染入口
│   │   ├── components/              # 通用组件
│   │   │   ├── Header.tsx           # 顶部导航栏
│   │   │   ├── BottomTabBar.tsx     # 底部 Tab 导航
│   │   │   ├── GroupSwitcher.tsx    # 分组切换器
│   │   │   ├── FundListItem.tsx     # 基金列表项
│   │   │   ├── MarketIndexStrip.tsx # 大盘指数条
│   │   │   └── modals/             # 弹窗组件
│   │   ├── layouts/                 # 布局组件
│   │   ├── pages/                   # 页面组件
│   │   │   ├── auth/               # 登录/注册
│   │   │   ├── portfolio/          # 持仓列表
│   │   │   ├── watchlist/          # 自选列表
│   │   │   ├── fund/               # 基金详情
│   │   │   ├── market/             # 大盘走势详情
│   │   │   ├── stats/              # 收益统计
│   │   │   ├── plans/              # 定投计划
│   │   │   ├── profile/            # 个人中心
│   │   │   └── settings/           # 设置
│   │   ├── services/                # API 服务层
│   │   └── store/                   # Zustand 状态管理
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── doc/                             # 项目文档
    ├── PRD.md                       # 产品需求文档
    ├── DESIGN_SYSTEM.md             # 设计系统规范
    ├── CODING_STANDARDS.md          # 代码规范
    ├── interaction_design.md        # 交互设计稿
    ├── COMPONENTS_CHANGELOG.md      # 组件变更日志
    └── UI_OPTIMIZATION_REPORT.md    # UI 优化报告
```

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0
- npm >= 9

### 1. 克隆项目

```bash
git clone https://github.com/li-ze-yi/fund-tracker.git
cd fund-tracker
```

### 2. 配置后端

```bash
cd server

# 安装依赖
npm install

# 创建 .env 文件
cp .env.example .env
# 编辑 .env 填入数据库连接信息
```

`.env` 配置项：

```
MYSQL_HOST=your_mysql_host
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=real_time
JWT_SECRET=your_jwt_secret
PORT=3001
```

### 3. 初始化数据库

参考 `doc/PRD.md` 附录 B 中的 SQL 语句创建数据库和表。

### 4. 同步基金数据

```bash
node scripts/syncFunds.js
```

### 5. 启动后端

```bash
npm run dev
# 服务运行在 http://localhost:3001
```

### 6. 启动前端

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 应用运行在 http://localhost:5173
```

### 7. 构建生产版本

```bash
cd web
npm run build
```

## 设计系统

采用 **墨玉金（Jade Gold）** 深色主题，以深色为底、金色为点缀，传递专业、高端、可信赖的品牌调性。

| 类别 | 色值 | 用途 |
|------|------|------|
| 品牌主色 | `#D4A84B` | 按钮、选中态、品牌元素 |
| 主背景 | `#0D1117` | 页面底层背景 |
| 卡片背景 | `#161B22` | 卡片、面板背景 |
| 主文字 | `#E6EDF3` | 标题、重要数据 |
| 涨（红） | `#E53935` | 正收益、涨幅 |
| 跌（绿） | `#43A047` | 负收益、跌幅 |

完整设计规范参见 [DESIGN_SYSTEM.md](doc/DESIGN_SYSTEM.md)。

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/holdings` | 获取持仓列表（含实时估值） |
| POST | `/api/holdings` | 添加持仓 |
| DELETE | `/api/holdings/:id` | 删除持仓 |
| POST | `/api/holdings/buy/:id` | 加仓 |
| POST | `/api/holdings/sell/:id` | 减仓 |
| GET | `/api/funds/search?keyword=` | 基金搜索 |
| GET | `/api/funds/:code` | 基金详情 |
| GET | `/api/indices?codes=` | 大盘指数数据 |
| GET | `/api/transactions/fund/:code` | 基金交易记录 |
| DELETE | `/api/transactions/:id` | 删除交易记录 |
| GET | `/api/stats/daily` | 日收益统计 |
| GET | `/api/stats/monthly` | 月收益统计 |
| GET | `/api/stats/yearly` | 年收益统计 |
| GET | `/api/groups` | 分组列表 |
| POST | `/api/groups` | 创建分组 |
| GET | `/api/favorites` | 自选列表 |
| POST | `/api/favorites` | 添加自选 |
| DELETE | `/api/favorites/:code` | 移除自选 |
| GET | `/api/plans` | 定投计划列表 |
| POST | `/api/plans` | 创建定投计划 |
| POST | `/api/import/upload` | 导入持仓 |
| POST | `/api/export` | 导出持仓 |
| GET | `/api/settings` | 获取用户设置 |
| PUT | `/api/settings` | 更新用户设置 |

## 安全

- 密码使用 **bcrypt** 加密存储
- 接口鉴权使用 **JWT Token**（7天有效期）
- SQL 注入防护：参数化查询
- `.env` 文件已加入 `.gitignore`，不提交敏感信息

## License

MIT
