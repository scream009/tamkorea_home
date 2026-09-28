import React from 'react';
import PressBulk from '../components/PressBulk';
import { staffHeaders } from '../lib/staffKey';

/**
 * 기자단 링크 대량등록 — 담당자 입구 (/staff/press). 화면·판정은 PressBulk·api/_press.js 공용.
 * 진입: 상단 메뉴 '진행관리 › ＋ 기자단 등록', 또는 진도 보드 칸의 '＋링크'(?c=계약ID 로 고객사·월이 골라진 채 열림).
 */
export default function StaffPressPage() {
  return <PressBulk apiPath="/api/staff-press" headers={staffHeaders} variant="staff" />;
}
