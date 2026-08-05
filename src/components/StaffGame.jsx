import React, { useState, useEffect, useRef, useCallback } from 'react';
import { staffHeaders } from '../lib/staffKey';
import CatchGame from '../lib/catchGame';
import './StaffGame.css';

/**
 * 「인플 캐치!」 — /staff 맨 아래 스태프 아케이드 (Owner 발주 2026-08-06).
 *
 * 섭외 실무의 고통(먹튀·노쇼·지각·업로드 잠수)을 유쾌하게 형상화한 캐치 게임.
 * 접힌 배너가 기본 — 업무 화면을 침범하지 않는다. Esc = 보스키(즉시 접힘).
 *
 * 점수는 /api/staff-game 로 저장한다. 키가 곧 신원(HH/LH/AN…)이라
 * 리더보드 ID 를 따로 물어볼 필요가 없다. 서버가 죽어 있어도 게임은 되고,
 * 그 경우 최고점만 이 브라우저(localStorage)에 남긴다.
 */

const LB_KEY = 'tk_catch_local_best';
const SND_KEY = 'tk_game_snd';

const LEGEND = [
  { e: '🤳', name: '참한 인플', desc: '+100' },
  { e: '🎬', name: '영상장인', desc: '+150' },
  { e: '👑', name: '대형 인플', desc: '+500 · 잭팟 연출!' },
  { e: '🧧', name: '홍바오', desc: '+88 · 红包雨' },
  { e: '⏰', name: '지각 인플', desc: '+30 (그래도 왔다)' },
  { e: '😵', name: '길 잃은 인플', desc: '+120 · 갈지자로 헤맨다' },
  { e: '🏃', name: '딴 지점 인플', desc: '+130 · 중간에 순간이동' },
  { e: '☕', name: '커피', desc: '하트 +1' },
  { e: '😈', name: '먹튀', desc: '잡기 직전 본색! 하트 -1' },
  { e: '👻', name: '노쇼', desc: '하트 -1 · 흔들리며 낙하' },
];

function comma(n) { return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function localBest() {
  try { return Number(localStorage.getItem(LB_KEY)) || 0; } catch { return 0; }
}

export default function StaffGame() {
  const [open, setOpen] = useState(false);
  const [ui, setUi] = useState('idle');        // idle | run | over
  const [snd, setSnd] = useState(() => {
    try { return localStorage.getItem(SND_KEY) === '1'; } catch { return false; }
  });
  const [lb, setLb] = useState(null);          // { who, top, best } | null
  const [lbErr, setLbErr] = useState(false);
  const [result, setResult] = useState(null);  // { score, stats, rank, newBest, saved }
  const [buddy, setBuddy] = useState(null);     // 동료 위챗 알림 카드 { key,name,tag,avatar,line,buff,color }
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const bestRef = useRef(0);
  const buddyTimerRef = useRef(null);

  const loadLb = useCallback(async () => {
    try {
      const res = await fetch('/api/staff-game', { headers: staffHeaders() });
      if (!res.ok) throw new Error();
      const body = await res.json();
      setLb(body);
      setLbErr(false);
      const best = Math.max(body.best?.score || 0, localBest());
      bestRef.current = best;
      engineRef.current?.setHighScore(best);
    } catch {
      setLbErr(true);
      bestRef.current = localBest();
      engineRef.current?.setHighScore(bestRef.current);
    }
  }, []);

  const submit = useCallback(async (score, stats) => {
    let saved = false; let rank = null; let newBest = false;
    if (score > 0) {
      try {
        const res = await fetch('/api/staff-game', {
          method: 'POST',
          headers: staffHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ score }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) { saved = true; rank = body.rank; newBest = body.newBest; }
      } catch { /* 서버 없이도 게임은 계속 */ }
      try {
        if (score > localBest()) localStorage.setItem(LB_KEY, String(score));
      } catch { /* noop */ }
    }
    setResult({ score, stats, rank, newBest, saved });
    if (saved) loadLb();
  }, [loadLb]);
  const submitRef = useRef(submit);
  submitRef.current = submit;

  /* 엔진 수명 — 펼친 동안만 산다 */
  useEffect(() => {
    if (!open || !canvasRef.current) return undefined;
    const engine = new CatchGame(canvasRef.current, {
      onOver: (score, stats) => {
        setUi('over');
        submitRef.current(score, stats);
      },
      onBuddy: (b) => {
        clearTimeout(buddyTimerRef.current);
        setBuddy(b);
        buddyTimerRef.current = setTimeout(() => setBuddy(null), 3400);
      },
      highScore: bestRef.current,
    });
    engine.setMuted(!snd);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      clearTimeout(buddyTimerRef.current);
      setBuddy(null);
    };
    // snd 는 아래 별도 effect 로 반영 — 토글마다 엔진을 다시 만들지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { engineRef.current?.setMuted(!snd); }, [snd]);
  useEffect(() => { if (open) loadLb(); }, [open, loadLb]);

  /* Space = 시작/재시작 · Esc = 보스키 */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); setUi('idle'); return; }
      if (e.code === 'Space' && ui !== 'run') {
        e.preventDefault();
        setResult(null);
        setUi('run');
        engineRef.current?.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ui]);

  const start = () => {
    setResult(null);
    setUi('run');
    engineRef.current?.start();
  };
  const toggleSnd = () => {
    setSnd((v) => {
      try { localStorage.setItem(SND_KEY, v ? '0' : '1'); } catch { /* noop */ }
      return !v;
    });
  };

  /* ── 접힌 배너 ── */
  if (!open) {
    return (
      <div className="sgm-banner" role="button" tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpen(true); }}>
        <span className="sgm-banner-icon">🎮</span>
        <div className="sgm-banner-txt">
          <b>인플 캐치!</b>
          <span>오늘도 고생한 당신… 한 판 어때요? 먹튀는 게임에서라도 응징합시다</span>
        </div>
        <span className="sgm-banner-go">PLAY ▸</span>
      </div>
    );
  }

  const myBest = Math.max(lb?.best?.score || 0, localBest());

  return (
    <div className="sgm-root">
      <div className="sgm-head">
        <span className="sgm-title">🎮 인플 캐치! <i>staff arcade</i></span>
        {lb?.who && <span className="sgm-who">{lb.who}</span>}
        <div className="sgm-head-btns">
          <button type="button" className="sgm-ghost" onClick={toggleSnd}
            title={snd ? '효과음 끄기' : '효과음 켜기 (사무실 주의)'}>
            {snd ? '🔊' : '🔇'}
          </button>
          <button type="button" className="sgm-ghost sgm-boss"
            onClick={() => { setOpen(false); setUi('idle'); }}
            title="즉시 접기 — 게임하다 들키기 전에 (Esc)">
            ⚡ 보스키 <i>Esc</i>
          </button>
        </div>
      </div>

      <div className="sgm-body">
        <div className="sgm-stage">
          <canvas ref={canvasRef} className="sgm-canvas" />

          {buddy && (
            <div className="sgm-buddy" style={{ '--bc': buddy.color }} key={buddy.key + buddy.line}>
              <span className="sgm-buddy-av">{buddy.avatar}</span>
              <div className="sgm-buddy-txt">
                <b>{buddy.name} <i>{buddy.tag}</i></b>
                <span>{buddy.line}</span>
                <em>✨ {buddy.buff}</em>
              </div>
            </div>
          )}

          {ui === 'idle' && (
            <div className="sgm-overlay">
              <h3>하늘에서 인플루언서가 내려온다!</h3>
              <p className="sgm-sub">착한 인플만 골라 담으세요. <b>먹튀는 중간에 본색을 드러냅니다.</b></p>
              <div className="sgm-legend">
                {LEGEND.map((l) => (
                  <div key={l.name} className="sgm-lg">
                    <span className="sgm-lg-e">{l.e}</span>
                    <span className="sgm-lg-n">{l.name}</span>
                    <span className="sgm-lg-d">{l.desc}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="sgm-start" onClick={start}>게임 시작 (Space)</button>
              <p className="sgm-ctl">← → 또는 마우스·터치로 이동 · 5연속 캐치마다 점수 배수 UP</p>
              <p className="sgm-ctl">가끔 동료(HH·LH·AN·QN·GG) 위챗 알림이 뜨면 버프 찬스! 👑 대형 인플은 잭팟 연출</p>
            </div>
          )}

          {ui === 'over' && result && (
            <div className="sgm-overlay">
              <h3 className="sgm-over-t">😵 오늘 섭외 마감</h3>
              <div className="sgm-score">{comma(result.score)}<i>점</i></div>
              {result.newBest && <div className="sgm-newbest">🏆 개인 최고 기록 경신!</div>}
              {result.saved && result.rank != null && (
                <div className="sgm-rank">전체 <b>{result.rank}위</b>{result.rank === 1 ? ' — 섭외왕 등극! 👑' : ''}</div>
              )}
              {!result.saved && result.score > 0 && (
                <div className="sgm-rank sgm-rank-warn">랭킹 서버에 못 올렸어요 — 점수는 이 브라우저에만 저장</div>
              )}
              <div className="sgm-stats">
                <span>섭외 <b>{result.stats.caught}</b>명</span>
                <span>👑 <b>{result.stats.crowns}</b></span>
                <span>😈 당한 먹튀 <b>{result.stats.runners}</b></span>
                <span>👻 노쇼 <b>{result.stats.noshows}</b></span>
                <span>최대콤보 <b>{result.stats.maxCombo}</b></span>
                <span>생존 <b>{result.stats.time}</b>초</span>
              </div>
              <button type="button" className="sgm-start" onClick={start}>다시 하기 (Space)</button>
            </div>
          )}
        </div>

        <aside className="sgm-side">
          <div className="sgm-side-h">
            🏆 명예의 전당
            <button type="button" className="sgm-ghost" onClick={loadLb} title="새로고침">⟳</button>
          </div>
          {lbErr && (
            <div className="sgm-lb-err">랭킹 서버 연결 실패 — 게임은 계속할 수 있어요</div>
          )}
          {!lbErr && lb && lb.top.length === 0 && (
            <div className="sgm-lb-empty">아직 기록이 없습니다.<br />첫 섭외왕이 되어보세요!</div>
          )}
          {!lbErr && lb && lb.top.length > 0 && (
            <ol className="sgm-lb">
              {lb.top.map((r, i) => (
                <li key={`${r.id}-${i}`} className={lb.who === r.id ? 'me' : ''}>
                  <span className={`sgm-lb-rank r${i + 1}`}>{i + 1}</span>
                  <span className="sgm-lb-id">{r.id}</span>
                  <b className="sgm-lb-score">{comma(r.score)}</b>
                  <span className="sgm-lb-date">{r.at?.slice(5)}</span>
                </li>
              ))}
            </ol>
          )}
          {myBest > 0 && (
            <div className="sgm-mybest">내 최고 기록 <b>{comma(myBest)}</b></div>
          )}
        </aside>
      </div>
    </div>
  );
}
