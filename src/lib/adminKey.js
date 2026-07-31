/**
 * 관리자 키 보관·전송 공통 모듈.
 *
 * AdminClientLinkPage 가 쓰던 방식(sessionStorage + x-admin-key)을 그대로 따른다.
 * 탭을 닫으면 사라지는 게 의도다 — 공용 PC 에서 키가 남지 않는다.
 * localStorage 로 바꾸지 말 것.
 */

export const KEY_STORAGE = 'tamkorea_admin_key';

export function getAdminKey() {
  try { return sessionStorage.getItem(KEY_STORAGE) || ''; }
  catch { return ''; }   // 시크릿 모드 등에서 sessionStorage 가 막힐 수 있다
}

export function setAdminKey(key) {
  try { sessionStorage.setItem(KEY_STORAGE, key); } catch { /* 저장 실패해도 이번 세션은 동작 */ }
}

export function clearAdminKey() {
  try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* noop */ }
}

/** fetch 옵션에 펼쳐 쓰는 헤더. 키가 없으면 빈 객체 — 서버가 404 로 돌려준다. */
export function adminHeaders(extra) {
  const key = getAdminKey();
  return { ...(key ? { 'x-admin-key': key } : {}), ...(extra || {}) };
}
