/**
 * 관리자 키 보관·전송 공통 모듈.
 *
 * 기본은 sessionStorage(탭 닫으면 소멸 — 공용 PC 에 키가 안 남는다).
 * '이 기기에 키 저장'(Owner 요청 2026-08-20)을 켠 경우에만 localStorage 에도 남긴다.
 * 로그아웃은 두 저장소를 모두 지운다. 상세 이유는 staffKey.js 주석 참고.
 */

export const KEY_STORAGE = 'tamkorea_admin_key';

export function getAdminKey() {
  try {
    const s = sessionStorage.getItem(KEY_STORAGE);
    if (s) return s;
    const l = localStorage.getItem(KEY_STORAGE) || '';
    if (l) sessionStorage.setItem(KEY_STORAGE, l);   // 세션으로 복원
    return l;
  } catch { return ''; }   // 시크릿 모드 등에서 storage 가 막힐 수 있다
}

export function setAdminKey(key, remember) {
  try {
    sessionStorage.setItem(KEY_STORAGE, key);
    if (remember) localStorage.setItem(KEY_STORAGE, key);
  } catch { /* 저장 실패해도 이번 세션은 동작 */ }
}

export function clearAdminKey() {
  try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* noop */ }
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* noop */ }
}

/** fetch 옵션에 펼쳐 쓰는 헤더. 키가 없으면 빈 객체 — 서버가 404 로 돌려준다. */
export function adminHeaders(extra) {
  const key = getAdminKey();
  return { ...(key ? { 'x-admin-key': key } : {}), ...(extra || {}) };
}
