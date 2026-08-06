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
 * 숫자 백업 코드 6자리 — **매일 자동 변경** (KST 날짜 스코프).
 *
 * QR을 못 읽는 환경에서 제출 페이지에 입력하는 도착 증명 수단.
 * 고정 코드는 한 번 새면 영구 무력화되므로 날짜를 HMAC에 넣어 회전시킨다 —
 * 매장 화면(/schedule)에 게시된 "오늘 코드"를 직접 봐야만 입력할 수 있다.
 * dayOffset -1 = 어제 코드 (자정 넘김·매장 화면 미갱신 대비, 서버는 오늘+어제만 수용).
 */
export function storeCodeDaily(storeId, dayOffset = 0) {
  if (!SECRET || !storeId) return '';
  const kst = new Date(Date.now() + 9 * 3600 * 1000 + dayOffset * 86400 * 1000);
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');
  const hex = crypto.createHmac('sha256', SECRET).update(`code:${storeId}:${ymd}`).digest('hex').slice(0, 12);
  return String(parseInt(hex, 16) % 1000000).padStart(6, '0');
}
