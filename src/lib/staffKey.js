/**
 * 담당자 키 보관·전송 공통 모듈 — adminKey.js 의 담당자판.
 *
 * 기본은 sessionStorage(탭 닫으면 소멸 — 공용 PC 에 키가 안 남는다).
 * '이 기기에 키 저장'(Owner 요청 2026-08-20)을 켠 경우에만 localStorage 에도 남긴다 —
 * 사파리 홈화면 바로가기·위챗 인앱은 크롬 비밀번호 관리자가 없어 매번 키를
 * 복사해 와야 했다. 로그아웃은 두 저장소를 모두 지운다.
 *
 * Softr 임베드 경로: iframe URL 에 ?k=<키> 를 붙이면 StaffGate 가
 * 검증 후 sessionStorage 로 옮기고 주소창에서 지운다.
 */

export const STAFF_KEY_STORAGE = 'tamkorea_staff_key';

export function getStaffKey() {
  try {
    const s = sessionStorage.getItem(STAFF_KEY_STORAGE);
    if (s) return s;
    const l = localStorage.getItem(STAFF_KEY_STORAGE) || '';
    if (l) sessionStorage.setItem(STAFF_KEY_STORAGE, l);   // 세션으로 복원
    return l;
  } catch { return ''; }   // 시크릿 모드 등에서 storage 가 막힐 수 있다
}

export function setStaffKey(key, remember) {
  try {
    sessionStorage.setItem(STAFF_KEY_STORAGE, key);
    if (remember) localStorage.setItem(STAFF_KEY_STORAGE, key);
  } catch { /* 저장 실패해도 이번 세션은 동작 */ }
}

export function clearStaffKey() {
  try { sessionStorage.removeItem(STAFF_KEY_STORAGE); } catch { /* noop */ }
  try { localStorage.removeItem(STAFF_KEY_STORAGE); } catch { /* noop */ }
}

/** fetch 옵션에 펼쳐 쓰는 헤더. 키가 없으면 빈 객체 — 서버가 404 로 돌려준다. */
export function staffHeaders(extra) {
  const key = getStaffKey();
  return { ...(key ? { 'x-staff-key': key } : {}), ...(extra || {}) };
}
