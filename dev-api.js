/* eslint-env node */
/**
 * 로컬 미리보기용 API 서버 — 배포 전에 실제 화면을 확인하기 위한 것.
 *
 * 왜 필요한가
 *   vite dev 는 /api/* 를 서빙하지 않는다(Vercel 함수는 배포돼야 돈다).
 *   그래서 화면 변경을 확인하려면 매번 배포해야 했고, 잘못 만들면 고객 화면에
 *   그대로 나갔다. 이 서버는 **배포될 그 핸들러 파일 자체**를 불러 쓰므로,
 *   여기서 본 화면이 배포 후 화면과 같다.
 *
 * 사용: node dev-api.js        (3001 포트)
 *       vite.config.js 의 proxy 가 /api → 3001 로 넘긴다.
 */
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// .env.local 은 프론트용 VITE_ 접두를 쓴다 — 서버 핸들러가 찾는 이름으로 옮겨 준다
if (!process.env.TAMLINK_API_KEY && process.env.VITE_AT_TOKEN) {
  process.env.TAMLINK_API_KEY = process.env.VITE_AT_TOKEN;
}

const app = express();
app.use(express.json());

// api/ 의 핸들러를 전부 자동 등록한다 (밑줄로 시작하는 공용 모듈 제외).
// 예전엔 이름을 손으로 나열해서 새 API(admin-targets 등)가 로컬에서 404 였다 —
// 배포 전 확인이 목적인 서버가 최신 화면을 못 띄우는 구조라 폴더 스캔으로 바꿨다(2026-08-13).
import fs from 'fs';
const ROUTES = fs.readdirSync(path.resolve(process.cwd(), 'api'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
  .map((f) => f.replace(/\.js$/, ''));
console.log(`API ${ROUTES.length}개 등록: ${ROUTES.join(', ')}`);
for (const name of ROUTES) {
  app.all(`/api/${name}`, async (req, res) => {
    try {
      const mod = await import(`./api/${name}.js?t=${Date.now()}`);  // 매 요청 새로 읽어 수정이 바로 반영
      await mod.default(req, res);
    } catch (err) {
      console.error(`[${name}]`, err);
      res.status(500).json({ error: String(err && err.message || err) });
    }
  });
}

app.listen(3001, () => console.log('로컬 API 서버 : http://localhost:3001/api/client-schedule'));
