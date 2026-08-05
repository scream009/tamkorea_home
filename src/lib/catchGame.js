/**
 * 「인플 캐치!」 게임 엔진 — /staff 하단 스태프 아케이드.
 *
 * 섭외자(보라 캐릭터)를 좌우로 움직여 하늘에서 내려오는 인플루언서를 잡는다.
 * 실무의 고통을 그대로 옮겼다:
 *   - 😈 먹튀는 착한 인플(🤳)로 위장하다가 **캐치 직전**에 본색을 드러낸다(놀람 연출)
 *   - 👻 노쇼는 좌우로 흔들리며 떨어져 피하기 어렵다 (예측 불가가 컨셉)
 *   - 😵 길 잃은 인플은 갈지자로 헤매고, 🏃 딴 지점 인플은 중간에 순간이동한다
 *   - 👑 대형 인플을 잡으면 잭팟 연출(컨페티+배너), 🧧 는 红包雨
 *   - 15~25초마다 동료(HH·LH·AN·QN·GG) 위챗 알림이 떠서 버프를 준다
 *   - 배경에는 "사장님이 통역까지 불러놓고 대기 중" 류의 시나리오 멘트가 흐른다
 *   - 놓친 착한 인플은 경쟁사가 데려간다 (콤보 리셋)
 *
 * 중독 공식(조사 반영): 원축 조작 + 짧은 라운드 + 즉시 재시작(Dino/Flappy),
 * 희귀 보상(👑🧧☕ = 가변 보상), 콤보 배수, 시간 비례 난이도.
 * 게임 주스: 파티클·화면흔들림·히트스톱·플로팅 점수·squash/stretch·시선 추적·이지백 팝.
 *
 * React 와의 경계: 엔진은 캔버스 안만 그린다. 시작/게임오버 오버레이와 리더보드,
 * 동료 위챗 카드(DOM)는 컴포넌트(StaffGame.jsx) 몫이다. onOver·onBuddy 로 알린다.
 */

const TAU = Math.PI * 2;
const H = 430;                 // 논리 높이 고정 — 폭만 컨테이너를 따른다
const GROUND = 34;             // 바닥 바 높이
const CATCH_Y = H - GROUND - 46;
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const SANS = '"Pretendard","Malgun Gothic",system-ui,sans-serif';

/* ── 아이템 정의 ─────────────────────────────────────────── */
const TYPES = {
  selfie: { emoji: '🤳', pts: 100, kind: 'good', ring: '#A78BFA' },
  video:  { emoji: '🎬', pts: 150, kind: 'good', ring: '#60A5FA' },
  late:   { emoji: '⏰', pts: 30,  kind: 'good', ring: '#FBBF24' },
  crown:  { emoji: '👑', pts: 500, kind: 'good', ring: '#F59E0B', fast: 1.55, r: 24 },
  coffee: { emoji: '☕', pts: 0,   kind: 'bonus', ring: '#34D399', slow: 0.8 },
  hong:   { emoji: '🧧', pts: 88,  kind: 'good', ring: '#EF4444', slow: 0.9 },              // 잡으면 红包雨!!
  lost:   { emoji: '😵', pts: 120, kind: 'good', ring: '#38BDF8', wander: 1, slow: 0.85 },  // 길을 못 찾는다
  branch: { emoji: '🏃', pts: 130, kind: 'good', ring: '#FB923C', tele: 1 },                // 다른 지점으로 순간이동
  runner: { emoji: '😈', pts: -150, kind: 'bad', ring: '#F87171', disguise: '🤳' },
  noshow: { emoji: '👻', pts: 0,   kind: 'bad', ring: '#F87171', sway: 1 },
};

function spawnTable(level, lucky) {
  const bad = Math.min(level - 1, 6);        // 레벨이 오를수록 세상이 험해진다
  const lk = lucky ? 4 : 1;                  // 好运 버프 — 희귀템 확률 UP
  return [
    ['selfie', 28], ['video', 13], ['late', 8], ['lost', 6], ['branch', 5],
    ['crown', 3.5 * lk], ['coffee', 3 * lk], ['hong', 1.8 * lk],
    ['runner', 7 + bad * 1.6], ['noshow', 7 + bad * 1.2],
  ];
}
function pickType(level, lucky) {
  const tbl = spawnTable(level, lucky);
  let sum = 0;
  for (const [, w] of tbl) sum += w;
  let roll = Math.random() * sum;
  for (const [name, w] of tbl) { roll -= w; if (roll <= 0) return name; }
  return 'selfie';
}

/* ── 이벤트 문구 — 매번 다른 말이 나와야 안 질린다. 트렌디 중국어 섞음 ── */
const MSG = {
  runner: ['먹튀 발생!! 위챗 차단 완료 😤', '제공만 받고 잠수… 또 당했다', '"영상은요?" …읽씹당했다 💔',
    '먹튀범 프로필까지 삭제됐다', '跑单了! (먹튀닝겐 발생) 프로필도 지웠다 😤', '已读不回… 결국 위챗 차단 완료'],
  noshow: ['노쇼… 사장님께 뭐라고 하지 😭', '예약시간에 안 나타났다', '말도 없이 일찍 가버렸다',
    '전화도 안 받는다…', '人跑了 (사람이 사라졌다)… 노쇼 확정 👻'],
  crown: ['대형 인플 섭외!! 오늘 회식 각 🎉', '팔로워 50만!! 사장님 함박웃음', 'VIP 섭외 성공! 월목표 클리어급',
    '哇塞!! 대형 인플 섭외 — 绝绝子 ✨', '恭喜发财 🧧 오늘 매출 UP 각'],
  coffee: ['커피 수혈 완료 ☕ 기운이 났다!', '동료가 사준 커피… 눈물난다 ☕'],
  late: ['늦었지만… 왔으니 됐다 ⏰', '1시간 지각. 그래도 왔다'],
  hong: ['🧧 红包雨!! 오늘 운수 대통', '红包 받았다 — 팀 회식 기금 적립 💰'],
  lost: ['간신히 길 찾아줬다 🧭', '지도 보내줬다… 그래도 왔다 😮‍💨', '헤매다 헤매다 결국 도착 😵‍💫'],
  branch: ['3호점 갔다가 부랴부랴 옴 🏃💦', '지점 헷갈렸다더니 결국 왔다', '딴 매장 갔다가 겨우 귀환 🏃'],
  miss: ['앗, 경쟁사에 뺏겼다! 😱', '놓쳤다… 다른 에이전시로 갔다', 'DM 보냈는데 늦었다…'],
  lostMiss: ['결국 길을 잃고 사라졌다… 😭', '헤매다가 포기했다… 😔'],
  dodge: ['휴, 잘 걸렀다 😮‍💨', '촉이 왔다. 거르길 잘했다'],
};
const COMBO_MSG = ['연속 섭외!', '섭외 물올랐다!!', '섭외의 신 강림 ✨', '위챗이 불탄다!!!', '666666 콤보 미쳤다', 'yyds 섭외의 신 강림'];
/** 배경 시나리오 멘트 — 캐치와 무관하게 주기적으로 흐른다 (실무 애환 그대로) */
const SCENARIO = [
  '사장님이 통역까지 불러놓고 대기 중… 위챗은 진동벨 수준 📳',
  '남친 카톡 씹었다고 삐짐ㅠㅠ 지금 그럴 때가 아닌데…',
  '와 이런 애도 인플이라고? 내가 찍어도 이거보단 낫겠다 🤳',
  '已读不回… (읽씹) 3시간째 감감무소식 😤',
  '老板娘 눈빛이 무섭다… 오늘 안에 섭외 각 나와야 하는데',
  '别拖了! (그만 좀 끌어!) 사장님 발 동동 구르는 중',
  '위챗 메시지 100개… 하나도 답이 없다 📵',
];
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** 동료 위챗 알림 — 위챗 프로필의 페르소나를 재미있게 응용(실명·사진 그대로 쓰지 않음) */
const BUDDIES = [
  { key: 'HH', name: '엘레인', tag: '🌸 만년 통화중', avatar: '🐻',
    line: '언니 나 지금 콜 중이라ㅠㅠ 대신 좀 캐치해줘! 📞', buff: '콜찬스 · 캐치범위 UP', color: '#F9A8D4' },
  { key: 'LH', name: '해피맘', tag: '💐 행복충전소', avatar: '💐',
    line: '오늘도 행복하게 가자~ 🌷 부케 부적 충전!', buff: '부케 부적 · 하트·보너스', color: '#F472B6' },
  { key: 'AN', name: '프리지아', tag: '🍀 好运 RADIANT', avatar: '🍀',
    line: '오늘 운세 대박이래! 好运 타임 발동 ✨', buff: '好运 타임 · 희귀템 UP', color: '#34D399' },
  { key: 'QN', name: '金姐(사장님)', tag: '🕶️ 오늘도 대기중', avatar: '🕶️',
    line: '이번엔 대형 인플 좀 잡아와~ 💕 (보너스 걸었다)', buff: '사장님 보너스 · 점수 UP', color: '#FDE68A' },
  { key: 'GG', name: 'Andy 이사', tag: '😎 직접 출동', avatar: '😎',
    line: '다들 오늘도 고생 많다! 내가 지원 간다 🕶️', buff: '이사님 서포트 · 캐치 보너스', color: '#93C5FD' },
];

/* ── 미니 신디사이저 — 에셋 없이 효과음. 기본은 무음 ── */
class Synth {
  constructor() { this.ac = null; this.muted = true; }
  ensure() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { this.ac = null; }
    }
    if (this.ac?.state === 'suspended') this.ac.resume().catch(() => {});
  }
  beep(freq, dur = 0.08, type = 'square', gain = 0.04, slide = 0) {
    if (this.muted || !this.ac) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  catch_() { this.beep(660, 0.07, 'square', 0.035, 220); }
  crown() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.05), i * 65)); }
  bad() { this.beep(200, 0.22, 'sawtooth', 0.05, -120); }
  coffee() { this.beep(880, 0.1, 'sine', 0.05, 160); }
  levelup() { [440, 587, 880].forEach((f, i) => setTimeout(() => this.beep(f, 0.08, 'triangle', 0.04), i * 60)); }
  buddy() { [740, 988].forEach((f, i) => setTimeout(() => this.beep(f, 0.08, 'sine', 0.04), i * 90)); }
  over() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.beep(f, 0.25, 'triangle', 0.05), i * 180)); }
}

export default class CatchGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onOver:(score:number, stats:object)=>void, onScore?:(score:number)=>void,
   *           onBuddy?:(buddy:object)=>void, highScore?:number }} opts
   */
  constructor(canvas, opts) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.onOver = opts.onOver;
    this.onScore = opts.onScore || (() => {});
    this.onBuddy = opts.onBuddy || (() => {});
    this.highScore = opts.highScore || 0;
    this.synth = new Synth();

    this.state = 'idle';       // idle | run | over
    this.keys = { l: false, r: false };
    this.pointerX = null;
    this.last = 0;
    this.destroyed = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointer = this._onPointer.bind(this);
    this._loop = this._loop.bind(this);
    this._resize = this._resize.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('pointermove', this._onPointer);
    canvas.addEventListener('pointerdown', this._onPointer);
    this.ro = new ResizeObserver(this._resize);
    this.ro.observe(canvas.parentElement);

    this._resize();
    this._reset();
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.cv.removeEventListener('pointermove', this._onPointer);
    this.cv.removeEventListener('pointerdown', this._onPointer);
    this.ro.disconnect();
  }

  setMuted(m) { this.synth.muted = m; if (!m) this.synth.ensure(); }
  setHighScore(s) { this.highScore = Math.max(this.highScore, s || 0); }

  start() {
    this.synth.ensure();
    this._reset();
    this.state = 'run';
  }

  /* ── 내부 ─────────────────────────────────────────────── */

  _reset() {
    this.score = 0;
    this.hearts = 3;
    this.maxHearts = 4;
    this.combo = 0;
    this.t = 0;                 // 진행 시간(초)
    this.level = 1;
    this.spawnIn = 0.7;
    this.items = [];
    this.parts = [];            // 파티클
    this.rain = [];             // 코스메틱 비 (红包雨·컨페티) — 캐치 판정 없음
    this.floats = [];           // 플로팅 텍스트
    this.toast = null;          // { text, t }
    this.ticker = null;         // 배경 시나리오 멘트 { text, t }
    this.banner = null;         // 레벨업·잭팟 배너 { text, t, dur, kind }
    this.shake = 0;
    this.flash = null;          // { color, t }
    this.pause = 0;             // 히트스톱(초)
    this.px = this.w / 2;       // 캐릭터 x
    this.pvx = 0;
    this.squash = 0;
    this.overDelay = 0;
    this.buddyIn = 10 + Math.random() * 6;    // 첫 알림까지
    this.tickerIn = 5 + Math.random() * 4;    // 첫 시나리오 멘트까지
    this.buffWide = 0;          // HH — 캐치범위 확대
    this.buffLucky = 0;         // AN — 희귀템 확률 UP
    this.buffMult = 0;          // QN — 점수 배수 추가
    this.buffBonus = 0;         // GG — 캐치당 고정 보너스
    this.stats = { caught: 0, crowns: 0, runners: 0, noshows: 0, maxCombo: 0, time: 0 };
  }

  _resize() {
    const parent = this.cv.parentElement;
    if (!parent) return;
    const w = Math.max(300, Math.min(parent.clientWidth, 680));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.cv.width = w * dpr;
    this.cv.height = H * dpr;
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${H}px`;
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.px === undefined || this.px > w) this.px = w / 2;
  }

  _onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.keys.l = true;
      if (this.state === 'run') e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.keys.r = true;
      if (this.state === 'run') e.preventDefault();
    }
  }
  _onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.l = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.r = false;
  }
  _onPointer(e) {
    const rect = this.cv.getBoundingClientRect();
    this.pointerX = (e.clientX - rect.left);
  }

  _spawn() {
    const name = pickType(this.level, this.buffLucky > 0);
    const ty = TYPES[name];
    const r = ty.r || 20;
    const speed = (105 + 21 * (this.level - 1)) * (0.85 + Math.random() * 0.4)
      * (ty.fast || 1) * (ty.slow || 1);
    this.items.push({
      name, ty, r,
      x: r + 8 + Math.random() * (this.w - (r + 8) * 2),
      y: -r - 6,
      vy: speed,
      rot: (Math.random() - 0.5) * 0.5,
      vrot: (Math.random() - 0.5) * 1.6,
      swayP: Math.random() * TAU,
      revealed: !ty.disguise,
      // 먹튀는 캐치 라인 바로 위에서 본색을 드러낸다 — "잡기 직전" 놀람 연출
      revealY: CATCH_Y - (28 + Math.random() * 55),
      teleY: H * (0.22 + Math.random() * 0.28),
      teleported: false,
      popT: 0,
    });
  }

  _spawnRain(emoji, n) {
    for (let i = 0; i < n; i += 1) {
      this.rain.push({
        emoji,
        x: Math.random() * this.w,
        y: -20 - Math.random() * 140,
        vy: 90 + Math.random() * 80,
        vx: (Math.random() - 0.5) * 40,
        rot: Math.random() * TAU,
        vrot: (Math.random() - 0.5) * 3,
        t: 0,
        life: 1.3 + Math.random() * 0.6,
      });
    }
  }

  _burst(x, y, color, n = 12, spread = 220) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * TAU;
      const v = 40 + Math.random() * spread;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        r: 1.5 + Math.random() * 2.5, color,
        life: 0.5 + Math.random() * 0.4, t: 0,
      });
    }
  }
  _float(x, y, text, color, big = false) {
    this.floats.push({ x, y, text, color, big, t: 0 });
  }
  _toast(text) { this.toast = { text, t: 0 }; }

  _comboMult() { return Math.min(1 + Math.floor(this.combo / 5) * 0.5, 3); }

  /** 동료 위챗 알림 — 랜덤 1명이 버프를 주고 간다 */
  _fireBuddy() {
    const b = BUDDIES[Math.floor(Math.random() * BUDDIES.length)];
    switch (b.key) {
      case 'HH': this.buffWide = 4.5; break;
      case 'LH':
        if (this.hearts < this.maxHearts) { this.hearts += 1; }
        else { this.score += 80; this._float(this.px, H - GROUND - 70, '+80', '#F9A8D4'); }
        break;
      case 'AN': this.buffLucky = 5.5; break;
      case 'QN': this.buffMult = 5; break;
      case 'GG': this.buffBonus = 5; break;
      default: break;
    }
    this.synth.buddy();
    this.onBuddy(b);
  }

  _catch(it) {
    const { ty } = it;
    this.squash = 0.14;
    if (it.name === 'coffee') {
      if (this.hearts < this.maxHearts) {
        this.hearts += 1;
        this._toast(pick(MSG.coffee));
      } else {
        this.score += 50;
        this._float(it.x, it.y, '+50', '#34D399');
      }
      this._burst(it.x, it.y, '#34D399', 10);
      this.synth.coffee();
      return;
    }
    if (ty.kind === 'bad') {
      // 잡아버렸다 — 실무였다면 눈물 났을 상황
      this.hearts -= 1;
      this.combo = 0;
      if (it.name === 'runner') {
        this.score = Math.max(0, this.score + ty.pts);
        this.stats.runners += 1;
        this._float(it.x, it.y, `${ty.pts}`, '#F87171', true);
      } else {
        this.stats.noshows += 1;
        this._float(it.x, it.y, '노쇼!', '#F87171', true);
      }
      this._toast(pick(MSG[it.name]));
      this._burst(it.x, it.y, '#F87171', 16, 260);
      this.shake = Math.max(this.shake, 0.32);
      this.flash = { color: 'rgba(239,68,68,0.16)', t: 0 };
      this.pause = Math.max(this.pause, 0.1);
      this.synth.bad();
      if (this.hearts <= 0) this._gameOver();
      return;
    }
    // 착한 인플
    this.combo += 1;
    this.stats.caught += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const mult = this._comboMult() + (this.buffMult > 0 ? 0.5 : 0);
    const got = Math.round(ty.pts * mult) + (this.buffBonus > 0 ? 30 : 0);
    this.score += got;
    this._float(it.x, it.y, `+${got}`, it.name === 'crown' ? '#FDE68A' : '#C4B5FD', it.name === 'crown');

    if (it.name === 'crown') {
      // 대형 인플 체험 섭외 — 잭팟! 오늘 회식 각
      this.stats.crowns += 1;
      this._toast(pick(MSG.crown));
      this.banner = { text: '🎉 잭팟!! 대형 인플 섭외 성공!!', t: 0, dur: 1.8, kind: 'jackpot' };
      this._burst(it.x, it.y, '#FDE68A', 26, 320);
      this._spawnRain('🎉', 16);
      this.flash = { color: 'rgba(245,158,11,0.16)', t: 0 };
      this.shake = Math.max(this.shake, 0.22);
      this.pause = Math.max(this.pause, 0.12);
      this.synth.crown();
    } else if (it.name === 'hong') {
      this._toast(pick(MSG.hong));
      this._spawnRain('🧧', 12);
      this._burst(it.x, it.y, '#EF4444', 14, 240);
      this.synth.coffee();
    } else if (it.name === 'lost') {
      if (Math.random() < 0.7) this._toast(pick(MSG.lost));
      this._burst(it.x, it.y, ty.ring, 10);
      this.synth.catch_();
    } else if (it.name === 'branch') {
      if (Math.random() < 0.7) this._toast(pick(MSG.branch));
      this._burst(it.x, it.y, ty.ring, 10);
      this.synth.catch_();
    } else {
      if (it.name === 'late') this._toast(pick(MSG.late));
      this._burst(it.x, it.y, ty.ring, 10);
      this.synth.catch_();
    }

    if (this.combo > 0 && this.combo % 5 === 0) {
      this._float(this.px, H - GROUND - 86, pick(COMBO_MSG), '#DDD6FE', true);
    }
    this.onScore(this.score);
  }

  _gameOver() {
    this.state = 'over';
    this.overDelay = 0.7;
    this.stats.time = Math.round(this.t);
    this._burst(this.px, H - GROUND - 30, '#A78BFA', 26, 320);
    this.shake = 0.5;
    this.synth.over();
  }

  _update(dt) {
    if (this.pause > 0) { this.pause -= dt; return; }
    this.t += dt;

    const lv = 1 + Math.floor(this.t / 20);
    if (lv > this.level) {
      this.level = lv;
      this.banner = { text: `${lv}개월차 섭외자!`, t: 0, dur: 1.4, kind: 'level' };
      this.synth.levelup();
    }

    // 스폰
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this._spawn();
      this.spawnIn = Math.max(0.34, 0.92 - (this.level - 1) * 0.07)
        * (0.75 + Math.random() * 0.5);
    }

    // 동료 위챗 알림
    this.buddyIn -= dt;
    if (this.buddyIn <= 0) {
      this._fireBuddy();
      this.buddyIn = 16 + Math.random() * 9;
    }
    // 배경 시나리오 멘트
    this.tickerIn -= dt;
    if (this.tickerIn <= 0) {
      this.ticker = { text: pick(SCENARIO), t: 0 };
      this.tickerIn = 9 + Math.random() * 7;
    }

    // 캐릭터 이동 — 키보드 우선, 없으면 포인터 추적
    const SPEED = 430;
    if (this.keys.l || this.keys.r) {
      this.pvx = (this.keys.r ? SPEED : 0) - (this.keys.l ? SPEED : 0);
      this.px += this.pvx * dt;
      this.pointerX = null;
    } else if (this.pointerX !== null) {
      const diff = this.pointerX - this.px;
      this.pvx = diff * 12;
      this.px += Math.sign(diff) * Math.min(Math.abs(diff), SPEED * 1.25 * dt);
    } else {
      this.pvx *= 0.8;
    }
    this.px = Math.max(34, Math.min(this.w - 34, this.px));

    // 아이템
    const wide = this.buffWide > 0 ? 20 : 0;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const it = this.items[i];
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
      if (it.popT > 0) it.popT = Math.max(0, it.popT - dt);
      if (it.ty.sway) it.x += Math.sin(this.t * 3.1 + it.swayP) * 46 * dt;
      if (it.ty.wander) it.x += (Math.sin(this.t * 2.3 + it.swayP) + Math.sin(this.t * 5.7 + it.swayP * 2)) * 28 * dt;
      if (it.ty.tele && !it.teleported && it.y >= it.teleY) {
        // 딴 지점으로 순간이동 — "3호점 갔다더니" 그 상황
        it.teleported = true;
        this._burst(it.x, it.y, '#FB923C', 10, 150);
        it.x = it.r + 8 + Math.random() * (this.w - (it.r + 8) * 2);
        this._burst(it.x, it.y, '#FB923C', 10, 150);
        this._float(it.x, it.y - 20, '휙!', '#FB923C');
      }
      it.x = Math.max(it.r + 4, Math.min(this.w - it.r - 4, it.x));

      if (!it.revealed && it.y >= it.revealY) {
        it.revealed = true;                    // 먹튀, 잡기 직전 본색을 드러내다
        it.popT = 0.22;
        this._float(it.x, it.y - 22, '!?', '#F87171', true);
        this._burst(it.x, it.y, '#F87171', 14, 200);
        this.shake = Math.max(this.shake, 0.18);
        this.synth.beep(520, 0.09, 'square', 0.045, -180);
      }

      // 캐치 판정
      if (it.y > CATCH_Y && it.y < CATCH_Y + 52 && Math.abs(it.x - this.px) < 34 + wide + it.r * 0.5) {
        this._catch(it);
        this.items.splice(i, 1);
        if (this.state !== 'run') return;
        continue;
      }
      // 바닥
      if (it.y > H - GROUND + it.r) {
        this.items.splice(i, 1);
        if (it.ty.kind === 'good' && it.name !== 'late') {
          this.combo = 0;
          if (Math.random() < 0.35) this._toast(it.name === 'lost' ? pick(MSG.lostMiss) : pick(MSG.miss));
          this._burst(it.x, H - GROUND - 6, '#4B5563', 6, 90);
        } else if (it.ty.kind === 'bad' && Math.random() < 0.12) {
          this._toast(pick(MSG.dodge));
        }
      }
    }
  }

  _updateFx(dt) {
    this.squash = Math.max(0, this.squash - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.buffWide = Math.max(0, this.buffWide - dt);
    this.buffLucky = Math.max(0, this.buffLucky - dt);
    this.buffMult = Math.max(0, this.buffMult - dt);
    this.buffBonus = Math.max(0, this.buffBonus - dt);
    if (this.flash && (this.flash.t += dt) > 0.25) this.flash = null;
    if (this.toast && (this.toast.t += dt) > 1.9) this.toast = null;
    if (this.ticker && (this.ticker.t += dt) > 3.0) this.ticker = null;
    if (this.banner && (this.banner.t += dt) > (this.banner.dur || 1.4)) this.banner = null;
    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t > p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 1.1) this.floats.splice(i, 1);
    }
    for (let i = this.rain.length - 1; i >= 0; i -= 1) {
      const r = this.rain[i];
      r.t += dt;
      if (r.t > r.life || r.y > H + 30) { this.rain.splice(i, 1); continue; }
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vrot * dt;
    }
  }

  _loop(now) {
    if (this.destroyed) return;
    const dt = Math.min((now - (this.last || now)) / 1000, 0.05);  // 탭 이탈 시 자동 정지 효과
    this.last = now;

    if (this.state === 'run') this._update(dt);
    else this.t += dt * 0.4;                 // 대기 중에도 별은 반짝인다
    if (this.state === 'over' && this.overDelay > 0) {
      this.overDelay -= dt;
      if (this.overDelay <= 0) this.onOver(this.score, this.stats);
    }
    this._updateFx(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }

  /** ease-out-back — 배너 팝에 살짝 오버슈트를 줘서 "통통 튀는" 느낌 */
  _easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  }

  /* ── 그리기 ───────────────────────────────────────────── */

  _draw() {
    const { cx, w } = this;
    cx.save();
    if (this.shake > 0) {
      const m = this.shake * 14;
      cx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    // 하늘 — 위챗의 밤하늘
    const sky = cx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#141225');
    sky.addColorStop(0.7, '#12151D');
    sky.addColorStop(1, '#0E1016');
    cx.fillStyle = sky;
    cx.fillRect(-20, -20, w + 40, H + 40);

    // 별
    cx.fillStyle = 'rgba(196,181,253,0.25)';
    for (let i = 0; i < 24; i += 1) {
      const sx = ((i * 127.3) % w);
      const sy = ((i * 61.7) % (H - 120));
      const tw = 0.5 + Math.abs(Math.sin(this.t * 0.8 + i)) * 1.2;
      cx.fillRect(sx, sy, tw, tw);
    }

    // 바닥
    cx.fillStyle = '#161922';
    cx.fillRect(-20, H - GROUND, w + 40, GROUND + 20);
    cx.fillStyle = 'rgba(139,92,246,0.35)';
    cx.fillRect(-20, H - GROUND, w + 40, 2);

    // 코스메틱 비 — 红包雨·잭팟 컨페티 (판정 없음, 아이템보다 뒤)
    for (const r of this.rain) {
      const a = r.t < 0.15 ? r.t / 0.15 : (r.t > r.life - 0.3 ? Math.max(0, (r.life - r.t) / 0.3) : 1);
      cx.save();
      cx.globalAlpha = a;
      cx.translate(r.x, r.y);
      cx.rotate(r.rot);
      cx.font = `18px ${EMOJI_FONT}`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText(r.emoji, 0, 0);
      cx.restore();
    }

    // 아이템
    for (const it of this.items) this._drawItem(it);

    // 캐릭터
    if (this.state !== 'over' || this.overDelay > 0.35) this._drawPlayer();

    // 파티클
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      cx.globalAlpha = a;
      cx.fillStyle = p.color;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r * a + 0.5, 0, TAU);
      cx.fill();
    }
    cx.globalAlpha = 1;

    // 플로팅 텍스트 — big 은 살짝 흔들리며 발광
    for (const f of this.floats) {
      const a = 1 - f.t / 1.1;
      cx.save();
      cx.globalAlpha = Math.min(1, a * 1.6);
      cx.translate(f.x, f.y - f.t * 42);
      if (f.big) {
        cx.rotate(Math.sin(f.t * 18) * 0.06);
        cx.shadowColor = f.color;
        cx.shadowBlur = 10;
      }
      cx.font = `${f.big ? 800 : 700} ${f.big ? 20 : 14}px ${SANS}`;
      cx.fillStyle = f.color;
      cx.textAlign = 'center';
      cx.fillText(f.text, 0, 0);
      cx.restore();
    }
    cx.globalAlpha = 1;

    // 토스트 — 캐치 이벤트 반응
    if (this.toast) {
      const tt = this.toast.t;
      const a = tt < 0.15 ? tt / 0.15 : tt > 1.5 ? Math.max(0, (1.9 - tt) / 0.4) : 1;
      const scale = tt < 0.15 ? 0.85 + 0.15 * (tt / 0.15) : 1;
      cx.save();
      cx.globalAlpha = a;
      cx.translate(w / 2, H - GROUND - 118);
      cx.scale(scale, scale);
      cx.font = `700 13px ${SANS}`;
      const tw = cx.measureText(this.toast.text).width;
      cx.fillStyle = 'rgba(22,25,34,0.92)';
      cx.strokeStyle = 'rgba(139,92,246,0.5)';
      cx.beginPath();
      cx.roundRect(-tw / 2 - 12, -17, tw + 24, 26, 13);
      cx.fill(); cx.stroke();
      cx.fillStyle = '#E9EBF2';
      cx.textAlign = 'center';
      cx.fillText(this.toast.text, 0, 1);
      cx.restore();
      cx.globalAlpha = 1;
    }

    // 배경 시나리오 티커 — 캐치와 무관하게 흐르는 실무 애환 멘트
    if (this.ticker) {
      const tt = this.ticker.t;
      const a = tt < 0.2 ? tt / 0.2 : tt > 2.6 ? Math.max(0, (3.0 - tt) / 0.4) : 1;
      cx.save();
      cx.globalAlpha = a * 0.94;
      cx.font = `600 11px ${SANS}`;
      const tw = cx.measureText(this.ticker.text).width;
      const bx = w / 2; const by = 60;
      cx.fillStyle = 'rgba(20,16,30,0.7)';
      cx.strokeStyle = 'rgba(249,115,22,0.4)';
      cx.beginPath();
      cx.roundRect(bx - tw / 2 - 10, by - 14, tw + 20, 22, 11);
      cx.fill(); cx.stroke();
      cx.fillStyle = '#FDBA74';
      cx.textAlign = 'center';
      cx.fillText(this.ticker.text, bx, by + 3);
      cx.restore();
      cx.globalAlpha = 1;
    }

    // 레벨업·잭팟 배너
    if (this.banner) {
      const dur = this.banner.dur || 1.4;
      const p = this.banner.t / dur;
      const jp = this.banner.kind === 'jackpot';
      const overshoot = p < 0.2 ? this._easeOutBack(p / 0.2) : 1;
      cx.save();
      cx.globalAlpha = p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1;
      cx.translate(w / 2, H * (jp ? 0.3 : 0.34));
      cx.scale(overshoot, overshoot);
      cx.font = `800 ${jp ? 28 : 26}px ${SANS}`;
      cx.textAlign = 'center';
      cx.fillStyle = jp ? '#FDE68A' : '#DDD6FE';
      cx.shadowColor = jp ? 'rgba(245,158,11,0.9)' : 'rgba(139,92,246,0.8)';
      cx.shadowBlur = jp ? 26 : 18;
      cx.fillText(this.banner.text, 0, 0);
      cx.restore();
      cx.globalAlpha = 1;
    }

    // HUD
    this._drawHud();

    cx.restore();

    // 대미지 플래시 (흔들림 밖에서 전체 덮기)
    if (this.flash) {
      cx.fillStyle = this.flash.color;
      cx.fillRect(0, 0, w, H);
    }
  }

  _drawItem(it) {
    const { cx } = this;
    const showEmoji = it.revealed ? it.ty.emoji : it.ty.disguise;
    const isBadShown = it.revealed && it.ty.kind === 'bad';
    const pop = it.popT > 0 ? 1 + (it.popT / 0.22) * 0.5 : 1;  // 본색 드러날 때 살짝 부풀었다 가라앉음
    cx.save();
    cx.translate(it.x, it.y);
    cx.rotate(Math.sin(it.rot) * 0.25);
    cx.scale(pop, pop);

    // 버블
    cx.beginPath();
    cx.arc(0, 0, it.r, 0, TAU);
    cx.fillStyle = isBadShown ? 'rgba(45,18,26,0.95)' : 'rgba(255,255,255,0.92)';
    cx.fill();
    cx.lineWidth = 2;
    cx.strokeStyle = isBadShown ? it.ty.ring
      : it.revealed ? it.ty.ring : TYPES.selfie.ring;   // 위장 중엔 착한 링 색
    cx.stroke();

    // 먹튀 등장 직후 — 링이 깜빡인다
    if (isBadShown && it.name === 'runner') {
      cx.globalAlpha = 0.5 + Math.sin(this.t * 14) * 0.4;
      cx.beginPath();
      cx.arc(0, 0, it.r + 3.5, 0, TAU);
      cx.stroke();
      cx.globalAlpha = 1;
    }

    cx.font = `${it.r}px ${EMOJI_FONT}`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(showEmoji, 0, 2);
    cx.restore();
  }

  _drawPlayer() {
    const { cx } = this;
    const x = this.px;
    const groundY = H - GROUND;
    const sq = this.squash > 0 ? 1 - (this.squash / 0.14) * 0.16 : 1;
    const wobble = this.state === 'run' ? Math.sin(this.t * 5) * 1.5 : Math.sin(this.t * 2) * 2;
    const lean = Math.max(-0.16, Math.min(0.16, this.pvx / 2600));

    cx.save();
    cx.translate(x, groundY + wobble * 0.3);
    cx.rotate(lean);
    cx.scale(2 - sq, sq);          // squash & stretch (부피 보존 흉내)

    // 몸통
    const grad = cx.createLinearGradient(0, -56, 0, 0);
    grad.addColorStop(0, '#A855F7');
    grad.addColorStop(1, '#6D28D9');
    cx.fillStyle = grad;
    cx.beginPath();
    cx.roundRect(-26, -54, 52, 54, [18, 18, 12, 12]);
    cx.fill();

    // 배 (밝은 부분)
    cx.fillStyle = 'rgba(255,255,255,0.14)';
    cx.beginPath();
    cx.ellipse(0, -16, 15, 12, 0, 0, TAU);
    cx.fill();

    // 눈 — 가장 가까운 아이템을 본다
    let tx = 0; let ty2 = -1;
    let bd = 1e9;
    for (const it of this.items) {
      const d = (it.x - x) ** 2 + (it.y - (groundY - 40)) ** 2;
      if (d < bd) { bd = d; tx = it.x - x; ty2 = it.y - (groundY - 40); }
    }
    const el = Math.min(1, Math.hypot(tx, ty2) / 60);
    const ex = (tx / (Math.abs(tx) + 40)) * 3 * el;
    const ey = (ty2 / (Math.abs(ty2) + 60)) * 2.5 * el;
    for (const side of [-1, 1]) {
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(side * 11, -36, 7.5, 0, TAU);
      cx.fill();
      cx.fillStyle = '#1F1147';
      cx.beginPath();
      cx.arc(side * 11 + ex, -36 + ey, 3.4, 0, TAU);
      cx.fill();
    }
    // 볼터치
    cx.fillStyle = 'rgba(249,168,212,0.5)';
    for (const side of [-1, 1]) {
      cx.beginPath();
      cx.ellipse(side * 17, -27, 4, 2.6, 0, 0, TAU);
      cx.fill();
    }
    // 입
    cx.strokeStyle = '#EDE9FE';
    cx.lineWidth = 1.8;
    cx.beginPath();
    if (this.state === 'over') { cx.arc(0, -22, 4, Math.PI * 1.15, Math.PI * 1.85); } // 울상
    else { cx.arc(0, -28, 4.5, Math.PI * 0.15, Math.PI * 0.85); }
    cx.stroke();

    // 헤드셋 — 항상 통화 중인 섭외자
    cx.strokeStyle = '#2F3646';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.arc(0, -46, 20, Math.PI * 1.05, Math.PI * 1.95);
    cx.stroke();
    cx.fillStyle = '#2F3646';
    cx.beginPath();
    cx.roundRect(-29, -44, 7, 12, 3);
    cx.fill();
    cx.beginPath();
    cx.roundRect(22, -44, 7, 12, 3);
    cx.fill();
    cx.strokeStyle = '#34D399';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.arc(14, -20, 12, Math.PI * 0.2, Math.PI * 0.55);
    cx.stroke();
    cx.fillStyle = '#34D399';
    cx.beginPath();
    cx.arc(19, -12, 2.6, 0, TAU);
    cx.fill();

    // 발
    cx.fillStyle = '#5B21B6';
    for (const side of [-1, 1]) {
      cx.beginPath();
      cx.ellipse(side * 13, 0, 7, 4, 0, 0, TAU);
      cx.fill();
    }
    cx.restore();
  }

  _drawHud() {
    const { cx, w } = this;
    cx.textBaseline = 'alphabetic';

    // 점수
    cx.textAlign = 'left';
    cx.font = `800 24px ${SANS}`;
    cx.fillStyle = '#E9EBF2';
    cx.fillText(String(this.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','), 14, 32);
    if (this.highScore > 0) {
      cx.font = `600 10.5px ${SANS}`;
      cx.fillStyle = '#7F8598';
      cx.fillText(`BEST ${String(this.highScore).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 14, 46);
    }

    // 레벨
    cx.font = `700 11px ${SANS}`;
    cx.fillStyle = '#C4B5FD';
    cx.textAlign = 'center';
    cx.fillText(`${this.level}개월차`, w / 2, 22);

    // 콤보
    if (this.combo >= 2) {
      const mult = this._comboMult() + (this.buffMult > 0 ? 0.5 : 0);
      cx.font = `800 ${13 + Math.min(this.combo, 12)}px ${SANS}`;
      cx.fillStyle = mult >= 3 ? '#FDE68A' : '#DDD6FE';
      cx.fillText(`COMBO ×${this.combo}${mult > 1 ? ` (점수 ${mult}배)` : ''}`, w / 2, 46);
    }

    // 하트
    cx.textAlign = 'right';
    cx.font = `16px ${EMOJI_FONT}`;
    let hx = w - 12;
    for (let i = 0; i < this.maxHearts; i += 1) {
      cx.globalAlpha = i < this.hearts ? 1 : 0.18;
      cx.fillText('❤️', hx, 30);
      hx -= 22;
    }
    cx.globalAlpha = 1;

    // 활성 버프 아이콘 — 동료 지원 중임을 한눈에
    const buffs = [
      this.buffWide > 0 && '📞',
      this.buffLucky > 0 && '🍀',
      this.buffMult > 0 && '💕',
      this.buffBonus > 0 && '😎',
    ].filter(Boolean);
    if (buffs.length) {
      cx.font = `13px ${EMOJI_FONT}`;
      cx.textAlign = 'right';
      cx.fillText(buffs.join(' '), w - 12, 50);
    }
  }
}
