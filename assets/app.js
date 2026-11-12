/** assets/app.js — ฟังก์ชันกลางที่ใช้ร่วมทุกหน้า */

// ป้องกัน XSS: ชื่อเล่น/คำถามทุกอย่างที่ใส่ใน innerHTML ต้องผ่านฟังก์ชันนี้
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ---- ซิงก์เวลากับเซิร์ฟเวอร์ (ให้ทุกเครื่องนับถอยหลังตรงกัน) ----
let clockOffset = 0;
function syncClock(serverNow) { clockOffset = serverNow - Date.now(); }
function serverTime() { return Date.now() + clockOffset; }

// ---- รูปทรง/สีของตัวเลือก แบบ Kahoot ----
const CHOICE = {
  a: { shape: '▲', cls: 'c-a', label: 'A' },
  b: { shape: '◆', cls: 'c-b', label: 'B' },
  c: { shape: '●', cls: 'c-c', label: 'C' },
  d: { shape: '■', cls: 'c-d', label: 'D' },
};

// ---- เสียงเอฟเฟกต์ด้วย Web Audio (ไม่ต้องมีไฟล์เสียง) ----
let _ctx = null;
function playTone(freq, dur, type, delay) {
  try {
    _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = _ctx.currentTime + (delay || 0) / 1000;
    const osc = _ctx.createOscillator(), gain = _ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(_ctx.destination);
    osc.start(t0); osc.stop(t0 + dur);
  } catch (e) { /* ไม่รองรับก็ข้าม */ }
}
const sfx = {
  tap: () => playTone(440, 0.12, 'square'),
  right: () => { playTone(880, 0.3, 'triangle'); playTone(1320, 0.3, 'triangle', 150); },
  wrong: () => playTone(160, 0.4, 'sawtooth'),
  tick: () => playTone(660, 0.1, 'sine'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.4, 'triangle', i * 150)),
};

// ---- เพลงพื้นหลัง (ใช้ที่จอโปรเจกเตอร์) สร้างเสียงด้วย Web Audio ไม่ต้องมีไฟล์เพลง ----
// วิธีใช้: เรียก bgm.update(สถานะเกม) ทุกครั้งที่ได้รับ state ใหม่ เช่น bgm.update(s.phase)
// เพลงเปลี่ยนตามช่วงของเกม: LOBBY / QUESTION / REVEAL / PUZZLE / PODIUM
const bgm = (() => {
  const N = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  };
  // แต่ละเพลง = 16 จังหวะ (null = เว้น) วนซ้ำ
  const SONGS = {
    LOBBY: { bpm: 104, wave: 'triangle', vol: 0.10,
      mel:  ['E4', null, 'G4', null, 'C5', null, 'G4', null, 'A4', null, 'C5', null, 'G4', null, 'E4', null],
      bass: ['C3', null, null, null, 'C3', null, null, null, 'F3', null, null, null, 'G3', null, null, null] },
    QUESTION: { bpm: 150, wave: 'square', vol: 0.05,
      mel:  ['A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'C5', 'G4', 'B4', 'D5', 'B4', 'G4', 'B4', 'D5', 'B4'],
      bass: ['A3', null, 'A3', null, 'A3', null, 'A3', null, 'G3', null, 'G3', null, 'G3', null, 'G3', null] },
    REVEAL: { bpm: 112, wave: 'triangle', vol: 0.10,
      mel:  ['C5', null, 'E5', null, 'G5', null, 'E5', null, 'C5', null, 'E5', null, 'G5', null, null, null],
      bass: ['C3', null, null, null, 'G3', null, null, null, 'C3', null, null, null, 'G3', null, null, null] },
    PUZZLE: { bpm: 84, wave: 'sine', vol: 0.12,
      mel:  ['E4', null, null, 'F4', null, null, 'E4', null, 'D4', null, null, 'E4', null, null, null, null],
      bass: ['D3', null, null, null, null, null, null, null, 'E3', null, null, null, null, null, null, null] },
    PODIUM: { bpm: 128, wave: 'triangle', vol: 0.11,
      mel:  ['C5', 'E5', 'G5', 'E5', 'C5', 'E5', 'G5', 'E5', 'D5', 'G5', 'B4', 'G5', 'C5', null, null, null],
      bass: ['C3', null, 'C3', null, 'C3', null, 'C3', null, 'G3', null, 'G3', null, 'C3', null, null, null] },
  };

  // ถ้ามีไฟล์เพลงของตัวเองในโฟลเดอร์ assets/music/ จะเล่นไฟล์นั้น (วนซ้ำ) ถ้าไม่มีไฟล์ จะใช้เพลงที่สร้างจากโค้ดแทน
  const FILES = {
    LOBBY: 'assets/music/lobby.mp3',       // หน้ารอผู้เล่น
    QUESTION: 'assets/music/question.mp3', // ตอนตอบคำถาม
    REVEAL: 'assets/music/reveal.mp3',     // ตอนเฉลย
    PUZZLE: 'assets/music/puzzle.mp3',     // ห้องสมบัติ
    PODIUM: 'assets/music/podium.mp3',     // โพเดียม
  };
  const audios = {};
  let phase = null, on = true, started = false, timer = null, step = 0, btn = null, master = null;
  try { on = localStorage.getItem('thg_bgm') !== 'off'; } catch (e) {}

  function ctx() {
    try {
      _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (_ctx.state === 'suspended') _ctx.resume();
      if (!master) { master = _ctx.createGain(); master.gain.value = 1; master.connect(_ctx.destination); }
      return _ctx;
    } catch (e) { return null; }
  }
  function note(freq, dur, type, vol) {
    const c = ctx(); if (!c) return;
    const t0 = c.currentTime, osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + dur);
  }
  function getAudio(p) {
    if (!FILES[p]) return false;
    if (p in audios) return audios[p];
    const a = new Audio(FILES[p]);
    a.loop = true; a.preload = 'auto'; a.volume = 0.7;
    a.addEventListener('error', () => { audios[p] = false; if (p === phase) refresh(); });
    audios[p] = a;
    return a;
  }
  function stopAudio() { Object.keys(audios).forEach(k => { const a = audios[k]; if (a) { a.pause(); try { a.currentTime = 0; } catch (e) {} } }); }
  // เริ่มเพลงของช่วงปัจจุบัน: ใช้ไฟล์ถ้ามี ไม่งั้นใช้เพลงจากโค้ด
  function refresh() {
    clearTimeout(timer); stopAudio();
    if (!on || !started || !phase) return;
    const a = getAudio(phase);
    if (a) a.play().catch(() => { audios[phase] = false; step = 0; loop(); });
    else { step = 0; loop(); }
  }
  function loop() {
    clearTimeout(timer);
    const s = SONGS[phase];
    if (!on || !started || !s) return;
    const stepMs = 60000 / s.bpm / 2;
    const m = s.mel[step % 16], b = s.bass[step % 16];
    if (m) note(N[m], stepMs / 1000 * 1.6, s.wave, s.vol);
    if (b) note(N[b] / 2, stepMs / 1000 * 3, 'sine', s.vol * 1.6);
    step++;
    timer = setTimeout(loop, stepMs);
  }
  function render() {
    if (!btn) return;
    btn.textContent = !started ? '🔊 แตะเพื่อเปิดเพลง' : (on ? '🔊 เพลง: เปิด' : '🔇 เพลง: ปิด');
  }
  function makeBtn() {
    if (btn || !document.body) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'เปิด/ปิดเพลงพื้นหลัง');
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:8px 14px;border:0;border-radius:999px;' +
      'background:rgba(0,0,0,.55);color:#fff;font:600 14px Kanit,sans-serif;cursor:pointer;opacity:.85;';
    btn.onclick = e => { e.stopPropagation(); api.toggle(); };
    document.body.appendChild(btn);
    render();
  }
  // เบราว์เซอร์บล็อกเสียงอัตโนมัติ → เริ่มเล่นหลังจากมีการแตะ/คลิกครั้งแรกในหน้า
  function unlock() {
    if (started) return;
    started = true; ctx(); render(); refresh();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { once: false, passive: true }));

  const api = {
    update(p) {
      makeBtn();
      if (p === phase) return;
      phase = p; step = 0;
      refresh();
    },
    toggle() {
      if (!started) { unlock(); return; }
      on = !on;
      try { localStorage.setItem('thg_bgm', on ? 'on' : 'off'); } catch (e) {}
      refresh(); render();
    },
    stop() { clearTimeout(timer); stopAudio(); },
  };
  return api;
})();

function confetti(n) {
  const colors = ['#ffc83d', '#e21b3c', '#1368ce', '#26890c', '#ffffff'];
  for (let i = 0; i < (n || 80); i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = (2.5 + Math.random() * 2.5) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5500);
  }
}

// สร้างตัวเลือกให้ปุ่ม/ไทล์ (ใช้ทั้งนักเรียน โปรเจกเตอร์)
function tilesHtml(choices, tag) {
  return Object.keys(choices).map(k =>
    `<${tag} class="tile ${CHOICE[k].cls}" data-k="${k}"><span class="shape">${CHOICE[k].shape}</span><span class="txt">${esc(choices[k])}</span></${tag}>`
  ).join('');
}