/* eslint-env node */
/**
 * QR 체크인 서명 유틸 — 매장 QR/숫자코드는 전부 여기서만 만든다.
 *
 * 시크릿(QR_CHECKIN_SECRET)이 없으면 빈 문자열을 돌려준다(fail-closed):
 * 프론트는 storeSignature 가 비면 QR UI 자체를 숨기므로, 시크릿 없이 만든
 * 가짜 서명이 세상에 배포되는 사고를 원천 차단한다. ('fallback' 같은
 * 기본 시크릿을 두면 env 등록 전 발급된 QR이 전부 무효화되는 함정이 있었다.)
 */
import crypto from 'crypto';

const SECRET = process.env.QR_CHECKIN_SECRET || '';

/** QR URL 서명 — /checkin?s=<storeId>&t=<sig> 의 t */
export function storeSig(storeId) {
  if (!SECRET || !storeId) return '';
  return crypto.createHmac('sha256', SECRET).update(String(storeId)).digest('hex').slice(0, 24);
}

/**
 * 숫자 백업 코드 6자리 — QR을 못 읽는 환경(모니터 모아레·구형 폰)에서
 * 제출 페이지에 직접 입력하는 용도. 129개 매장 기준 충돌 확률 ~1% 미만이며
 * 서버가 충돌을 감지하면 QR 사용을 안내한다(checkin.js).
 */
export function storeCode6(storeId) {
  if (!SECRET || !storeId) return '';
  const hex = crypto.createHmac('sha256', SECRET).update(`code:${storeId}`).digest('hex').slice(0, 12);
  return String(parseInt(hex, 16) % 1000000).padStart(6, '0');
}
