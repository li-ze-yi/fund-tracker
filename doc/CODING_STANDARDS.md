# 代码规范与最佳实践

> **版本**: v2.0  
> **日期**: 2026-05-11  
> **适用范围**: 养基发财 Web前端项目  

---

## 📋 目录

1. [React组件开发规范](#react组件开发规范)
2. [Ant Design 5.x 集成最佳实践](#ant-design-5x-集成最佳实践)
3. [ECharts 配置规范](#echarts-配置规范)
4. [状态管理 (Zustand)](#状态管理-zustand)
5. [API调用与错误处理](#api调用与错误处理)
6. [TypeScript类型定义](#typescript类型定义)
7. [性能优化建议](#性能优化建议)
8. [常见问题与解决方案](#常见问题与解决方案)

---

## React组件开发规范

### 组件结构模板

```tsx
import { useState, useEffect } from 'react';
import { Card, Button, App } from 'antd';  // 使用App替代静态message
import { SomeIcon } from '@ant-design/icons';
import { someService } from '@/services/someService';

// 接口定义（使用interface而非type）
interface ComponentProps {
  // 必填属性
  id: string;
  
  // 可选属性
  title?: string;
  mode?: 'default' | 'compact';
  
  // 回调函数
  onClick?: () => void;
  onSuccess?: (data: any) => void;
}

// 默认导出函数组件（非箭头函数，便于调试）
export default function MyComponent({ 
  id, 
  title = '默认标题',  // 提供合理默认值
  mode = 'default',
  onClick,
  onSuccess 
}: ComponentProps) {
  
  // 使用App.useApp()获取上下文API
  const { message, modal, notification } = App.useApp();
  
  // 状态声明（使用明确类型）
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<any[]>([]);
  
  // 数据加载函数
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await someService.getData(id);
      setData(result.data || result || []);
      // 成功时可选：显示提示
      // message.success('数据加载成功');
    } catch (error: any) {
      message.error(error?.response?.data?.message || '加载失败');
      console.error('MyComponent.loadData error:', error);  // 记录完整错误
    } finally {
      setLoading(false);
    }
  };
  
  // 副作用（带清理）
  useEffect(() => {
    loadData();
    
    // 定时器、事件监听器等需在此清理
    const timer = setInterval(loadData, 60000);
    return () => clearInterval(timer);
  }, [id]);  // 依赖项要完整
  
  // 事件处理函数
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    // 默认行为...
  };
  
  // 渲染
  return (
    <div style={{ /* 使用CSS变量 */ }}>
      {/* JSX内容 */}
    </div>
  );
}
```

---

### 命名规范

#### 文件命名
```
✅ 正确示例:
- LoginPage.tsx          (PascalCase，页面组件)
- FundListItem.tsx       (PascalCase，UI组件)
- useAuthHook.ts        (camelCase，自定义Hook)
- authService.ts        (camelCase，服务模块)
- types.ts              (camelCase，类型定义)

❌ 错误示例:
- loginPage.tsx         (小写开头)
- fund-list-item.tsx    (使用连字符)
- UserAuth.tsx           (不清晰的缩写)
```

#### 变量/函数命名
```typescript
// 状态变量: 使用名词，前缀表明类型
const [isLoading, setIsLoading] = useState(false);
const [userList, setUserList] = useState<UserType[]>([]);
const [showModal, setShowModal] = useState(true);

// 布尔值: is/has/can/should 开头
const isActive = true;
const hasError = false;
const canEdit = true;
const shouldRefresh = true;

// 函数: 动词或动词短语
const handleSubmit = () => {};
const handleCancel = () => {};
const loadUserData = async () => {};
const calculateTotalProfit = () => {};

// 事件处理: handle/on前缀
const handleClick = () => {};      // 点击
const handleChange = (value) => {}; // 值变化
const onSubmit = () => {};          // 表单提交
const onClose = () => {};           // 关闭

// 回调函数: on前缀
const onSuccess = () => {};
const onError = (error) => {};

// 常量: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = '/api/v1';
```

---

### 样式编写规范

#### 内联样式 vs CSS类

**推荐场景：**

```tsx
// ✅ 动态样式 - 使用内联
<div style={{
  color: isActive ? 'var(--gain)' : 'var(--loss)',
  opacity: isHovered ? 1 : 0,
}}>

// ✅ 组件库props - 使用对象
<Card style={{ background: 'var(--bg-elevated)' }}>

// ❌ 复杂布局 - 应提取为CSS类
<div style={{ 
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '20px',
  // ... 太多属性
}}>
```

**CSS变量使用规范：**

```tsx
// ✅ 必须使用CSS变量
<div style={{ color: 'var(--text-primary)' }}>
<div style={{ background: 'var(--bg-elevated)' }}>
<div style={{ borderColor: 'var(--border-subtle)' }}>

// ❌ 禁止硬编码颜色值
<div style={{ color: '#F1F5F9' }}>  // 错误！
<div style={{ background: '#151F2E' }}>  // 错误！
```

**数字格式化：**

```tsx
// ✅ 数字使用等宽字体 + number-tabular类
<span className="number-tabular" style={{ 
  fontFamily: 'var(--font-mono)' 
}}>
  ¥{value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
</span>

// ✅ 大额自动转换显示
{value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toFixed(2)}
```

---

## Ant Design 5.x 集成最佳实践

### ConfigProvider配置

在应用根组件配置全局主题：

```tsx
// App.tsx 或 MainLayout.tsx
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#D4A84B',           // 品牌主色
          borderRadius: 8,                   // 全局圆角
          fontFamily: `var(--font-display), sans-serif`,
        },
        components: {
          Button: {
            primaryShadow: '0 4px 14px rgba(212, 168, 75, 0.25)',
            controlHeight: 46,               // 主按钮高度
          },
          Input: {
            controlHeight: 46,
            activeBorderColor: '#D4A84B',
            hoverBorderColor: '#D4A84B',
          },
        },
      }}
    >
      <AntApp>
        <Router>
          <Routes>
            {/* 路由配置 */}
          </Routes>
        </Router>
      </AntApp>
    </ConfigProvider>
  );
}
```

---

### 使用App.useApp()替代静态方法

**必须遵循的规则：**

```tsx
// ❌ 错误方式（会产生控制台警告）
import { message, notification, modal } from 'antd';

function MyComponent() {
  const handleClick = () => {
    message.success('成功');        // ⚠️ 警告
    notification.info('信息');     // ⚠️ 警告
    modal.confirm({ ... });        // ⚠️ 警告
  };
}

// ✅ 正确方式
import { App } from 'antd';

function MyComponent() {
  const { message, notification, modal } = App.useApp();
  
  const handleClick = () => {
    message.success('成功');        // ✅ 无警告
    notification.info('信息');     // ✅ 自动继承主题
    modal.confirm({ ... });        // ✅ 支持国际化
  };
}
```

**适用范围：**
- 所有页面组件（Page）
- 所有模态框组件（Modal）
- 所有业务组件

**例外情况：**
- 在非React环境（如工具函数）中可使用静态方法
- 但应添加注释说明原因

---

### 组件Props类型安全

```tsx
// ✅ 为所有组件Props定义接口
interface ModalProps {
  open: boolean;
  title?: string;
  onOk: () => void;
  onCancel: () => void;
}

// ✅ 使用明确的类型
const [visible, setVisible] = useState<boolean>(false);

// ✅ 解构时提供默认值
const { data = [], loading = false } = props;

// ❌ 避免any类型
const [items, setItems] = useState<any[]>([]);  // 尽量避免
```

---

## ECharts 配置规范

### 渐变色正确写法

**⚠️ 重要：不要导入echarts包！**

```javascript
// ❌ 错误方式（会导致运行时错误）
import * as echarts from 'echarts';

const option = {
  series: [{
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'red' },
        { offset: 1, color: 'blue' },
      ]),
    },
  }],
};

// ✅ 正确方式（使用对象字面量）
const option = {
  series: [{
    itemStyle: {
      color: {
        type: 'linear',              // 类型
        x: 0, y: 0, x2: 0, y2: 1,   // 方向
        colorStops: [                // 色标点
          { offset: 0, color: 'rgba(239, 68, 68, 0.9)' },
          { offset: 1, color: 'rgba(239, 68, 68, 0.4)' },
        ],
      },
    },
  }],
};
```

**优势：**
- ✅ 无需额外导入，减小打包体积
- ✅ 更好的TypeScript支持
- ✅ 与React生态系统更兼容
- ✅ 支持tree-shaking优化

---

### 图表配置最佳实践

#### Tooltip配置

```javascript
tooltip: {
  trigger: 'axis',                    // 触发方式
  backgroundColor: 'rgba(17, 24, 39, 0.95)',  // 深色背景
  borderColor: 'rgba(148, 163, 184, 0.2)',  // 边框
  borderWidth: 1,
  textStyle: { 
    color: '#F1F5F9',                // 文字颜色
    fontSize: 13,                      // 字号
    fontWeight: 500,                   // 字重
  },
  axisPointer: {                     // 指示线
    type: 'shadow',
    shadowStyle: { color: 'rgba(148, 163, 184, 0.05)' },
  },
  formatter: (params) => {             // 自定义格式化
    const p = params[0];
    return `
      <div style="font-weight: 600">${p.name}</div>
      <div style="color: ${p.color}">${p.value}</div>
    `;
  },
},
```

#### 坐标轴配置

```javascript
xAxis: {
  type: 'category',
  axisLabel: {
    fontSize: 11,
    color: '#94A3B8',                 // 使用设计系统颜色
    rotate: 30,                        // 长标签旋转
  },
  axisLine: { 
    lineStyle: { color: 'rgba(148, 163, 184, 0.15)' }  // 弱化轴线
  },
  axisTick: { show: false },          // 隐藏刻度
},

yAxis: [
  {
    type: 'value',
    name: '收益',
    position: 'left',
    axisLabel: {
      fontSize: 11,
      color: '#94A3B8',
      formatter: (v) => Math.abs(v) >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toFixed(0),
    },
    splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.08)', type: 'dashed' } },
    axisLine: { show: false },
  },
  {
    type: 'value',
    name: '%',
    position: 'right',
    axisLabel: {
      formatter: '{value}%',
    },
    splitLine: { show: false },       // 双轴时隐藏辅助线
  },
],
```

#### DataZoom配置

```javascript
dataZoom: [
  {
    type: 'inside',                   // 内置缩放
    start: 0,
    end: 100,
    zoomOnMouseWheel: false,         // 禁用滚轮缩放（避免冲突）
    moveOnMouseMove: true,
  },
  {
    type: 'slider',                   // 滑块
    bottom: 5,
    height: 20,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    fillerColor: 'rgba(212, 168, 75, 0.2)',  // 品牌色填充
    borderColor: 'rgba(148, 163, 184, 0.2)',
    textStyle: { color: '#64748B', fontSize: 10 },
  },
],
```

---

## 状态管理 (Zustand)

### Store定义规范

```typescript
// store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: any | null;
  isAuthenticated: boolean;
  
  // Actions
  login: (token: string, user: any) => void;
  logout: () => void;
  updateUser: (userData: any) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      
      isAuthenticated: false,  // 计算属性可在组件中获取
      
      login: (token, user) =>
        set({ token, user, isAuthenticated: true }),
      
      logout: () =>
        set({ token: null, user: null, isAuthenticated: false }),
        
      updateUser: (userData) =>
        set((state) => ({ user: { ...state.user, ...userData } })),
    }),
    {
      name: 'auth-storage',  // localStorage key
      partialize: (state) => ({  // 只持久化必要字段
        token: state.token,
        user: state.user,
      }),
    }
  )
);
```

---

### Store使用规范

```tsx
function MyPage() {
  // ✅ 只解构需要的state/actions
  const { user, logout } = useAuthStore();
  
  // ✅ 在回调中使用最新状态（通过函数式更新）
  const handleLogout = () => {
    logout();
    // 或者需要基于当前状态的操作：
    // useAuthStore.getState().someAction();
  };
  
  return (
    <div>
      <h1>{user?.username}</h1>
      <Button onClick={handleLogout}>退出</Button>
    </div>
  );
}

// ⚠️ 注意：不要过度解构
// ❌ 避免
const { token, user, isAuthenticated, login, logout, updateUser } = useAuthStore();
// 只取所需，保持代码清晰
```

---

## API调用与错误处理

### Service层封装

```typescript
// services/exampleService.ts
import api from './api';

export interface ExampleData {
  id: string;
  name: string;
  createdAt: string;
}

export const exampleService = {
  // 获取列表
  getList: async (): Promise<ExampleData[]> => {
    const response = await api.get('/examples');
    return response.data?.list || response.data || [];
  },

  // 获取详情
  getDetail: async (id: string): Promise<ExampleData> => {
    const response = await api.get(`/examples/${id}`);
    return response.data?.item || response.data;
  },

  // 创建
  create: async (data: any): Promise<ExampleData> => {
    const response = await api.post('/examples', data);
    return response.data?.item || response.data;
  },

  // 更新
  update: async (id: string, data: any): Promise<ExampleData> => {
    const response = await api.put(`/examples/${id}`, data);
    return response.data?.item || response.data;
  },

  // 删除
  delete: async (id: string): Promise<void> => {
    await api.delete(`/examples/${id}`);
  },
};
```

---

### 错误处理模式

```typescript
const loadData = async () => {
  setLoading(true);
  try {
    const result = await exampleService.getList(id);
    
    // 兼容性处理：不同的响应格式
    const list = result.data?.list || result.data || result || [];
    
    setData(list);
    
    // 可选：成功提示（根据业务需求决定是否显示）
    // message.success(`成功加载 ${list.length} 条数据`);
    
  } catch (error: any) {
    // 1. 显示用户友好的错误信息
    const errorMsg = error?.response?.data?.message 
                   || error?.message 
                   || '操作失败，请稍后重试';
    message.error(errorMsg);
    
    // 2. 控制台记录完整错误（便于调试）
    console.error('loadData failed:', {
      error,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });
    
    // 3. 可选：上报错误监控系统
    // errorReporting.capture(error);
    
  } finally {
    setLoading(false);
  }
};
```

---

### 数据降级策略

```typescript
useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    try {
      const apiResult = await statsService.getDailyStats();
      const list = extractList(apiResult);
      
      if (list.length > 0) {
        // 优先使用真实API数据
        setData(list);
        calculateSummary(list);
      } else {
        // API返回空数组时使用Mock数据
        console.warn('API returned empty, using mock data');
        useMockData();
      }
    } catch (error) {
      // API请求失败时使用Mock数据
      console.error('API failed, falling back to mock data:', error);
      useMockData();
    } finally {
      setLoading(false);
    }
  };
  
  fetchData();
}, [period]);
```

---

## TypeScript类型定义

### 接口定义位置

```
src/types/
  index.ts          # 导出所有类型
  auth.ts           # 认证相关
  fund.ts           # 基金相关
  transaction.ts    # 交易相关
  common.ts         # 通用类型
```

---

### 类型定义示例

```typescript
// types/common.ts

// API通用响应
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 分页响应
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// 选项配置
interface SelectOption<V = string | number> {
  label: string;
  value: V;
  disabled?: boolean;
}

// types/fund.ts

interface FundInfo {
  code: string;
  name: string;
  type?: string;              // 股票型/混合型/债券型等
  net_value?: number;         // 最新净值
  estimated_change?: number;  // 估算涨跌幅%
  market_value?: number;      // 市值
  daily_profit?: number;      // 当日收益
  accumulated_profit?: number; // 累计收益
  is_favorite?: boolean;      // 是否自选
  created_at?: string;        // 成立日期
}

// types/transaction.ts

interface Transaction {
  id: number;
  fund_code: string;
  type: 'buy' | 'sell';       // 交易类型
  shares: number;             // 份额
  amount: number;             // 金额
  price: number;              // 成交价/净值
  fee_rate?: number;          // 手续费率
  transaction_date: string;    // 交易日期
  created_at: string;          // 创建时间
}
```

---

## 性能优化建议

### React性能

#### 1. 使用useMemo/useCallback

```tsx
// ✅ 复杂计算结果缓存
const sortedData = useMemo(() => {
  return [...data].sort((a, b) => b.profit - a.profit);
}, [data]);

// ✅ 回调函数稳定引用
const handleClick = useCallback((id: string) => {
  navigate(`/fund/${id}`);
}, [navigate]);

// ❌ 避免在render中创建新对象/数组
<Component style={{ color: 'red' }} />  // 每次渲染都创建新对象
```

#### 2. 列表key必须唯一

```tsx
// ✅ 使用唯一标识符
{items.map(item => (
  <div key={item.id}>{item.name}</div>
))}

// ❌ 避免使用index作为key（除非列表是静态的）
{items.map((item, index) => (
  <div key={index}>{item.name}</div>  // 可能导致问题
))}
```

#### 3. 条件渲染优化

```tsx
// ✅ 使用三元表达式（简单条件）
{isLoading ? <Skeleton /> : <Content />}

// ✅ 使用&&运算符（可选渲染）
{showHeader && <Header />}

// ❌ 避免不必要的嵌套渲染
{condition && (
  <div>
    {anotherCondition && <Nested />}
  </div>
)}
```

---

### ECharts性能

#### 1. 数据量控制

```javascript
// ✅ 大数据量时采样或聚合
const displayData = rawData.length > 1000 
  ? rawData.filter((_, i) => i % 10 === 0)  // 每10个取1个
  : rawData;

// ✅ DataZoom限制初始渲染范围
dataZoom: [{ start: 0, end: 50 }]  // 只渲染前50%数据
```

#### 2. 避免频繁更新option

```tsx
// ❌ 错误：每次都创建新的option对象
<ECharts option={generateOption(data)} />

// ✅ 正确：使用useMemo缓存option
const chartOption = useMemo(() => generateOption(data), [data]);
return <ECharts option={chartOption} />;
```

#### 3. 合理设置动画

```javascript
animation: true,
animationDuration: 500,        // 初始动画时长
animationEasing: 'cubicOut',  // 缓动函数

// 大数据量时可关闭动画提升性能
// animation: data.length > 1000 ? false : true,
```

---

### 打包优化

#### 1. 代码分割

```tsx
// ✅ 使用React.lazy懒加载
const FundDetailPage = lazy(() => import('./pages/fund/FundDetailPage'));

<Suspense fallback={<Skeleton />}>
  <FundDetailPage />
</Suspense>
```

#### 2. Tree Shaking

```javascript
// ✅ 按需导入
import { Button } from 'antd';  // 只打包Button
// import * as Antd from 'antd';  // ❌ 打包整个antd

// ✅ 使用对象字面量代替构造函数
const gradient = { type: 'linear', ... };  // ✅
// import * as echarts from 'echarts';  // ❌ 不必要的全量导入
```

---

## 常见问题与解决方案

### Q1: 控制台出现大量antd警告

**问题**:
```
Warning: [antd: message] Static function can not consume context like dynamic theme.
```

**解决方案**:
```tsx
// 将所有静态调用改为App.useApp()
// 参考"Ant Design 5.x集成最佳实践"章节
```

---

### Q2: ECharts报错 "echarts is not defined"

**问题**:
```javascript
ReferenceError: echarts is not defined
at StatsPage
```

**解决方案**:
```javascript
// ❌ 不要这样
import * as echarts from 'echarts';
new echarts.graphic.LinearGradient(...)

// ✅ 应该这样
{
  type: 'linear',
  x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [...],
}
```

---

### Q3: 组件样式不生效

**可能原因及解决：**

1. **CSS变量未定义**
   ```css
   /* 检查 :root[data-theme='dark'] 中是否有该变量 */
   ```

2. **优先级被覆盖**
   ```css
   /* 使用 !important 提升优先级（仅用于覆盖第三方库） */
   .ant-input { color: var(--text-primary) !important; }
   ```

3. **选择器不匹配**
   ```css
   /* 确保选择器正确 */
   .my-component .child-class { ... }
   ```

---

### Q4: 页面切换时API请求中断

**现象**:
```
net::ERR_ABORTED http://localhost:5175/api/xxx
```

**说明**: 这是正常行为，用户快速导航时浏览器会中止未完成的请求。

**处理方式**:
```typescript
// 在组件卸载时取消未完成请求
useEffect(() => {
  const controller = new AbortController();
  
  fetchData({ signal: controller.signal });
  
  return () => controller.abort();  // 清理函数中中止请求
}, []);
```

---

### Q5: React key重复警告

**警告信息**:
```
Warning: Encountered two children with the same key: xxx.
```

**解决方案**:
```tsx
// 确保每个列表项有唯一key
{items.map((item, index) => (
  <div key={`${item.id}-${index}`}>  // 复合key保证唯一性
    {item.content}
  </div>
))}
```

---

### Q4: 页面频繁出现"数据获取异常"错误 ⭐ v2.4新增

**问题现象**:
```
- 持仓界面每隔几秒闪现错误提示，然后又恢复
- 长时间停留后错误越来越频繁
- 控制台显示大量重复的API请求
```

**根本原因**:
1. **事件循环**: loadHoldings成功后触发data-changed事件 → 监听器再次调用loadHoldings → 无限循环
2. **缺少防抖**: 多个地方同时触发请求（初始化、定时器、事件监听、用户操作）
3. **无并发控制**: 快速操作时同时发起多个相同请求

**解决方案 - 三重防护机制**:

```typescript
// ✅ 正确实现（v2.4标准）

// 1️⃣ 引入useRef
import { useState, useEffect, useCallback, useRef } from 'react';

export default function MyComponent() {
  // 2️⃣ 定义防护Ref
  const isLoadingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 3️⃣ 实现带防抖和并发控制的加载函数
  const loadData = useCallback(async (forceRefresh = false) => {
    // 第一层：并发锁
    if (isLoadingRef.current && !forceRefresh) {
      console.log('[MyComponent] 请求被拦截：正在加载中');
      return;
    }
    
    // 第二层：防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      isLoadingRef.current = true;  // 上锁
      
      try {
        // ... 实际数据加载逻辑 ...
        const data = await api.getData();
        setState(data);
        
        // ⚠️ 注意：不要在这里触发会导致循环的事件！
        // window.dispatchEvent(new CustomEvent('data-changed', {...}));
        
      } catch (error: any) {
        console.error('[MyComponent] 加载失败:', error);
        setError(error.message);
      } finally {
        isLoadingRef.current = false;  // 解锁
      }
    }, forceRefresh ? 0 : 300);  // 第三层：强制刷新绕过防抖
    
  }, []);

  return (...);
}
```

**关键点总结：**

| 防护层 | 实现方式 | 作用 |
|--------|---------|------|
| **并发锁** | `isLoadingRef` | 同一时间只允许一个请求 |
| **防抖定时器** | `debounceTimerRef` | 300ms内多次调用只执行最后一次 |
| **强制刷新参数** | `forceRefresh` | 关键操作（定时器/重试）立即执行 |

---

### Q5: 如何实现交互动画（如收藏按钮）⭐ v2.4新增

**需求场景**:
- 点击按钮触发动画反馈
- 动画期间禁用重复点击
- 成功/失败有不同的视觉反馈

**最佳实践**:

```typescript
export default function MyComponent() {
  const { message } = App.useApp();
  
  // 1️⃣ 定义状态
  const [activeItems, setActiveItems] = useState<Set<string>>(new Set());
  const [animatingItem, setAnimatingItem] = useState<string | null>(null);

  // 2️⃣ 实现带动画的处理函数
  const handleAction = async (itemId: string) => {
    if (activeItems.has(itemId)) {
      message.info('已经处理过了');
      return;
    }

    setAnimatingItem(itemId);

    try {
      await api.performAction(itemId);
      setActiveItems(prev => new Set(prev).add(itemId));
      message.success(`操作成功`);
      setTimeout(() => setAnimatingItem(null), 600);
    } catch (err) {
      message.error('操作失败');
      setAnimatingItem(null);
    }
  };

  // 3️⃣ 渲染动态样式
  return (
    <Button
      onClick={() => handleAction(item.id)}
      style={{
        transform: animatingItem === item.id ? 'scale(1.2)' : 'scale(1)',
        transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        background: activeItems.has(item.id) || animatingItem === item.id
          ? 'rgba(212, 160, 23, 0.1)' : 'transparent',
        boxShadow: animatingItem === item.id
          ? '0 0 12px rgba(212, 160, 23, 0.5)' : 'none',
      }}
    >
      {activeItems.has(item.id) || animatingItem === item.id 
        ? <StarFilled /> 
        : <StarOutlined />}
    </Button>
  );
}
```

---

## 代码审查清单

在提交代码前，请确认：

### ✅ React规范
- [ ] 组件使用PascalCase命名
- [ ] Props接口定义完整
- [ ] 使用App.useApp()而非静态方法
- [ ] useEffect依赖数组完整
- [ ] 清理函数（定时器、事件监听器）已实现
- [ ] 列表渲染使用了正确的key

### ✅ TypeScript规范
- [ ] 避免使用any类型
- [ ] 接口/类型定义清晰
- [ ] 函数参数和返回值有类型标注
- [ ] 异步操作有正确的错误处理

### ✅ 样式规范
- [ ] 使用CSS变量而非硬编码颜色
- [ ] 数字使用number-tabular类+font-mono
- [ ] 字号符合设计系统阶梯
- [ ] 间距使用spacing scale
- [ ] 圆角/阴影使用预定义值

### ✅ 性能规范
- [ ] 大列表使用虚拟滚动（如需要）
- [ ] ECharts option使用useMemo缓存
- [ ] 图片使用懒加载
- [ ] 避免在render中创建新对象/数组/函数

### ✅ 可访问性
- [ ] 交互元素触摸区域≥44px
- [ ] 颜色对比度符合WCAG AA标准
- [ ] 重要图片有alt文本
- [ ] 表单元素有关联label

---

**文档维护者**: Frontend Team  
**最后更新**: 2026-05-13 (v2.4)  
**关联文档**: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | [COMPONENTS_CHANGELOG.md](./COMPONENTS_CHANGELOG.md)
