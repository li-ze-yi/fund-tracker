// 统一导出：在你的项目里 `import { LiveIndustryRotationDashboard, sampleData } from "./fund-integration"`
export { IndustryRotationDashboard, LiveIndustryRotationDashboard } from "./Dashboard";
export type { DataSourceConfig } from "./Dashboard";
export { useMarketData } from "./useMarketData";
export type { MarketDataFetcher, MarketDataState, UseMarketDataOpts } from "./useMarketData";
export { fetchYourApi, adaptFromYourApi } from "./sources/yourApiSource";
export { fetchEastmoney } from "./sources/eastmoneySource";
export { default as RotationTerminal } from "./RotationTerminal";
export * from "./types";
export { sampleData } from "./sampleData";
