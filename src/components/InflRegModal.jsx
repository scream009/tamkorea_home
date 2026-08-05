import React, { useState } from 'react';
import { staffHeaders } from '../lib/staffKey';

/**
 * 신규 인플 등록 모달 — 예약입력 폼과 인플 보드(+메인 메뉴)에서 공용.
 * Softr ④신규인플 폼과 같은 대상(INFL_DB). XHS_ID 중복이면
 * "입력한 값으로 기존 수정 + 선택" / "그대로 선택만" 분기.
 *
 * 스타일은 StaffResvPage.css 의 srv-* 클래스를 쓴다 — 번들이 단일이라 어디서든 로드돼 있다.
 */
const INFL_TYPES = ['체험단', '인플'];

export default function InflRegModal({ mgrs, defaultMgr, onClose, onCreated, onPickExisting }) {
  const [xid, setXid] = useState('');
  const [link, setLink] = useState('');
  const [pal, setPal] = useState('');
  const [mgr, setMgr] = useState(defaultMgr || '');
  const [type, setType] = useState('체험단');
  const [wc, setWc] = useState('');
  const [phone, setPhone] = useState('');
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dupId, setDupId] = useState('');

  const can = xid.trim() && /^https?:\/\//.test(link.trim()) && Number(pal) > 0 && mgr;

  async function submit() {
    setBusy(true);
    setErr('');
    setDupId('');
    try {
      const res = await fetch('/api/staff-resv', {
        method: 'POST',
        headers: staffHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'createInfl', xid, link, pal, mgr, type, wc, phone, nick }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.dupId) setDupId(body.dupId);
        throw new Error(body.error || `등록 실패 (${res.status})`);
      }
      onCreated(body.infl);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  /* 중복 인플 — 입력한 값으로 기존 레코드를 수정하고 선택 */
  async function updateExisting() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/staff-resv', {
        method: 'POST',
        headers: staffHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'updateInfl', id: dupId, link, pal, mgr, type, wc, phone, nick }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `수정 실패 (${res.status})`);
      onCreated(body.infl);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="srv-overlay" onClick={onClose}>
      <div className="srv-modal" onClick={(e) => e.stopPropagation()}>
        <h3>＋ 신규 인플 등록</h3>
        <p className="srv-modal-sub">INFL_DB 에 바로 등록됩니다.</p>

        <label>小红书账号 (XHS_ID) <b className="rq">*</b></label>
        <input value={xid} onChange={(e) => setXid(e.target.value)} autoFocus />

        <label>小红书链接 <b className="rq">*</b></label>
        <input value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />

        <div className="srv-modal-row">
          <div>
            <label>小红书粉丝 (팔로워) <b className="rq">*</b></label>
            <input type="number" min="1" value={pal} onChange={(e) => setPal(e.target.value)} />
          </div>
          <div>
            <label>섭외_ID <b className="rq">*</b></label>
            <div className="srv-seg srv-seg-sm">
              {mgrs.map((m) => (
                <button key={m} type="button" className={mgr === m ? 'on' : ''} onClick={() => setMgr(m)}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="srv-modal-row">
          <div>
            <label>유형</label>
            <div className="srv-seg srv-seg-sm">
              {INFL_TYPES.map((t) => (
                <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label>预约微信 (WC_ID) <span className="srv-hint">(선택)</span></label>
            <input value={wc} onChange={(e) => setWc(e.target.value)} />
          </div>
        </div>

        <div className="srv-modal-row">
          <div>
            <label>연락처 <span className="srv-hint">(선택)</span></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label>닉네임 <span className="srv-hint">(선택)</span></label>
            <input value={nick} onChange={(e) => setNick(e.target.value)} />
          </div>
        </div>

        {err && (
          <div className="srv-error">
            {err}
            {dupId && (
              <div className="srv-dup-btns">
                <button type="button" className="srv-ghost srv-dup" disabled={busy} onClick={updateExisting}>
                  ✏️ 입력한 값으로 기존 정보 수정 + 선택
                </button>
                <button type="button" className="srv-ghost srv-dup" disabled={busy} onClick={() => onPickExisting(dupId)}>
                  그대로 선택만
                </button>
              </div>
            )}
          </div>
        )}

        <div className="srv-modal-btns">
          <button type="button" className="srv-primary" disabled={!can || busy} onClick={submit}>
            {busy ? '등록 중…' : '등록'}
          </button>
          <button type="button" className="srv-ghost" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
