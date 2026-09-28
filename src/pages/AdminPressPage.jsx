import React from 'react';
import PressBulk from '../components/PressBulk';
import { adminHeaders } from '../lib/adminKey';

/** 기자단 링크 대량등록 — 관리자 입구 (/admin/press). 화면·판정은 PressBulk·api/_press.js 공용. */
export default function AdminPressPage() {
  return <PressBulk apiPath="/api/admin-press" headers={adminHeaders} />;
}
