/* eslint-env node */
/**
 * 기자단 링크 대량등록 — 담당자 입구 (/staff/press).
 * 본체(추출·판정·등록)는 _press.js. 여기는 게이트만 — _staff-auth.js
 * (담당자 개인키·공용키, 관리자 키도 상위 호환 통과. 실패 시 404 은폐).
 *
 * 담당자에게 여는 근거: 쓰는 곳이 진행_DB_OLD 기자 레코드뿐이고(예약입력_DB·예약봇 경로와 무관),
 * 내려주는 값도 계약월·기자 목표/실적까지라 진도 보드가 이미 보여주는 범위다.
 * 등록 태그에 개인 ID 가 남는다 — 개인키(STAFF_KEYS)로 들어온 경우에만 사람 구분이 된다.
 */

import { staffIdentity } from './_staff-auth.js';
import { pressHandler } from './_press.js';

export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  await pressHandler(req, res, who);
}
