import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel 환경 변수에서 VITE_REPORT_MODE 가 'true'인지 확인
const isReportMode = process.env.VITE_REPORT_MODE === 'true';

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
          .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
      }
      return html;
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), htmlTransformPlugin()],
  server: {
    fs: {
      strict: false
    }
  }
})
