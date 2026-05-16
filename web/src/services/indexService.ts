import api from './api';

interface IndexData {
  code: string;
  name: string;
  nameShort: string;
  point: number;
  change: number;
  changePercent: number;
}

export const ALL_INDEX_META = [
  { code: '000001', name: '上证指数', nameShort: '上证' },
  { code: '000016', name: '上证50', nameShort: '上证50' },
  { code: '399001', name: '深证成指', nameShort: '深证' },
  { code: '399006', name: '创业板指', nameShort: '创业板' },
  { code: '000300', name: '沪深300', nameShort: '沪深300' },
  { code: '000688', name: '科创50', nameShort: '科创50' },
  { code: '399673', name: '创业板50', nameShort: '创业板50' },
  { code: '000905', name: '中证500', nameShort: '中证500' },
  { code: '000852', name: '中证1000', nameShort: '中证1000' },
  { code: 'HSI', name: '恒生指数', nameShort: '恒生' },
  { code: 'HSTECH', name: '恒生科技指数', nameShort: '恒生科技' },
  { code: 'DJI', name: '道琼斯', nameShort: '道琼斯' },
  { code: 'IXIC', name: '纳斯达克', nameShort: '纳斯达克' },
  { code: 'NDX', name: '纳斯达克100', nameShort: '纳指100' },
];

export async function fetchIndexData(codes: string[]): Promise<IndexData[]> {
  try {
    const res = await api.get(`/indices?codes=${codes.join(',')}`);
    const indices: any[] = res.data?.indices || [];
    const map: Record<string, any> = {};
    for (let i = 0; i < indices.length; i++) {
      map[indices[i].code] = indices[i];
    }
    const out: IndexData[] = [];
    for (let j = 0; j < codes.length; j++) {
      const c = codes[j];
      const meta = ALL_INDEX_META.find(function(m) { return m.code === c; });
      const d = map[c];
      if (!meta) continue;
      out.push({
        code: c,
        name: meta.name,
        nameShort: meta.nameShort,
        point: d ? Number(d.point) || 0 : 0,
        change: d ? Number(d.change) || 0 : 0,
        changePercent: d ? Number(d.changePercent) || 0 : 0,
      });
    }
    return out;
  } catch (err) {
    return [];
  }
}

export interface IntradayData {
  times: string[];
  prices: number[];
  source?: string;
  pointCount?: number;
}

export async function fetchIntradayData(code: string): Promise<IntradayData | null> {
  try {
    console.log(`🌐 API call: GET /api/indices/${code}/intraday`);
    const res = await api.get(`/indices/${code}/intraday`);
    console.log(`📦 API response status:`, res.status);
    console.log(`📦 API response data:`, res.data);

    if (res.status === 200 && res.data && res.data.data) {
      const result = {
        times: res.data.data.times || [],
        prices: res.data.data.prices || [],
        source: res.data.source,
        pointCount: res.data.pointCount
      };
      console.log(`✅ Parsed intraday data:`, result);
      return result;
    }

    if (res.status === 404) {
      console.warn(`⚠️ Intraday data not found for ${code} (404)`);
    } else if (res.status === 500) {
      console.error(`❌ Server error fetching intraday for ${code} (500)`);
    }

    return null;
  } catch (err: any) {
    console.error('❌ Network/API error in fetchIntradayData:', err.message || err);
    if (err.response) {
      console.error('   Response status:', err.response.status);
      console.error('   Response data:', err.response.data);
    }
    return null;
  }
}
