/* โหมดเล่นออนไลน์เรียลไทม์ 2-4 คน — Firebase Realtime Database
   ใช้ globals จาก game.js: el, clear, root, state, localSet, rankFor, RANKS, awardXP, render, screenHome */

var Online = (function () {
  var cfg = window.FIREBASE_CONFIG || {};
  var configured = cfg.databaseURL && cfg.databaseURL.indexOf('PASTE_') === -1;
  var db = null, ready = false;
  function init() {
    if (ready || !configured) return ready;
    try {
      if (!window.firebase || !firebase.initializeApp) return false;
      firebase.initializeApp(cfg);
      db = firebase.database();
      ready = true;
    } catch (e) { console.error('firebase init', e); ready = false; }
    return ready;
  }
  return { get configured() { return configured; }, init: init, db: function () { return db; }, sv: function () { return firebase.database.ServerValue.TIMESTAMP; } };
})();

var ONLINE = { HP: 3, QTIME: 15, MAX: 4, QCOUNT: 12 };
var _pid = 'p_' + Math.random().toString(36).slice(2, 9);
var _room = null;          // current room code
var _roomRef = null;       // db ref
var _roomSub = null;       // unsubscribe (onValue)
var _isHost = false;
var _localTimer = null;
var _hostTimer = null;
var _lastQ = -1;
var _answeredThisQ = false;

function randCode() { var s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; var c = ''; for (var i = 0; i < 4; i++) c += s.charAt(Math.floor(Math.random() * s.length)); return c; }

function stopOnline() {
  if (_roomSub && _roomRef) { _roomRef.off('value', _roomSub); }
  _roomSub = null; _roomRef = null; _room = null; _isHost = false; _lastQ = -1;
  if (_localTimer) { clearInterval(_localTimer); _localTimer = null; }
  if (_hostTimer) { clearTimeout(_hostTimer); _hostTimer = null; }
}

// ---------- Entry ----------
function startOnline() {
  if (!Online.configured) { onlineNotReady('ยังไม่ได้ตั้งค่า Firebase ในไฟล์ firebase-config.js'); return; }
  if (!Online.init()) { onlineNotReady('เชื่อมต่อ Firebase ไม่สำเร็จ ตรวจสอบค่าใน firebase-config.js'); return; }
  onlineMenu();
}
function onlineNotReady(msg) {
  var s = el('div', 'screen home');
  s.appendChild(el('h1', null, 'เล่นออนไลน์'));
  var c = el('div', 'card'); c.appendChild(el('p', 'warn-text', msg));
  c.appendChild(el('p', 'hint', 'ดูวิธีตั้งค่าในไฟล์ SETUP.md ส่วนที่ 3 (Firebase)'));
  s.appendChild(c);
  var bk = el('button', 'btn-primary', 'กลับหน้าแรก'); bk.addEventListener('click', function () { render(screenHome); }); s.appendChild(bk);
  root.replaceChildren(s);
}

function onlineMenu() {
  var s = el('div', 'screen home');
  s.appendChild(el('h1', null, '🌐 เล่นออนไลน์'));
  s.appendChild(el('p', 'sub-note', 'เล่นพร้อมกัน 2–4 คน คนละเครื่อง แข่งตอบโจทย์ชุดเดียวกันแบบเรียลไทม์'));

  var create = el('button', 'btn-primary', '➕ สร้างห้องใหม่');
  create.addEventListener('click', function () { createRoom(); });
  s.appendChild(create);

  var jc = el('div', 'card');
  jc.appendChild(el('label', 'field-label', 'เข้าร่วมห้อง (ใส่รหัสห้อง 4 ตัว)'));
  var inp = el('input', 'text-input'); inp.placeholder = 'เช่น K7QP'; inp.maxLength = 4; inp.style.textTransform = 'uppercase'; inp.style.letterSpacing = '4px'; inp.style.fontWeight = '700';
  jc.appendChild(inp);
  var join = el('button', 'btn-secondary', 'เข้าร่วม'); join.style.marginTop = '10px'; join.style.flex = 'none'; join.style.width = '100%';
  join.addEventListener('click', function () { var code = (inp.value || '').toUpperCase().trim(); if (code.length === 4) joinRoom(code); });
  jc.appendChild(join);
  s.appendChild(jc);

  var bk = el('button', 'btn-secondary', 'กลับหน้าแรก'); bk.addEventListener('click', function () { render(screenHome); }); s.appendChild(bk);
  root.replaceChildren(s);
}

// ---------- Create / Join ----------
function playerObj() { return { name: state.name.trim() || ('ผู้เล่น_' + _pid.slice(-3)), hp: ONLINE.HP, score: 0, connected: true, joinedAt: Date.now() }; }

function createRoom() {
  var code = randCode();
  _room = code; _isHost = true;
  _roomRef = Online.db().ref('rooms/' + code);
  var players = {}; players[_pid] = playerObj();
  _roomRef.set({ status: 'lobby', host: _pid, createdAt: Online.sv(), currentQ: -1, players: players })
    .then(function () { attachPresence(); subscribeRoom(); })
    .catch(function (e) { onlineNotReady('สร้างห้องไม่สำเร็จ: ' + e.message); });
}

function joinRoom(code) {
  _room = code; _isHost = false;
  _roomRef = Online.db().ref('rooms/' + code);
  _roomRef.once('value').then(function (snap) {
    var v = snap.val();
    if (!v) { onlineMenuWithError('ไม่พบห้อง ' + code); return; }
    if (v.status !== 'lobby') { onlineMenuWithError('ห้องนี้เริ่มเล่นไปแล้วหรือปิดแล้ว'); return; }
    var count = v.players ? Object.keys(v.players).length : 0;
    if (count >= ONLINE.MAX) { onlineMenuWithError('ห้องเต็มแล้ว (สูงสุด ' + ONLINE.MAX + ' คน)'); return; }
    _roomRef.child('players/' + _pid).set(playerObj())
      .then(function () { attachPresence(); subscribeRoom(); });
  });
}
function onlineMenuWithError(msg) { onlineMenu(); var s = root.firstChild; var w = el('p', 'warn-text', msg); s.insertBefore(w, s.children[2]); }

function attachPresence() {
  var meRef = _roomRef.child('players/' + _pid);
  meRef.child('connected').onDisconnect().set(false);
  // if host leaves, mark room closed
  if (_isHost) _roomRef.child('status').onDisconnect().set('closed');
}

// ---------- Subscribe & route by status ----------
function subscribeRoom() {
  _roomSub = _roomRef.on('value', function (snap) {
    var room = snap.val();
    if (!room) { stopOnline(); onlineMenuWithError('ห้องถูกปิดแล้ว'); return; }
    if (room.status === 'closed') { stopOnline(); onlineMenuWithError('หัวหน้าห้องออกไปแล้ว ห้องถูกปิด'); return; }
    if (room.status === 'lobby') renderLobby(room);
    else if (room.status === 'playing') { renderOnlinePlay(room); if (_isHost) hostTick(room); }
    else if (room.status === 'finished') renderOnlineResult(room);
  });
}

// ---------- Lobby ----------
function renderLobby(room) {
  var s = el('div', 'screen home');
  s.appendChild(el('h1', null, 'ห้องรอผู้เล่น'));
  var codeCard = el('div', 'card'); codeCard.style.textAlign = 'center';
  codeCard.appendChild(el('p', 'field-label', 'รหัสห้อง — บอกเพื่อนให้พิมพ์เข้ามา'));
  var code = el('div', null, room && _room); code.style.fontFamily = 'Kanit'; code.style.fontWeight = '700'; code.style.fontSize = '40px'; code.style.letterSpacing = '8px'; code.style.color = 'var(--accent)';
  codeCard.appendChild(code);
  s.appendChild(codeCard);

  var players = room.players || {};
  var keys = Object.keys(players).filter(function (k) { return players[k].connected !== false; });
  var list = el('div', 'card'); list.appendChild(el('p', 'field-label', 'ผู้เล่นในห้อง (' + keys.length + '/' + ONLINE.MAX + ')'));
  keys.forEach(function (k) {
    var row = el('div', 'sb-row'); row.style.marginBottom = '6px';
    var av = el('span', 'sb-avatar', (players[k].name || '?').charAt(0).toUpperCase()); av.style.background = avatarColor(players[k].name || '?'); row.appendChild(av);
    var mid = el('div', 'sb-mid'); var nl = el('div', 'sb-name-line'); nl.appendChild(el('span', 'sb-name', players[k].name)); if (k === room.host) nl.appendChild(el('span', 'sb-me-tag', 'หัวหน้าห้อง')); if (k === _pid) nl.appendChild(el('span', 'sb-rankchip', 'คุณ')); mid.appendChild(nl); row.appendChild(mid);
    row.style.gridTemplateColumns = '40px 1fr'; list.appendChild(row);
  });
  s.appendChild(list);

  if (_isHost) {
    var start = el('button', 'btn-primary', keys.length < 2 ? 'รออีกอย่างน้อย 1 คน...' : 'เริ่มเกม');
    start.disabled = keys.length < 2;
    start.addEventListener('click', function () { hostStart(); });
    s.appendChild(start);
  } else {
    s.appendChild(el('p', 'hint', 'รอหัวหน้าห้องกดเริ่มเกม...'));
  }
  var leave = el('button', 'btn-secondary', 'ออกจากห้อง'); leave.addEventListener('click', leaveRoom); s.appendChild(leave);
  root.replaceChildren(s);
}

function leaveRoom() {
  if (_roomRef) {
    if (_isHost) _roomRef.child('status').set('closed');
    else _roomRef.child('players/' + _pid).remove();
  }
  stopOnline(); onlineMenu();
}

// ---------- Host: start game ----------
function hostStart() {
  var qs = localSet(ONLINE.QCOUNT, null).map(function (q) {
    return { text: q.text, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, difficulty: q.difficulty };
  });
  _roomRef.update({ questions: qs, currentQ: 0, qStartAt: Online.sv(), status: 'playing' });
}

// ---------- Host: round resolution ----------
function hostTick(room) {
  if (room.currentQ == null || room.currentQ < 0) return;
  var qi = room.currentQ;
  // set a max timer once per question
  if (_hostTimer && _lastHostQ === qi) { /* already armed */ }
  if (_lastHostQ !== qi) {
    _lastHostQ = qi;
    if (_hostTimer) clearTimeout(_hostTimer);
    _hostTimer = setTimeout(function () { hostResolve(qi); }, (ONLINE.QTIME + 1) * 1000);
  }
  // early resolve if everyone alive answered
  var players = room.players || {};
  var alive = Object.keys(players).filter(function (k) { return players[k].connected !== false && (players[k].hp || 0) > 0; });
  var allAnswered = alive.every(function (k) { return players[k].answers && players[k].answers[qi] != null; });
  if (alive.length && allAnswered) { if (_hostTimer) clearTimeout(_hostTimer); hostResolve(qi); }
}
var _lastHostQ = -1;
var _resolving = {};

function hostResolve(qi) {
  if (_resolving[qi]) return; _resolving[qi] = true;
  _roomRef.once('value').then(function (snap) {
    var room = snap.val(); if (!room || room.currentQ !== qi || room.status !== 'playing') return;
    var players = room.players || {}; var q = room.questions[qi];
    var updates = {};
    Object.keys(players).forEach(function (k) {
      var p = players[k];
      if (p.connected === false || (p.hp || 0) <= 0) return;
      var ans = p.answers && p.answers[qi];
      var correct = ans && ans.choice === q.correctIndex;
      if (correct) {
        var base = q.difficulty === 'hard' ? 30 : q.difficulty === 'medium' ? 20 : 10;
        var speed = Math.round(((ans.timeLeft || 0) / ONLINE.QTIME) * 10);
        updates['players/' + k + '/score'] = (p.score || 0) + base + speed;
      } else {
        updates['players/' + k + '/hp'] = Math.max(0, (p.hp || 0) - 1);
      }
    });
    // recompute alive after damage
    var aliveAfter = Object.keys(players).filter(function (k) {
      if (players[k].connected === false) return false;
      var newHp = updates['players/' + k + '/hp'];
      var hp = newHp != null ? newHp : players[k].hp;
      return hp > 0;
    });
    var last = qi >= room.questions.length - 1;
    if (aliveAfter.length <= 1 || last) {
      updates['status'] = 'finished';
      updates['reveal'] = { qi: qi, correctIndex: q.correctIndex };
      _roomRef.update(updates);
    } else {
      updates['reveal'] = { qi: qi, correctIndex: q.correctIndex };
      _roomRef.update(updates).then(function () {
        setTimeout(function () {
          _roomRef.update({ currentQ: qi + 1, qStartAt: Online.sv(), reveal: null });
        }, 1600);
      });
    }
  });
}

// ---------- Play (all clients) ----------
function renderOnlinePlay(room) {
  var qi = room.currentQ; var q = room.questions[qi];
  var reveal = room.reveal && room.reveal.qi === qi ? room.reveal : null;
  var me = room.players[_pid] || {};
  var myAns = me.answers && me.answers[qi];
  var eliminated = (me.hp || 0) <= 0;

  // (re)start local timer when question changes
  if (_lastQ !== qi) { _lastQ = qi; _answeredThisQ = false; startLocalTimer(qi); }

  var s = el('div', 'screen playing');
  var top = el('div', 'hud');
  var leave = el('button', 'back-link', '← ออก'); leave.addEventListener('click', leaveRoom); top.appendChild(leave);
  top.appendChild(el('div', 'hud-score', 'ข้อ ' + (qi + 1) + '/' + room.questions.length)); s.appendChild(top);

  // players HP bars
  var bars = el('div', 'online-bars');
  Object.keys(room.players).forEach(function (k) {
    var p = room.players[k]; if (p.connected === false && k !== _pid) return;
    var dead = (p.hp || 0) <= 0;
    var b = el('div', 'ob' + (k === _pid ? ' me' : '') + (dead ? ' dead' : ''));
    var top2 = el('div', 'ob-top');
    top2.appendChild(el('span', 'ob-name', p.name + (k === _pid ? ' (คุณ)' : '')));
    top2.appendChild(el('span', 'ob-score', String(p.score || 0)));
    b.appendChild(top2);
    var hpt = el('div', 'ob-hp'); for (var i = 0; i < ONLINE.HP; i++) { hpt.appendChild(el('span', 'ob-heart ' + (i < (p.hp || 0) ? 'on' : 'off'), '♥')); }
    b.appendChild(hpt);
    // answered indicator during question
    if (!reveal && p.answers && p.answers[qi] != null && !dead) b.appendChild(el('span', 'ob-tag', 'ตอบแล้ว'));
    if (dead) b.appendChild(el('span', 'ob-tag out', 'ตกรอบ'));
    bars.appendChild(b);
  });
  s.appendChild(bars);

  var maxT = ONLINE.QTIME;
  var tt = el('div', 'timer-track'); var tf = el('div', 'timer-fill'); tf.id = 'ol-timer'; tt.appendChild(tf); s.appendChild(tt);

  var qc = el('div', 'card question-card diff-' + q.difficulty);
  qc.appendChild(el('span', 'diff-tag', q.difficulty === 'easy' ? 'ง่าย' : q.difficulty === 'medium' ? 'ปานกลาง' : 'ยาก'));
  qc.appendChild(el('p', 'question-text', q.text)); s.appendChild(qc);

  var og = el('div', 'options-grid');
  q.options.forEach(function (opt, i) {
    var b = el('button', 'option-btn', opt);
    if (reveal) { if (i === reveal.correctIndex) b.className += ' correct'; else if (myAns && myAns.choice === i) b.className += ' wrong'; b.disabled = true; }
    else if (myAns != null || eliminated) { if (myAns && myAns.choice === i) b.className += ' selected-dim'; b.disabled = true; }
    else { b.addEventListener('click', function () { submitAnswer(qi, i, q.correctIndex); }); }
    og.appendChild(b);
  });
  s.appendChild(og);

  if (eliminated) s.appendChild(el('div', 'feedback-banner wrong', 'คุณตกรอบแล้ว — ดูเพื่อนเล่นต่อได้'));
  else if (reveal) s.appendChild(el('div', 'feedback-banner ' + (myAns && myAns.choice === reveal.correctIndex ? 'correct' : 'wrong'), (myAns && myAns.choice === reveal.correctIndex) ? 'ถูกต้อง!' : 'ผิด — ' + q.explanation));
  else if (myAns != null) s.appendChild(el('div', 'feedback-banner correct', 'ส่งคำตอบแล้ว รอเพื่อน...'));

  root.replaceChildren(s);
  paintTimer();
}

var _qStartLocal = 0;
function startLocalTimer(qi) {
  _qStartLocal = Date.now();
  if (_localTimer) clearInterval(_localTimer);
  _localTimer = setInterval(function () {
    paintTimer();
    if (remaining() <= 0) { clearInterval(_localTimer); _localTimer = null; autoMiss(qi); }
  }, 250);
}
function remaining() { return Math.max(0, ONLINE.QTIME - Math.floor((Date.now() - _qStartLocal) / 1000)); }
function paintTimer() { var tf = document.getElementById('ol-timer'); if (!tf) return; var r = remaining(); tf.style.width = (r / ONLINE.QTIME) * 100 + '%'; tf.className = 'timer-fill' + (r <= 4 ? ' low' : ''); }
function autoMiss(qi) {
  if (_answeredThisQ) return; _answeredThisQ = true;
  // record a miss so host can resolve without waiting full buffer
  _roomRef.child('players/' + _pid + '/answers/' + qi).set({ choice: -1, timeLeft: 0, at: Date.now() });
}
function submitAnswer(qi, choice, correctIndex) {
  if (_answeredThisQ) return; _answeredThisQ = true;
  if (_localTimer) { clearInterval(_localTimer); _localTimer = null; }
  _roomRef.child('players/' + _pid + '/answers/' + qi).set({ choice: choice, timeLeft: remaining(), at: Date.now() });
}

// ---------- Result ----------
function renderOnlineResult(room) {
  if (_localTimer) { clearInterval(_localTimer); _localTimer = null; }
  var players = room.players || {};
  var rows = Object.keys(players).map(function (k) { return { id: k, name: players[k].name, score: players[k].score || 0, hp: players[k].hp || 0 }; });
  // winner: highest hp>0 then score; if all dead, highest score
  rows.sort(function (a, b) { if ((b.hp > 0) !== (a.hp > 0)) return (b.hp > 0) - (a.hp > 0); return b.score - a.score; });

  // save my score to GAS leaderboard once
  if (!room._saved && state.name.trim()) { var mine = players[_pid]; if (mine) awardXP('online', mine.score || 0); }

  var s = el('div', 'screen home');
  s.appendChild(el('h1', null, 'จบเกมออนไลน์'));
  if (rows.length) {
    var champ = rows[0];
    var wc = el('div', 'card'); wc.style.textAlign = 'center'; wc.style.borderColor = '#f2c14e'; wc.style.borderWidth = '2px';
    wc.appendChild(el('div', null, '🏆')).style.fontSize = '34px';
    wc.appendChild(el('div', 'winner-name', champ.name + (champ.id === _pid ? ' (คุณ)' : '')));
    wc.appendChild(el('p', 'hint', 'ผู้ชนะ · ' + champ.score + ' คะแนน'));
    s.appendChild(wc);
  }
  var list = el('div', 'sb-list');
  rows.forEach(function (e, i) {
    var row = el('div', 'sb-row' + (e.id === _pid ? ' me' : '')); row.style.animationDelay = (i * 30) + 'ms'; row.style.gridTemplateColumns = '26px 40px 1fr auto';
    row.appendChild(el('span', 'sb-pos', String(i + 1)));
    var av = el('span', 'sb-avatar', (e.name || '?').charAt(0).toUpperCase()); av.style.background = avatarColor(e.name || '?'); row.appendChild(av);
    var mid = el('div', 'sb-mid'); var nl = el('div', 'sb-name-line'); nl.appendChild(el('span', 'sb-name', e.name)); if (e.id === _pid) nl.appendChild(el('span', 'sb-me-tag', 'คุณ')); mid.appendChild(nl); mid.appendChild(el('div', 'sb-sub', e.hp > 0 ? '♥ รอด' : 'ตกรอบ')); row.appendChild(mid);
    var val = el('div', 'sb-value'); val.appendChild(el('span', 'sb-value-num', String(e.score))); val.appendChild(el('span', 'sb-value-label', 'คะแนน')); row.appendChild(val);
    list.appendChild(row);
  });
  s.appendChild(list);
  var again = el('button', 'btn-primary', 'กลับเมนูออนไลน์'); again.addEventListener('click', function () { stopOnline(); onlineMenu(); }); s.appendChild(again);
  var home = el('button', 'btn-secondary', 'กลับหน้าแรก'); home.addEventListener('click', function () { stopOnline(); render(screenHome); }); s.appendChild(home);
  root.replaceChildren(s);
}

window.startOnline = startOnline;
