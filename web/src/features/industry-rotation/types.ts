// ============================================================================
// 数据契约 (DashboardData)
// ----------------------------------------------------------------------------
// 仪表盘视图层只认这一个结构。无论数据来自你的行情系统还是第三方回退，
// 最终都必须被映射成下面这个形状再喂给 <IndustryRotationDashboard />。
// 金额单位统一约定为「亿元」，涨跌幅为「百分比数值」(例如 +1.02 表示 +1.02%)。
// ============================================================================

/** 宽基指数行情 */
export interface IndexQuote {
  name: string;
  code: string; // 数字代码，如 "000001"
  pct: number; // 涨跌幅 %
  value?: number; // 收盘/最新点位
  amount?: number; // 成交额（亿元）
}

/** 申万一级行业单元格 */
export interface SectorCell {
  name: string;
  pct: number; // 行业涨跌幅 %
  mainflow: number; // 主力净流入（亿元，正=流入 / 负=流出）
}

/** 巨潮风格指数单元格 */
export interface StyleCell {
  name: string; // 如 "中盘成长" / "大盘价值"
  pct: number; // 涨跌幅 %
}

/** 北向资金单日数据点（日频，非秒级） */
export interface NorthboundPoint {
  date: string; // MM-DD
  amount: number; // 北向成交额（亿元）
  pctOfMarket: number; // 占两市成交比例 %
}

/** 沪深股通十大成交股 */
export interface NorthboundStock {
  name: string;
  code: string;
  market?: 'sh' | 'sz'; // 沪股通 / 深股通
  net?: number; // 净买入（亿元）—— 仅为上榜个股局部口径，可能缺失
  amount?: number; // 成交额（亿元）
  pct?: number; // 涨跌幅 %
}

/** 涨跌家数 / 成交额概览 */
export interface Breadth {
  up: number;
  down: number;
  flat: number;
  amount: number; // 两市成交额（亿元）
}

/** 一条配置研判 */
export interface Thesis {
  title: string;
  rating: string; // 超配 / 标配 / 低配 / 观察
  body: string;
  invalid?: string; // 证伪条件
  next?: string; // 下一观测点
}

/** 仪表盘完整数据 */
export interface DashboardData {
  date: string; // 数据日期 YYYY-MM-DD
  asOf?: string; // 最近一次更新时间 HH:MM:SS
  indices: IndexQuote[]; // 宽基指数（建议 12 个）
  sectors: SectorCell[]; // 申万一级行业（31 个）
  styleMatrix: StyleCell[]; // 巨潮 6 风格（顺序：大盘成长/价值、中盘成长/价值、小盘成长/价值）
  northbound: {
    series: NorthboundPoint[]; // 近 9 日北向成交额趋势
    top10: NorthboundStock[]; // 沪深股通十大成交股
    note?: string; // 北向口径说明
  };
  breadth: Breadth;
  mainFlowTotal: number; // 全市场主力净流入（亿元）
  thesis: Thesis[]; // 3 条行业配置研判
  notes?: string[]; // 口径 / 来源说明（会显示在页脚）
}
