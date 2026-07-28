/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import fs from 'node:fs'
import path from 'node:path'

// Vercel 환경 변수에서 VITE_REPORT_MODE 가 'true'인지 확인
const isReportMode = process.env.VITE_REPORT_MODE === 'true';

/**
 * 고객사 공유 페이지(/schedule·/dp-report·/report·/partner·/manager)용 HTML 생성.
 *
 * 왜 필요한가 — SPA는 모든 경로가 같은 index.html을 쓴다. 그래서 협력사 고객에게
 * 링크를 카카오톡·위챗으로 보내면 index.html의 og 태그가 미리보기 카드에 뜬다
 * ("탐코리아 - 글로벌 마케팅 공식 에이전시" + 탐코리아 OG 이미지).
 * 크롤러는 초기 HTML만 읽으므로 React에서 메타를 바꿔도 소용이 없다.
 *
 * VITE_REPORT_MODE(report 서브도메인 전용 빌드)에 의존하면 www 링크를 실수로
 * 보내는 순간 그대로 노출된다. 그래서 도메인이 아니라 **경로** 기준으로 막는다.
 * vercel.json이 위 경로들을 client.html 로 rewrite 한다.
 */
const clientHtmlPlugin = () => ({
  name: 'emit-client-html',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(process.cwd(), 'dist');
    const src = path.join(dist, 'index.html');
    if (!fs.existsSync(src)) return;
    const html = fs.readFileSync(src, 'utf-8')
      .replace(/<title>[\s\S]*?<\/title>/, '<title>캠페인 실적 대시보드</title>')
      // 브랜드가 담긴 메타는 남기지 않고 제거 (외부 이미지로 대체하지 않음 — 의존 최소화)
      .replace(/<meta\s+name="description"[\s\S]*?\/?>/i,
               '<meta name="description" content="캠페인 진행 현황과 실적을 확인하는 전용 페이지입니다." />')
      .replace(/<meta\s+name="keywords"[\s\S]*?\/?>/i, '')
      .replace(/<meta\s+property="og:title"[\s\S]*?\/?>/i,
               '<meta property="og:title" content="캠페인 실적 대시보드" />')
      .replace(/<meta\s+property="og:description"[\s\S]*?\/?>/i,
               '<meta property="og:description" content="캠페인 진행 현황과 실적을 확인하세요." />')
      .replace(/<meta\s+property="og:image"[\s\S]*?\/?>/i, '')
      .replace(/<meta\s+property="og:url"[\s\S]*?\/?>/i, '')
      .replace(/<link\s+rel="canonical"[\s\S]*?\/?>/i, '')
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, '')
      // 고객 데이터 페이지이므로 색인 금지 (robots.txt와 이중 방어)
      .replace(/<\/head>/i, '  <meta name="robots" content="noindex, nofollow" />\n</head>');
    fs.writeFileSync(path.join(dist, 'client.html'), html, 'utf-8');
    const leak = ['탐코리아', 'TamKorea', 'Tam Korea', 'tamkorea']
      .filter((k) => html.slice(0, html.indexOf('</head>')).includes(k));
    console.log(leak.length
      ? `\n⚠️  client.html head 에 브랜드 잔존: ${leak.join(', ')}`
      : '\n✓ client.html 생성 — 고객사 공유 경로용 중립 메타 (브랜드 0건)');
  },
});

// 동적 HTML 변환 플러그인 (빌드 시점에 작동)
const htmlTransformPlugin = () => {
  return {
    name: 'html-transform',
    transformIndexHtml(html) {
      if (isReportMode) {
        // 리포트용 서브도메인 빌드일 경우 탐코리아 색채를 완벽하게 지움
        return html
          .replace(/<title>.*?<\/title>/, '<title>캠페인 실적 대시보드 | Data Analytics</title>')
          .replace(/<meta name="description" content=".*?"\s*\/>/, '<meta name="description" content="글로벌 마케팅 캠페인 실시간 성과 대시보드입니다." />')
          .replace(/<meta property="og:title" content=".*?"\s*\/>/, '<meta property="og:title" content="실시간 캠페인 성과 대시보드" />')
          .replace(/<meta property="og:description" content=".*?"\s*\/>/, '<meta property="og:description" content="캠페인 진행 현황 및 실적을 확인하세요." />')
          // OG 이미지(썸네일)를 탐코리아 로고 대신 깔끔한 데이터 차트 이미지(Unsplash 무료이미지)로 교체
          .replace(/<meta property="og:image" content=".*?"\s*\/>/, '<meta property="og:image" content="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop" />')
          // 탐코리아 구조화 데이터(JSON-LD) 스크립트 삭제
          .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
          // keywords·canonical 에도 브랜드가 남아 있었다 (실측 확인, 2026-07-28)
          .replace(/<meta\s+name="keywords"[\s\S]*?\/?>/i, '')
          .replace(/<link\s+rel="canonical"[\s\S]*?\/?>/i, '');
      }
      return html;
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), htmlTransformPlugin(), clientHtmlPlugin()],
  server: {
    fs: {
      strict: false
    },
    proxy: {
      '/api/admin-board-api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
