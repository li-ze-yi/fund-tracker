# Tasks

- [ ] Task 1: 改进贡献值日志格式
  - 在 [fundService.js](file:///d:/fundtracker/server/services/fundService.js) 第 964 行附近，修改日志输出：
    ```javascript
    const normalizedStock = (coveredContribution + missingContribution) / 100;
    const normalizedBond = bondContribution / 100;
    const normalizedEtf = etfContribution / 100;
    console.log(`[${getTimestamp()}] [holdings] ${fundCode} 加权: Σ(占比×涨跌幅)=${(coveredContribution + missingContribution).toFixed(2)} (归一化≈${normalizedStock.toFixed(2)}%), 债券归一化=${normalizedBond.toFixed(2)}%, ${etfCode ? `母ETF归一化=${normalizedEtf.toFixed(2)}%, ` : ''}最终变化=${estimatedChange.toFixed(2)}%`);
    ```
  - 验证：025209 日志输出 `Σ(占比×涨跌幅)=-143.07 (归一化≈-1.43%), 债券归一化=0.01%, 最终变化=-1.42%`

- [ ] Task 2: 端到端验证
  - 日志输出"归一化" + "最终变化"两个数值，易于理解
  - 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`）

# Task Dependencies
- Task 2 依赖 Task 1
