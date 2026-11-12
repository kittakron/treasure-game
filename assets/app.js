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
