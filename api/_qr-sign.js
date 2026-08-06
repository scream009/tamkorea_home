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

// (v1.6) 숫자 코드 경로는 폐기 — Owner 지시 "무조건 QR로 모든 것" (스펙 v1.6 참조).
// 토큰 없는 폰도 QR 스캔 → 오늘 예약 명단에서 본인 선택으로 해결한다.
