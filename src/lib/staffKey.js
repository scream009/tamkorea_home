/**
 * 담당자 키 보관·전송 공통 모듈 — adminKey.js 의 담당자판.
 *
 * sessionStorage + x-staff-key. 탭을 닫으면 사라지는 게 의도다.
 * localStorage 로 바꾸지 말 것 (공용 PC 에 키가 남는다).
 *
 * Softr 임베드 경로: iframe URL 에 ?k=<키> 를 붙이면 StaffGate 가
 * 검증 후 sessionStorage 로 옮기고 주소창에서 지운다.
 */

export const STAFF_KEY_STORAGE = 'tamkorea_staff_key';

export function getStaffKey() {
  try { return sessionStorage.getItem(STAFF_KEY_STORAGE) || ''; }
  catch { return ''; }   // 시크릿 모드 등에서 sessionStorage 가 막힐 수 있다
}

export function setStaffKey(key) {
  try { sessionStorage.setItem(STAFF_KEY_STORAGE, key); } catch { /* 저장 실패해도 이번 세션은 동작 */ }
}

export function clearStaffKey() {
  try { sessionStorage.removeItem(STAFF_KEY_STORAGE); } catch { /* noop */ }
}

/** fetch 옵션에 펼쳐 쓰는 헤더. 키가 없으면 빈 객체 — 서버가 404 로 돌려준다. */
export function staffHeaders(extra) {
  const key = getStaffKey();
  return { ...(key ? { 'x-staff-key': key } : {}), ...(extra || {}) };
}
