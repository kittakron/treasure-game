/**
 * assets/engine.js — เอนจินเกมทั้งหมดทำงานในเบราว์เซอร์ของครู (host)
 * ไม่มีเซิร์ฟเวอร์: เฉลย/คะแนนอยู่ในหน่วยความจำของหน้า host เท่านั้น
 * แล้วส่ง "สถานะเฉพาะของแต่ละคน" ไปให้นักเรียน/โปรเจกเตอร์ผ่าน PeerJS
 */
const Engine = (() => {
  const LEAD_MS = 3000, GRACE_MS = 1000;
  const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#8e44ad', '#16a085', '#e67e22', '#c2185b'];
  const KEY_GAME = 'thg_game', KEY_CONTENT = 'thg_content';

  let Q = [];                         // คำถาม
  let CFG = { gameName: 'เกมล่าขุมสมบัติ', puzzleHint: '', puzzleAnswer: '', puzzleBonus: 500 };
  let G = null;                       // สถานะเกม
  const E = { onChange: () => {} };

  const now = () => Date.now();
  const cut = (s, n) => Array.from(String(s == null ? '' : s)).slice(0, n).join('');
  const tidy = (s, n) => cut(String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), n);
  const clamp = (v, lo, hi, d) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
  const normAns = s => String(s || '').replace(/\s+/g, '').toLowerCase();

  /* ---------- storage ---------- */
  function saveGame() { try { localStorage.setItem(KEY_GAME, JSON.stringify(G)); } catch (e) {} }
  function saveContent() { try { localStorage.setItem(KEY_CONTENT, JSON.stringify({ questions: Q, settings: CFG })); } catch (e) {} }
  function changed() { saveGame(); E.onChange(); }

  /* ---------- content (questions + settings) ---------- */
  function cleanQuestion(it) {
    const question = cut(String(it.question || '').trim(), 500);
    if (!question) return ['กรุณาใส่คำถาม'];
    const c = {};
    ['a', 'b', 'c', 'd'].forEach(k => c[k] = cut(String(it['choice_' + k] || '').trim(), 200));
    if (['a', 'b', 'c', 'd'].filter(k => c[k]).length < 2) return ['ต้องมีตัวเลือกอย่างน้อย 2 ข้อ'];
    const correct = String(it.correct || '').toLowerCase();
    if (!c[correct]) return ['กรุณาเลือกเฉลยที่ตรงกับช่องที่มีข้อความ'];
    const image = String(it.image || '').trim();
    if (image && !/^(https?:\/\/|assets\/)/i.test(image)) return ['ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://'];
    return [null, {
      question, image: cut(image, 500),
      choice_a: c.a, choice_b: c.b, choice_c: c.c, choice_d: c.d, correct,
      points: clamp(it.points, 0, 10000, 1000), time: clamp(it.time, 5, 300, 20),
      letter: cut(String(it.letter || '').trim(), 10), explanation: cut(String(it.explanation || '').trim(), 1000),
    }];
  }
  const nextQid = () => Q.reduce((m, q) => Math.max(m, q.id), 0) + 1;

  E.setContent = (questions, settings) => {
    Q = []; (questions || []).forEach(it => { const [err, c] = cleanQuestion(it); if (!err) Q.push({ id: nextQid(), ...c }); });
    if (settings) E.setSettings(settings, true);
    saveContent();
  };
  E.getQuestions = () => Q.map(q => ({ ...q }));
  E.saveQuestion = it => {
    const [err, c] = cleanQuestion(it);
    if (err) return { ok: false, msg: err };
    const id = parseInt(it.id, 10);
    const i = Q.findIndex(q => q.id === id);
    if (id && i >= 0) Q[i] = { id, ...c }; else Q.push({ id: nextQid(), ...c });
    saveContent(); E.onChange(); return { ok: true };
  };
  E.deleteQuestion = id => {
    if (G && ['QUESTION', 'REVEAL'].includes(G.phase) && G.qid === id) return { ok: false, msg: 'ลบข้อที่กำลังเล่นอยู่ไม่ได้' };
    Q = Q.filter(q => q.id !== id); saveContent(); E.onChange(); return { ok: true };
  };
  E.moveQuestion = (id, dir) => {
    const i = Q.findIndex(q => q.id === id), j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= Q.length) return;
    [Q[i], Q[j]] = [Q[j], Q[i]]; saveContent(); E.onChange();
  };
  E.importQuestions = (items, replace) => {
    if (!Array.isArray(items) || !items.length) return { ok: false, msg: 'ไฟล์ไม่ถูกต้อง: ต้องเป็นรายการคำถาม' };
    const clean = [];
    for (let n = 0; n < items.length; n++) {
      const [err, c] = cleanQuestion(items[n] || {});
      if (err) return { ok: false, msg: 'ข้อที่ ' + (n + 1) + ': ' + err };
      clean.push(c);
    }
    if (replace && G && G.phase !== 'LOBBY') return { ok: false, msg: 'แทนที่ทั้งหมดได้เฉพาะตอนอยู่หน้ารอผู้เล่น' };
    if (replace) Q = [];
    clean.forEach(c => Q.push({ id: nextQid(), ...c }));
    saveContent(); E.onChange(); return { ok: true, count: clean.length };
  };
  E.getSettings = () => ({ ...CFG });
  E.setSettings = (s, silent) => {
    CFG = {
      gameName: tidy(s.gameName, 100) || 'เกมล่าขุมสมบัติ',
      puzzleHint: cut(String(s.puzzleHint || '').trim(), 500),
      puzzleAnswer: cut(String(s.puzzleAnswer || '').trim(), 100),
      puzzleBonus: clamp(s.puzzleBonus, 0, 10000, 0),
    };
    if (!silent) { saveContent(); E.onChange(); }
  };
  E.loadContent = () => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY_CONTENT));
      if (d && Array.isArray(d.questions)) { Q = d.questions; CFG = { ...CFG, ...d.settings }; return true; }
    } catch (e) {}
    return false;
  };

  /* ---------- game lifecycle ---------- */
  const blank = pin => ({ pin, phase: 'LOBBY', qid: 0, startMs: 0, endMs: 0, nextPid: 1, nextTid: 1, teams: [], players: [], answers: {}, solves: [] });
  E.newGame = pin => { G = blank(pin); changed(); return G; };
  E.resume = () => {
    try { const g = JSON.parse(localStorage.getItem(KEY_GAME)); if (g && g.pin) { G = g; return G; } } catch (e) {}
    return null;
  };
  E.game = () => G;

  /* ---------- helpers ---------- */
  const playerByToken = t => G.players.find(p => p.token === t);
  const teamOf = p => G.teams.find(t => t.id === p.teamId);
  const qById = id => Q.find(q => q.id === id);
  const choicesOf = q => { const o = {}; ['a', 'b', 'c', 'd'].forEach(k => { if (q['choice_' + k]) o[k] = q['choice_' + k]; }); return o; };
  const pub = (q, withAnswer) => {
    const o = { id: q.id, question: q.question, image: q.image, choices: choicesOf(q), points: q.points, time: q.time };
    if (withAnswer) { o.correct = q.correct; o.explanation = q.explanation; }
    return o;
  };
  const answersFor = qid => G.answers[qid] || {};
  const pos = qid => { const i = Q.findIndex(q => q.id === qid); return { index: i + 1, total: Q.length }; };
  const hasPuzzle = () => !!CFG.puzzleAnswer.trim();
  const solved = teamId => G.solves.some(s => s.teamId === teamId);

  function teamLetters(teamId, excludeQid) {
    const out = [];
    Q.forEach(q => {
      if (q.id === excludeQid || !q.letter) return;
      const ans = answersFor(q.id);
      const hit = G.players.some(p => p.teamId === teamId && ans[p.token] && ans[p.token].correct);
      if (hit) out.push(q.letter);
    });
    return out;
  }

  function board(limit, withLetters) {
    const rows = G.teams.map(t => {
      const ms = G.players.filter(p => p.teamId === t.id);
      return {
        id: t.id, name: t.name, color: t.color, members: ms.length,
        score: ms.reduce((s, p) => s + p.score, 0) + t.bonus,
        correctCount: ms.reduce((s, p) => s + p.correct, 0),
      };
    }).sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.id - b.id);
    rows.forEach((r, i) => { r.rank = i + 1; if (withLetters) r.letters = teamLetters(r.id, 0); });
    return limit ? rows.slice(0, limit) : rows;
  }

  /* ---------- phase transitions ---------- */
  function openQuestion(q) {
    G.qid = q.id; G.startMs = now() + LEAD_MS; G.endMs = G.startMs + q.time * 1000; G.phase = 'QUESTION';
  }
  function toReveal() {
    if (G.phase !== 'QUESTION') return false;
    G.phase = 'REVEAL';
    const ans = answersFor(G.qid);
    G.players.forEach(p => { if (!ans[p.token]) p.streak = 0; });
    return true;
  }
  /** เรียกทุก ~500ms: หมดเวลาหรือทุกคนตอบครบ → เฉลยเอง */
  E.tick = () => {
    if (!G || G.phase !== 'QUESTION') return;
    const t = now();
    const all = G.players.length > 0 && t >= G.startMs && Object.keys(answersFor(G.qid)).length >= G.players.length;
    if (t >= G.endMs + GRACE_MS + 200 || all) { toReveal(); changed(); }
  };

  E.nextStep = () => {
    if (!G) return { ok: false, msg: 'ยังไม่มีเกม' };
    if (G.phase === 'LOBBY') {
      if (!Q.length) return { ok: false, msg: 'ยังไม่มีคำถาม ไปเพิ่มที่แท็บ "คำถาม" ก่อน' };
      openQuestion(Q[0]);
    } else if (G.phase === 'QUESTION') {
      toReveal();
    } else if (G.phase === 'REVEAL') {
      const p = pos(G.qid);
      if (p.index > 0 && Q[p.index]) openQuestion(Q[p.index]);
      else G.phase = hasPuzzle() ? 'PUZZLE' : 'PODIUM';
    } else if (G.phase === 'PUZZLE') {
      G.phase = 'PODIUM';
    } else return { ok: false, msg: 'เกมจบแล้ว กด "เกมใหม่" เพื่อเริ่มรอบใหม่' };
    changed(); return { ok: true };
  };
  E.endGame = () => { G.phase = 'PODIUM'; changed(); };
  E.kick = pid => {
    const p = G.players.find(x => x.id === pid); if (!p) return;
    G.players = G.players.filter(x => x.id !== pid);
    Object.values(G.answers).forEach(a => delete a[p.token]);
    if (!G.players.some(x => x.teamId === p.teamId)) G.teams = G.teams.filter(t => t.id !== p.teamId);
    changed(); return p.token;
  };

  /* ---------- players ---------- */
  E.join = (team, nick) => {
    if (G.phase === 'PODIUM') return { ok: false, msg: 'เกมนี้จบแล้ว' };
    const tn = tidy(team, 30);
    if (!tn) return { ok: false, msg: 'กรุณาใส่ชื่อทีม' };
    let t = G.teams.find(x => x.name.toLowerCase() === tn.toLowerCase());
    if (!t) { t = { id: G.nextTid++, name: tn, color: COLORS[G.teams.length % COLORS.length], bonus: 0 }; G.teams.push(t); }
    let nn = tidy(nick, 20);
    if (!nn) nn = 'ผู้เล่น ' + (G.players.filter(p => p.teamId === t.id).length + 1);
    if (G.players.some(p => p.teamId === t.id && p.nick.toLowerCase() === nn.toLowerCase())) return { ok: false, msg: 'ในทีมนี้มีชื่อนี้แล้ว ลองชื่ออื่นนะ' };
    const arr = new Uint8Array(12); crypto.getRandomValues(arr);
    const token = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    G.players.push({ id: G.nextPid++, token, teamId: t.id, nick: nn, score: 0, streak: 0, best: 0, correct: 0 });
    changed(); return { ok: true, token, nickname: nn, teamName: t.name };
  };

  E.answer = (token, choice) => {
    const p = playerByToken(token);
    if (!p) return { ok: false, code: 'NOT_FOUND', msg: 'ไม่พบผู้เล่น กรุณาเข้าร่วมใหม่' };
    if (G.phase !== 'QUESTION') return { ok: false, msg: 'ตอนนี้ไม่ได้อยู่ในช่วงตอบคำถาม' };
    const t = now();
    if (t < G.startMs) return { ok: false, msg: 'ยังไม่เริ่ม รอสัญญาณก่อนนะ' };
    if (t > G.endMs + GRACE_MS) return { ok: false, msg: 'หมดเวลาแล้ว' };
    const q = qById(G.qid);
    if (!q || !choicesOf(q)[choice]) return { ok: false, msg: 'ตัวเลือกไม่ถูกต้อง' };
    G.answers[q.id] = G.answers[q.id] || {};
    if (G.answers[q.id][token]) return { ok: false, code: 'ALREADY', msg: 'คุณตอบข้อนี้ไปแล้ว' };

    const correct = q.correct === choice;
    let points = 0;
    if (correct && q.points > 0) {
      const ratio = Math.min(1, (t - G.startMs) / Math.max(1000, q.time * 1000));
      points = Math.round(q.points * (1 - ratio / 2)) + Math.min(p.streak, 5) * 100; // เร็ว=เต็ม ช้าสุด=ครึ่ง + โบนัสสตรีค
    }
    G.answers[q.id][token] = { choice, correct, points, letter: correct ? q.letter : '' };
    p.score += points; p.streak = correct ? p.streak + 1 : 0; p.best = Math.max(p.best, p.streak); if (correct) p.correct++;
    changed(); return { ok: true };
  };

  E.puzzle = (token, answer) => {
    const p = playerByToken(token);
    if (!p) return { ok: false, code: 'NOT_FOUND', msg: 'ไม่พบผู้เล่น' };
    if (G.phase !== 'PUZZLE') return { ok: false, msg: 'ห้องสมบัติยังไม่เปิด' };
    if (solved(p.teamId)) return { ok: true, correct: true, already: true };
    if (!normAns(answer) || normAns(answer) !== normAns(CFG.puzzleAnswer)) return { ok: true, correct: false };
    G.solves.push({ teamId: p.teamId, playerId: p.id });
    const t = teamOf(p); t.bonus += CFG.puzzleBonus;
    changed(); return { ok: true, correct: true, bonus: CFG.puzzleBonus };
  };

  /* ---------- state builders (รูปแบบเดียวกับที่หน้าจอใช้) ---------- */
  E.playerState = token => {
    const p = playerByToken(token); if (!p) return null;
    const t = teamOf(p), b = board(), row = b.find(r => r.id === t.id) || { score: 0, rank: 0, members: 0 };
    const out = {
      serverNow: now(), phase: G.phase, gameName: CFG.gameName, playerCount: G.players.length,
      team: { name: t.name, color: t.color, score: row.score, rank: row.rank, members: row.members },
      player: { nickname: p.nick, score: p.score, streak: p.streak, correctCount: p.correct, bestStreak: p.best },
      letters: teamLetters(t.id, G.phase === 'QUESTION' ? G.qid : 0),
    };
    const q = qById(G.qid);
    if ((G.phase === 'QUESTION' || G.phase === 'REVEAL') && q) {
      const reveal = G.phase === 'REVEAL', ps = pos(q.id), a = answersFor(q.id)[token];
      out.question = pub(q, reveal); out.startMs = G.startMs; out.endMs = G.endMs; out.qIndex = ps.index; out.qTotal = ps.total;
      out.myAnswer = a ? (reveal ? { choice: a.choice, correct: a.correct, points: a.points, letter: a.letter } : { choice: a.choice }) : null;
      if (reveal) out.rank = row.rank;
    }
    if (G.phase === 'PUZZLE') out.puzzle = { hint: CFG.puzzleHint, solved: solved(t.id), bonus: CFG.puzzleBonus };
    if (G.phase === 'PODIUM') { out.rank = row.rank; out.top = board(3); }
    return out;
  };

  function dist(qid) {
    const d = { a: 0, b: 0, c: 0, d: 0 };
    Object.values(answersFor(qid)).forEach(a => d[a.choice]++);
    return d;
  }
  function common(withAnswer) {
    const out = { serverNow: now(), phase: G.phase, gameName: CFG.gameName, pin: G.pin, playerCount: G.players.length };
    const q = qById(G.qid);
    if ((G.phase === 'QUESTION' || G.phase === 'REVEAL') && q) {
      const ps = pos(q.id);
      out.question = pub(q, withAnswer || G.phase === 'REVEAL');
      out.startMs = G.startMs; out.endMs = G.endMs; out.qIndex = ps.index; out.qTotal = ps.total;
      out.answered = Object.keys(answersFor(q.id)).length;
    }
    return out;
  }

  E.projectorState = () => {
    const out = common(false);
    if (G.phase === 'LOBBY') out.teams = G.teams.map(t => ({ name: t.name, color: t.color, members: G.players.filter(p => p.teamId === t.id).map(p => p.nick) }));
    if (out.question && G.phase === 'REVEAL') { out.distribution = dist(G.qid); out.leaderboard = board(5); }
    if (G.phase === 'PUZZLE') { out.puzzleHint = CFG.puzzleHint; out.solvers = G.solves.map(s => (G.teams.find(t => t.id === s.teamId) || {}).name); }
    if (G.phase === 'PODIUM') out.leaderboard = board(10);
    return out;
  };

  E.teacherState = () => {
    const out = common(true);
    out.questionCount = Q.length; out.hasPuzzle = hasPuzzle();
    out.leaderboard = board(0, true);
    out.players = G.players.map(p => ({ id: p.id, nickname: p.nick, score: p.score, team: (teamOf(p) || {}).name }));
    if (out.question) {
      const q = qById(G.qid); out.question.letter = q.letter;
      out.distribution = dist(G.qid); out.isLast = out.qIndex >= out.qTotal;
    }
    return out;
  };

  return E;
})();
