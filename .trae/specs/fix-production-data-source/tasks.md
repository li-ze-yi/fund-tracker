# Tasks

- [x] Task 1: 修改 getFundHoldings 支持港股代码
  - 第376行：`if (!stockCode || stockCode.length !== 6 || !/^\d+$/.test(stockCode)) continue;`
  - 改为：`if (!stockCode || !/^\d{5,6}$/.test(stockCode)) continue;`
  - 验证：005827 的 getFundHoldings 返回10只持仓（含5只港股）

- [x] Task 2: 修改 getStockPrefix 支持港股前缀
  - 第342-344行：
  - ```javascript
    function getStockPrefix(code) {
      return code.startsWith('6') ? 'sh' : 'sz';
    }
    ```
  - 改为：
  - ```javascript
    function getStockPrefix(code) {
      if (code.length === 5) return 'hk'; // 港股
      return code.startsWith('6') ? 'sh' : 'sz'; // A股
    }
    ```
  - 验证：getStockPrefix('00700') 返回 'hk'，getStockPrefix('600519') 返回 'sh'

- [x] Task 3: 修改 getStocksRealtime 解析港股行情
  - 第404行正则：`/v_(?:sh|sz)(\d+)="(.+)"/`
  - 改为：`/v_(?:sh|sz|hk)(\d+)="(.+)"/`
  - 验证：getStocksRealtime(['00700','600519']) 返回两只股票的行情
  - 实测参考：`http://qt.gtimg.cn/q=hk00700` 返回 `v_hk00700="100~腾讯控股~00700~561.000~..."`，字段[3]当前价、字段[32]涨跌幅，与A股格式一致

- [x] Task 4: 修改 getHoldingsEstimatedOverlay 增加ETF联接回退
  - 第745-748行：
  - ```javascript
    if (totalRatio < 30) {
      return null;
    }
    ```
  - 改为：
  - ```javascript
    if (totalRatio < 30) {
      // 覆盖率极低时，尝试ETF联接基金估值（可能是ETF联接基金的指数成分股持仓）
      if (totalRatio < 5) {
        const etfResult = await getETFBasedEstimatedValue(fundCode);
        if (etfResult) return etfResult;
      }
      return null;
    }
    ```
  - 验证：005918（ETF联接，覆盖率极低）返回 etf_linkage 估值

- [x] Task 5: 端到端验证（多类型基金）
  - **含港股持仓**：005827（易方达蓝筹精选）→ getHoldingsEstimatedOverlay 返回 holdings 估值（覆盖率约39%）
  - **ETF联接（低覆盖）**：005918（天弘沪深300ETF联接C）→ 返回 etf_linkage 估值（持仓覆盖率<5%回退）
  - **ETF联接（无持仓）**：019633 → 返回 etf_linkage 估值（保持现有行为）
  - **ETF联接（沪深300）**：110020（易方达沪深300ETF联接A）→ 返回 etf_linkage 估值
  - **ETF联接QDII（中概互联）**：006327（易方达中证海外互联网50ETF联接A）→ 返回 etf_linkage 估值（母ETF 513050实时行情）
  - **ETF联接QDII（纳斯达克）**：040048（华安纳斯达克100ETF联接A）→ 返回 etf_linkage 估值（母ETF实时行情，注意反映A股预期非美股实际涨跌）
  - **纯A股持仓**：161725（招商中证白酒）→ 返回 holdings 估值（保持现有行为）
  - **QDII基金（含港股）**：006282（国富大中华精选）→ 若持仓含港股，使用 hk 前缀获取行情，返回 holdings 估值（美股持仓暂不支持，但占比低不影响整体估算）
  - **债券型基金**：003838（广发安泽短债A）→ getFundHoldings 返回空或覆盖率<5%，不触发ETF回退，返回 null
  - **FOF基金**：005156（华夏聚惠稳健FOF）→ 持仓为基金代码，被 `/^\d{5,6}$/` 过滤，返回 null
  - **腾讯接口港股行情实测**：验证 `http://qt.gtimg.cn/q=sh600519,hk00700,sz000858` 混合查询返回3条行情
  - **腾讯接口QDII母ETF实测**：验证 `http://qt.gtimg.cn/q=sh513050` 返回中概互联ETF实时行情

- [x] Task 6: 修改 getHoldingsEstimatedOverlay 支持低覆盖率加权估值
  - 当前代码（第746-751行）：
  - ```javascript
    if (totalRatio < 30) {
      // 覆盖率不足时，尝试ETF联接基金估值（ETF联接基金股票持仓天然较低，不能仅靠<5阈值判断）
      const etfResult = await getETFBasedEstimatedValue(fundCode);
      if (etfResult) return etfResult;
      return null;
    }
    ```
  - 改为：ETF 回退失败后，若持仓行情有效（totalRatio > 0 且成功获取到行情的持仓数 > 0），不返回 null，继续走下方加权计算逻辑
  - 实现要点：去掉 `return null`，改为条件判断（仅在持仓行情完全无效时返回 null）
  - 验证：014558（偏股混合，覆盖率20.9%）返回 holdings 估值
  - 回归：005461（债券基金）仍返回 null（持仓行情无效），012348（ETF联接）仍返回 etf_linkage

- [x] Task 7: 追加回归验证
  - 014558（华商品质慧选混合A）→ holdings 估值，覆盖率约20.9%
  - 012348（天弘恒生科技ETF联接A）→ etf_linkage 估值（保持修复后行为）
  - 005461（南方希元可转债债券A）→ null（持仓行情无效，仍返回null）
  - 161725（招商中证白酒）→ holdings 估值（保持现有行为）
  - 005827（易方达蓝筹精选）→ holdings 估值（保持现有行为）

# Task Dependencies
- Task 2、3 依赖 Task 1（先支持港股代码解析，再支持前缀和行情）
- Task 4 独立（ETF联接回退逻辑）
- Task 5 依赖 Task 1-4 全部完成
- Task 6 独立（低覆盖率加权估值，基于 Task 4 已完成的 ETF 回退逻辑）
- Task 7 依赖 Task 6 完成
