const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'data/**', '*.log']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      // 未导入/未定义标识符（如历史 getLocalToday 缺失）必须报错，避免 ReferenceError
      'no-undef': 'error',
      // 未使用变量按警告处理（不阻断，便于后续渐进清理）
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 有意为之的空 catch（如 optionalAuth 静默吞掉无效 token）不报错
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 关闭 ESLint 9 新增的偏风格规则，聚焦阻断类问题，避免对存量代码产生大量非阻断告警
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off'
    }
  }
];