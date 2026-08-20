import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript 类型系统已覆盖未定义标识符（no-undef 会误报 DOM/浏览器全局），关闭此规则
      'no-undef': 'off',
      // 有意为之的空 catch（如 JSON.parse 兜底）不报错
      'no-empty': ['error', { allowEmptyCatch: true }],
      // CJK 文案常在 JSX 文本/字符串中使用全角空格做视觉对齐，跳过这类误报
      'no-irregular-whitespace': ['error', { skipJSXText: true, skipStrings: true }],
      // 未使用变量按警告处理（不阻断，便于渐进清理）
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
);