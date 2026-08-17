# Checklist

## 港股持仓支持验证
- [x] getFundHoldings 过滤条件改为 `/^\d{5,6}$/`，不再过滤5位港股代码
- [x] getStockPrefix 5位代码返回 'hk'，6位以6开头返回 'sh'，其他返回 'sz'
- [x] getStocksRealtime 正则包含 `hk` 前缀：`/v_(?:sh|sz|hk)(\d+)="(.+)"/`
- [x] 腾讯接口混合查询实测：`http://qt.gtimg.cn/q=sh600519,hk00700,sz000858` 返回3条行情
- [x] 腾讯港股返回字段与A股一致：fields[3]当前价、fields[32]涨跌幅（实测 hk00700 返回 `v_hk00700="100~腾讯控股~00700~561.000~..."`）
- [x] 005827（易方达蓝筹精选）getFundHoldings 返回10只持仓（含5只港股）
- [x] 005827 的 getHoldingsEstimatedOverlay 覆盖率约39%，返回 holdings 估值

## ETF联接基金回退验证
- [x] getHoldingsEstimatedOverlay 在 totalRatio < 5% 时调用 getETFBasedEstimatedValue
- [x] ETF联接估值成功时返回其结果，失败时返回 null
- [x] 覆盖率在 5%-30% 之间时不触发ETF回退（避免误判）
- [x] 005918（天弘沪深300ETF联接C）返回 etf_linkage 估值
- [x] 019633（无持仓数据）保持现有行为，返回 etf_linkage 估值
- [x] 110020（易方达沪深300ETF联接A）返回 etf_linkage 估值

## 多类型基金回归验证
- [x] 161725（招商中证白酒，纯A股消费）保持 holdings 估值，覆盖率86%（≥30%）
- [x] 005827（易方达蓝筹精选，含港股混合）返回 holdings 估值，覆盖率39%
- [x] 006327（易方达中概互联50ETF联接A，QDII ETF联接）返回 etf_linkage 估值（母ETF 513050）
- [x] 040048（华安纳斯达克100ETF联接A，QDII ETF联接）返回 etf_linkage 估值（母ETF实时行情）
- [x] 006282（国富大中华精选，QDII）持仓覆盖率<5%触发ETF回退（无母ETF故null，预期行为）
- [x] 003838（广发安泽短债A，债券型）getFundHoldings 返回空或覆盖率<5%，不触发ETF回退，返回 null
- [x] 005156（华夏聚惠稳健FOF）持仓为基金代码被过滤，返回 null
- [x] 持仓覆盖率 ≥ 30% 的基金不触发任何回退逻辑
- [x] 腾讯接口QDII母ETF实测：`http://qt.gtimg.cn/q=sh513050` 返回中概互联ETF实时行情

## 编译验证
- [x] 后端 Node.js 语法检查通过（node -c fundService.js）

## 低覆盖率持仓加权估值验证（追加）
- [x] getHoldingsEstimatedOverlay ETF回退失败后，持仓行情有效时继续走加权计算（不返回null）
- [x] 014558（华商品质慧选混合A，偏股混合）返回 holdings 估值，覆盖率约20.9%
- [x] 014558 的 estimationCoverage 字段标记实际覆盖率
- [x] 005461（南方希元可转债债券A，债券型）持仓行情有效时返回 holdings 估值（覆盖率11.4%，可转债基金有股票仓位属合理行为）
- [x] 012348（天弘恒生科技ETF联接A）保持 etf_linkage 估值（无回归）
- [x] 161725（招商中证白酒）保持 holdings 估值（无回归）
- [x] 005827（易方达蓝筹精选）保持 holdings 估值（无回归）
- [x] 后端 Node.js 语法检查通过（node -c fundService.js）
