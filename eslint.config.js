import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Vercel Functions·빌드 스크립트는 Node 환경이라 process 등이 전역이다.
  // eslint 9 flat config 에서는 /* eslint-env node */ 주석이 동작하지 않으므로
  // 여기서 선언해야 한다. 이게 없으면 no-undef 가 계속 떠서 배포 전 lint 게이트가
  // 무의미해진다(백색화면 2건이 lint 로 잡힐 수 있었던 사고 이력).
  {
    files: ['api/**/*.js', 'vite.config.js', 'dev-server.js', 'dev-api.js'],
    languageOptions: { globals: globals.node },
  },
])
