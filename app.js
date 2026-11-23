
'use strict';
const LS = 'beachvb.mm.v1';
const POS = { 2: '2-й номер (справа)', 4: '4-й номер (слева)' };

function newState() {
  return {
    stage: 'setup', name: 'Мастер микст', players: [], pairs: [], matches: [], tab: 'now',
    settings: { bestOf: 1, pointsTo: 21, lastTo: 15, courts: 1 },
  };
}
function load() { try { const s = localStorage.getItem(LS); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
let S = load() || newState();


const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const byTime = (x, y) => x.time - y.time;
const pkey = (x, y) => x < y ? x + '|' + y : y + '|' + x;
function player(id) { return S.players.find(p => p.id === id); }
function pName(id) { const p = player(id); return p ? p.name : '?'; }
function pair(id) { return S.pairs.find(p => p.id === id); }
function pairName(id) { const p = pair(id); return p ? p.members.map(pName).join('+') : '?'; }
function membersOf(m) { return [...pair(m.a).members, ...pair(m.b).members]; }
function winnerPair(m) { return m.result ? (m.result.winner === 'a' ? m.a : m.b) : null; }
function loserPair(m) { return m.result ? (m.result.winner === 'a' ? m.b : m.a) : null; }
function maxNum() { return Math.max(0, ...S.matches.map(m => m.num)); }

/* ================= Состояние турнира ================= */
// выбывшие пары, кто сейчас занят, статистика игроков и пар
function info() {
  const ms = S.matches.slice().sort(byTime);
  const lost = new Set(), busy = new Set(), P = {}, opp = {}, pairG = {}, pairW = {}, pairL = {};
  S.players.forEach(p => { P[p.id] = { id: p.id, g: 0, w: 0, l: 0, pf: 0, pa: 0, last: 0 }; });
  for (const m of ms) {
    const A = pair(m.a).members, B = pair(m.b).members;
    [[m.a, A], [m.b, B]].forEach(([t, M]) => M.forEach(p => { if (P[p]) { P[p].g++; P[p].last = m.time; P[p].lastPair = t; } }));
    [m.a, m.b].forEach(t => { pairG[t] = (pairG[t] || 0) + 1; });
    A.forEach(x => B.forEach(y => { opp[pkey(x, y)] = (opp[pkey(x, y)] || 0) + 1; }));
    if (m.result) {
      const aw = m.result.winner === 'a', W = aw ? A : B, L = aw ? B : A;
      lost.add(loserPair(m));
      pairW[winnerPair(m)] = (pairW[winnerPair(m)] || 0) + 1; pairL[loserPair(m)] = (pairL[loserPair(m)] || 0) + 1;
      W.forEach(p => P[p] && P[p].w++); L.forEach(p => P[p] && P[p].l++);
      for (const [x, y] of m.result.sets || []) {
        A.forEach(p => { if (P[p]) { P[p].pf += x; P[p].pa += y; } });
        B.forEach(p => { if (P[p]) { P[p].pf += y; P[p].pa += x; } });
      }
    } else [...A, ...B].forEach(p => busy.add(p));
  }
  return { lost, busy, P, opp, pairG, pairW, pairL, T: ms.length };
}
function availPairs(I, busy = I.busy) {
  return S.pairs.filter(p => !I.lost.has(p.id) && p.members.every(x => I.P[x] && !busy.has(x)));
}
function hasPairLeft(I, id) { return S.pairs.some(p => p.members.includes(id) && !I.lost.has(p.id)); }

// Подбор лучшей следующей игры: меньше всего сыгранных → дольше всех отдыхали → новые партнёры и соперники
function pickGame(I) {
  const C = Math.max(1, S.settings.courts), avail = availPairs(I);
  let best = null, bs = Infinity;
  for (let i = 0; i < avail.length; i++) for (let j = i + 1; j < avail.length; j++) {
    const a = avail[i], b = avail[j];
    if (a.members[0] === b.members[0] || a.members[1] === b.members[1]) continue; // игрок не может быть в обеих парах
    const ps = [...a.members, ...b.members];
    const g = ps.map(p => I.P[p].g);
    const w = ps.map(p => (I.T - I.P[p].last) / C);
    let s = 100 * Math.max(...g) + 20 * g.reduce((x, y) => x + y, 0)
      - 2 * w.reduce((x, y) => x + y * y, 0)
      // разнообразие напарников: чем чаще пара уже играла и если это тот же напарник, что в прошлой игре, — тем хуже
      + 40 * ((I.pairG[a.id] || 0) + (I.pairG[b.id] || 0));
    for (const t of [a, b]) for (const x of t.members) if (I.P[x].lastPair === t.id) s += 60;
    for (const x of a.members) for (const y of b.members) s += 4 * (I.opp[pkey(x, y)] || 0);
    s += Math.random();
    if (s < bs) { bs = s; best = [a, b]; }
  }
  return best;
}
function isComplete() { return S.stage === 'running' && S.matches.every(m => m.result) && !pickGame(info()); }

/* ================= Корты ================= */
function assignCourts() {
  const C = S.settings.courts, newly = [];
  for (const m of S.matches) if (m.court && (m.result || m.court > C)) m.court = null;
  const used = new Set(), busy = new Set();
  const freeCourt = () => { let c = 1; while (used.has(c)) c++; return c; };
  for (const m of S.matches) if (m.court) { used.add(m.court); membersOf(m).forEach(p => busy.add(p)); }
  // сначала — уже составленные, но не начатые игры (например, после сброса результата)
  for (const m of S.matches.filter(m => !m.result && !m.court).sort(byTime)) {
    if (used.size >= C) break;
    if (membersOf(m).some(p => busy.has(p))) continue;
    m.court = freeCourt(); used.add(m.court); membersOf(m).forEach(p => busy.add(p)); newly.push(m);
  }
  // затем — новые игры на свободные корты
  while (used.size < C && !S.matches.some(m => !m.result && !m.court)) {
    const I = info(), pick = pickGame(I);
    if (!pick) break;
    const n = I.T + 1, c = freeCourt();
    const m = { id: uid(), num: maxNum() + 1, time: n, a: pick[0].id, b: pick[1].id, court: c, result: null };
    S.matches.push(m); used.add(c); newly.push(m);
  }
  planNext(used.size >= C);
  return newly;
}
// «Следующая игра» объявляется заранее и уже не меняется: она выйдет на первый освободившийся корт.
// Если без результатов текущих игр её не собрать (все свободные игроки не складываются в две пары) — не объявляем.
function planNext(courtsFull = true) {
  if (S.stage !== 'running' || !courtsFull || S.matches.some(m => !m.result && !m.court)) return;
  const I = info(), pick = pickGame(I);
  if (pick) S.matches.push({ id: uid(), num: maxNum() + 1, time: I.T + 1, a: pick[0].id, b: pick[1].id, court: null, result: null });
}

/* ================= Места ================= */
function ranking() {
  const I = info(), pct = r => r.w / ((r.w + r.l) || 1);
  return Object.values(I.P).sort((x, y) => y.w - x.w || pct(y) - pct(x) || (y.pf - y.pa) - (x.pf - x.pa));
}
function places() {
  const R = ranking(), res = [], same = (x, y) => x.w === y.w && x.l === y.l && x.pf - x.pa === y.pf - y.pa;
  R.forEach((r, i) => { if (i && same(r, R[i - 1])) res[res.length - 1].ids.push(r.id); else res.push({ place: i + 1, ids: [r.id] }); });
  return res;
}
function placeMap() { const m = {}; places().forEach(x => x.ids.forEach(id => { m[id] = x.place; })); return m; }

/* ================= Настройка ================= */
function addPlayers(pos) {
  const el = $('#pl' + pos); const names = el.value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  if (!names.length) return;
  names.forEach(n => S.players.push({ id: uid(), name: n, pos }));
  render();
  setTimeout(() => $('#pl' + pos) && $('#pl' + pos).focus(), 0);
}
function setPos(id, pos) { const p = player(id); if (p) p.pos = pos; render(); }
function delPlayer(id) { S.players = S.players.filter(p => p.id !== id); render(); }
function renamePlayer(id) {
  const p = player(id); if (!p) return;
  const v = prompt('Имя игрока', p.name); if (v && v.trim()) { p.name = v.trim(); render(); }
}
function setS(k, v) { S.settings[k] = v; render(); }

function startTournament() {
  const p2 = S.players.filter(p => p.pos === 2), p4 = S.players.filter(p => p.pos === 4);
  if (p2.length < 2 || p4.length < 2) return alert('Нужно минимум по 2 игрока каждого номера.');
  S.pairs = [];
  for (const a of p4) for (const b of p2) S.pairs.push({ id: 'pr_' + a.id + '_' + b.id, members: [a.id, b.id] });
  S.matches = []; S.stage = 'running'; S.tab = 'now';
  const nw = assignCourts();
  if (!S.statStart) { S.statStart = 1; track('start', { p: S.players.length, c: S.settings.courts }); }
  render();
  toast(['Турнир начался! Пар в игре: ' + S.pairs.length, ...nw.map(courtLine)]);
}
function backToSetup() {
  if (S.matches.some(m => m.result) && !confirm('Все результаты игр будут удалены. Вернуться к настройке?')) return;
  S.stage = 'setup'; S.matches = []; S.pairs = []; render();
}
function newTournament() {
  if (!confirm('Начать новый турнир? Текущие данные будут удалены (сначала можно сделать экспорт).')) return;
  S = newState(); render();
}

/* ================= Результаты ================= */
function openMatch(id) {
  const m = S.matches.find(m => m.id === id); if (!m) return;
  const A = pairName(m.a), B = pairName(m.b), w = m.result && m.result.winner;
  const btn = side => `<button class="btn ${w === side ? '' : 'ghost'} big" onclick="applyResult('${id}',{winner:'${side}',sets:[]})">${w === side ? '✓ ' : ''}${esc(side === 'a' ? A : B)}</button>`;
  $('#modal').innerHTML = `<div class="dlg">
    <h3>Игра №${m.num}</h3><div class="muted">${m.court ? 'Корт ' + m.court : ''}</div>
    <p style="text-align:center;margin:14px 0 8px"><b>Кто победил?</b></p>
    <div class="quick">${btn('a')}${btn('b')}</div>
    <div class="row" style="justify-content:space-between">
      ${m.result ? `<button class="btn danger sm" onclick="applyResult('${id}',null)">Сбросить результат</button>` : '<span></span>'}
      <button class="btn ghost sm" onclick="closeModal()">Закрыть</button></div></div>`;
  $('#modal').classList.add('on');
}
function closeModal() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; }
function applyResult(id, res) {
  const m = S.matches.find(m => m.id === id); const prev = m.result;
  if (prev && res && prev.winner !== res.winner) {
    // новая проигравшая пара могла уже сыграть позже — такие игры (и все после них) пересоздаются
    const nl = res.winner === 'a' ? m.b : m.a;
    const bad = S.matches.filter(x => x.time > m.time && (x.a === nl || x.b === nl));
    if (bad.length) {
      const t0 = Math.min(...bad.map(x => x.time)), del = S.matches.filter(x => x.time >= t0);
      if (!confirm(`Пара «${pairName(nl)}» уже играла позже. Будут удалены ${del.length} последующих игр(ы), и расписание составится заново. Продолжить?`)) return;
      S.matches = S.matches.filter(x => !del.includes(x));
    }
  }
  m.result = res ? Object.assign({}, res, { at: Date.now() }) : null;
  const nw = assignCourts();
  if (isComplete() && !S.statFin) {
    S.statFin = 1;
    track('finish', { p: S.players.length, c: S.settings.courts, g: S.matches.filter(x => x.result).length });
  }
  closeModal(); render();
  const msg = [];
  if (res) {
    msg.push(`Победа: <b>${esc(pairName(winnerPair(m)))}</b>`);
    msg.push(`Пара ${esc(pairName(loserPair(m)))} в этом составе больше не играет`);
  }
  nw.forEach(x => msg.push('▶ ' + courtLine(x)));
  if (isComplete()) { const p = places()[0]; if (p) msg.push(`🏆 Турнир завершён! Победитель: <b>${esc(p.ids.map(pName).join(', '))}</b>`); }
  if (msg.length) toast(msg);
}
function courtLine(m) { return `Корт ${m.court}: <b>${esc(pairName(m.a))}</b> / <b>${esc(pairName(m.b))}</b>`; }
function setCourts(v) {
  S.settings.courts = Math.max(1, Math.min(20, +v || 1));
  const nw = assignCourts(); render(); if (nw.length) toast(nw.map(x => '▶ ' + courtLine(x)));
}

let toastTimer;
function toast(lines) {
  const t = $('#toast'); t.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 4000 + lines.length * 1500);
}

/* ================= Русская раскладка внутри приложения ================= */
// Клавиши переводятся в кириллицу по физическому положению (ЙЦУКЕН), независимо от раскладки системы
const RU_KEYS = {
  KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н', KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з', BracketLeft: 'х', BracketRight: 'ъ',
  KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р', KeyJ: 'о', KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э',
  KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м', KeyB: 'и', KeyN: 'т', KeyM: 'ь', Comma: 'б', Period: 'ю', Backquote: 'ё',
};
// по умолчанию — русский; выбор пользователя запоминается
let ruMode = true;
try { ruMode = localStorage.getItem('beachvb.ru2') !== '0'; } catch (e) {}
function toggleRu() {
  ruMode = !ruMode;
  try { localStorage.setItem('beachvb.ru2', ruMode ? '1' : '0'); } catch (e) {}
  updateKb();
  toast([ruMode ? 'Ввод русскими буквами включён (F2 — переключить)' : 'Ввод как в системе (EN)']);
}
function updateKb() { const b = $('#kb'); if (b && b.style) { b.textContent = 'Ввод: ' + (ruMode ? 'RU' : 'EN'); b.style.background = ruMode ? 'var(--sand)' : ''; b.style.color = ruMode ? '#3a2c00' : ''; } }
function ruChar(e) {
  let ch = RU_KEYS[e.code];
  if (e.code === 'Slash') ch = e.shiftKey ? ',' : '.';
  if (!ch) return null;
  const upper = e.shiftKey !== !!(e.getModifierState && e.getModifierState('CapsLock'));
  return upper ? ch.toUpperCase() : ch;
}
function ruKeydown(e) {
  if (e.key === 'F2') { e.preventDefault(); toggleRu(); return; }
  if (!ruMode || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const el = e.target;
  if (!(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.getAttribute('type'))))) return;
  // если система уже печатает не латиницей (русская раскладка, телефон) — не вмешиваемся
  if (typeof e.key !== 'string' || e.key.length !== 1 || e.key.charCodeAt(0) > 127) return;
  const ch = ruChar(e); if (!ch) return;
  e.preventDefault();
  if (!(document.execCommand && document.execCommand('insertText', false, ch))) {
    el.setRangeText(ch, el.selectionStart, el.selectionEnd, 'end'); el.dataset.ru = '1';
  }
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', ruKeydown, true);
  document.addEventListener('focusout', e => { const el = e.target; if (el.dataset && el.dataset.ru) { delete el.dataset.ru; el.dispatchEvent(new Event('change', { bubbles: true })); } }, true);
}

/* ================= Отрисовка ================= */
function render() {
  save();
  if (typeof document === 'undefined') return;
  $('#title').innerHTML = esc(S.name) + `<small>${S.stage === 'setup' ? 'настройка турнира' : 'мастер микст · ' + S.players.length + ' игроков'}</small>`;
  $('#app').innerHTML = S.stage === 'setup' ? viewSetup() : viewRun();
  updateKb();
}

function viewSetup() {
  const s = S.settings;
  const p2 = S.players.filter(p => p.pos === 2).length, p4 = S.players.filter(p => p.pos === 4).length;
  const col = pos => {
    const list = S.players.filter(p => p.pos === pos), other = pos === 2 ? 4 : 2;
    return `<div><h3>${POS[pos]} <span class="cnt">${list.length}</span></h3>
      <div class="row"><textarea id="pl${pos}" rows="3" placeholder="Имена — по одному в строке" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))addPlayers(${pos})"></textarea>
      <button class="btn" onclick="addPlayers(${pos})">Добавить</button></div>
      <div class="chips">${list.map(p => `<span class="chip"><span onclick="renamePlayer('${p.id}')" title="Нажмите, чтобы переименовать" style="cursor:pointer">${esc(p.name)}</span><button onclick="setPos('${p.id}',${other})" title="Перевести в ${other}-й номер">⇄</button><button onclick="delPlayer('${p.id}')" title="Удалить">×</button></span>`).join('') || '<span class="muted">пока никого</span>'}</div></div>`;
  };
  return `
  <section class="card"><h2>Турнир</h2>
    <div class="row"><label style="flex:1">Название <input style="flex:1" value="${esc(S.name)}" onchange="S.name=this.value;render()"></label></div>
    <p class="muted">Каждая пара — один 2-й и один 4-й номер. Пары постоянно меняются. Проигравшая пара в этом составе больше не играет, а оба игрока продолжают в других составах.
    Следующая игра объявляется заранее и выходит на первый освободившийся корт, какими бы ни были результаты текущих игр: первыми выходят те, у кого меньше игр и кто дольше отдыхал, партнёры и соперники чередуются.
    Турнир заканчивается, когда из оставшихся пар уже нельзя собрать игру. Побеждает игрок с наибольшим числом побед.</p></section>

  <section class="card"><h2>1. Игроки</h2>
    <div class="pcols">${col(2)}${col(4)}</div>
    <p class="muted">Возможных пар: <b>${p2 * p4}</b>. Одновременно можно играть максимум на ${Math.max(1, Math.floor(Math.min(p2, p4) / 2))} корт(ах). Нажмите на имя, чтобы исправить его.</p>
  </section>

  <section class="card"><h2>2. Корты</h2>
    <div class="opts">
      <label>Кортов: <input type="number" min="1" max="20" value="${s.courts}" onchange="setS('courts',Math.max(1,+this.value||1))"></label>
    </div>
  </section>
  <button class="btn big" onclick="startTournament()">Начать турнир →</button>`;
}

function viewRun() {
  const tabs = { now: 'Сейчас', games: 'Все игры', stats: 'Статистика' };
  const body = S.tab === 'games' ? viewGames() : S.tab === 'stats' ? viewStats() : viewNow();
  return `<div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${S.tab === k ? 'on' : ''}" onclick="S.tab='${k}';render()">${v}</button>`).join('')}
    <span style="flex:1"></span><button class="cfg" onclick="backToSetup()" title="Настройка">⚙<span> Настройка</span></button></div>${body}`;
}

function sideHTML(pairId) {
  return `<span class="side">${pair(pairId).members.map(p => `<span class="pl">${esc(pName(p))}</span>`).join('<span class="amp">+</span>')}</span>`;
}
// игра в одну строку: Ваня+Миша / Коля+Петя
function vsHTML(m) { return `<div class="vs">${sideHTML(m.a)}<span class="sl">/</span>${sideHTML(m.b)}</div>`; }

function viewNow() {
  const I = info(), C = S.settings.courts;
  const done = S.matches.filter(m => m.result).length, alive = availPairs(I, new Set()).length;
  let html = '';
  if (isComplete()) {
    const p = places()[0];
    html += `<div class="banner">🏆 Турнир завершён! Победитель: ${esc((p ? p.ids : []).map(pName).join(', '))}</div>`;
  }
  let courts = '';
  for (let c = 1; c <= C; c++) {
    const m = S.matches.find(x => x.court === c);
    courts += m ? `<div class="court"><div class="ch"><span>Корт ${c}</span><span>Игра №${m.num}</span></div>
      ${vsHTML(m)}
      <div class="row"><button class="btn" onclick="openMatch('${m.id}')">Отметить победителей</button></div></div>`
      : `<div class="court free"><div class="ch"><span>Корт ${c}</span></div><div class="vs" style="font-size:15px">Свободен</div><div class="muted">${isComplete() ? 'турнир завершён' : 'нет свободных игроков для игры'}</div></div>`;
  }
  for (const m of S.matches.filter(x => !x.result && !x.court).sort(byTime)) courts += `<div class="court next"><div class="ch"><span>Следующая игра</span><span>Игра №${m.num}</span></div>
      ${vsHTML(m)}
      <div class="muted">Выйдут на первый освободившийся корт.</div></div>`;
  html += `<section class="card"><h2>На кортах</h2>
    <div class="row muted">Сыграно игр: <b>${done}</b> · Пар ещё в игре: <b>${alive}</b> из ${S.pairs.length}
      <span style="flex:1"></span><label>Кортов: <input type="number" min="1" max="20" value="${C}" onchange="setCourts(this.value)"></label></div>
    <div class="courts" style="margin-top:10px">${courts}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" onclick="shareTournament()">📲 Передать турнир на другой телефон</button></div></section>`;

  html += `<section class="card"><h2>Игроки</h2><div class="tblwrap"><table><thead><tr>
    <th class="nm">Игрок</th><th>Победы / поражения</th></tr></thead><tbody>
    ${ranking().map(r => `<tr><td class="nm">${esc(pName(r.id))}</td><td><b style="color:var(--win)">${r.w}</b> / ${r.l}</td></tr>`).join('')}
    </tbody></table></div></section>`;

  html += partnersCard(I);

  const rest = Object.values(I.P).filter(p => !I.busy.has(p.id));
  const resting = rest.filter(p => hasPairLeft(I, p.id)).sort((x, y) => x.g - y.g || x.last - y.last);
  const out = rest.filter(p => !hasPairLeft(I, p.id));
  if (resting.length || out.length) {
    html += `<section class="card"><h2>Отдыхают</h2>${resting.length ? `<ul class="qlist">${resting.map(p => {
      const pause = p.g ? Math.round((I.T - p.last) / Math.max(1, C)) : null;
      return `<li><span class="t">${esc(pName(p.id))} <span class="l">· ${player(p.id).pos}-й номер</span></span><span class="l">сыграно ${p.g}${pause !== null ? ` · пауза ${pause} ${pause === 1 ? 'тур' : 'тура(ов)'}` : ' · ещё не играл(а)'}</span></li>`;
    }).join('')}</ul>` : '<p class="muted">Все играют.</p>'}
    ${out.length ? `<h3>Закончили (все пары с их участием выбыли)</h3><p>${out.map(p => esc(pName(p.id))).join(', ')}</p>` : ''}</section>`;
  }

  const recent = S.matches.filter(m => m.result).sort((x, y) => (y.result.at || 0) - (x.result.at || 0)).slice(0, 6);
  if (recent.length) html += `<section class="card"><h2>Последние результаты</h2><ul class="qlist">${recent.map(m =>
    `<li><span class="n">№${m.num}</span><span class="t"><b>${esc(pairName(winnerPair(m)))}</b> победили ${esc(pairName(loserPair(m)))}</span>
    <button class="btn ghost sm" onclick="openMatch('${m.id}')">Изменить</button></li>`).join('')}</ul></section>`;
  return html;
}

// по каждому игроку — все возможные напарники; с кем проиграл — вычеркнуты
function partnersCard(I) {
  const pid = (x, y) => { const a = player(x), b = player(y); return a.pos === 4 ? 'pr_' + x + '_' + y : 'pr_' + y + '_' + x; };
  const boxes = ranking().map(r => {
    const me = player(r.id), mates = S.players.filter(p => p.pos !== me.pos);
    const left = mates.filter(p => !I.lost.has(pid(me.id, p.id))).length;
    return `<div class="pbox"><div class="ph"><b>${esc(me.name)}</b><span class="rec">${me.pos}-й · ${r.w}/${r.l}</span></div>
      <div class="mates">${mates.map(p => {
        const id = pid(me.id, p.id);
        if (I.lost.has(id)) return `<span class="mate out" title="проиграли вместе">${esc(p.name)}</span>`;
        return `<span class="mate">${esc(p.name)}</span>`;
      }).join('')}</div>
      <div class="muted" style="margin:4px 0 0">осталось напарников: ${left} из ${mates.length}</div></div>`;
  }).join('');
  return `<section class="card"><h2>Напарники</h2>
    <p class="muted">Зачёркнут — с этим напарником игрок проиграл, вместе они больше не играют.</p>
    <div class="pgrid">${boxes}</div></section>`;
}
function card(m) {
  const cls = side => !m.result ? '' : m.result.winner === side ? 'w' : 'l';
  const sc = side => m.result && m.result.winner === side ? '✓' : '';
  return `<div class="mc ${m.result ? '' : 'ready'}" onclick="openMatch('${m.id}')">
    <div class="mh"><span>Игра №${m.num}</span>${m.court ? `<span class="oncourt">Корт ${m.court}</span>` : m.result ? '' : '<span>ждёт корта</span>'}</div>
    <div class="tr"><span><span class="${cls('a')}">${sc('a') ? '✓ ' : ''}${esc(pairName(m.a))}</span> / <span class="${cls('b')}">${sc('b') ? '✓ ' : ''}${esc(pairName(m.b))}</span></span></div>
    </div>`;
}
function viewGames() {
  const ms = S.matches.slice().sort(byTime);
  return `<section class="card"><h2>Все игры <span class="cnt">${ms.length}</span></h2>
    <p class="muted">Новые игры появляются по мере освобождения кортов. Нажмите на игру, чтобы отметить или изменить победителей.</p>
    <div class="mgrid">${ms.map(card).join('')}</div></section>`;
}

function viewStats() {
  const I = info(), R = ranking(), pm = placeMap();
  const alive = id => S.pairs.filter(p => p.members.includes(id) && !I.lost.has(p.id)).length;
  let h = `<section class="card"><h2>Личный зачёт${isComplete() ? ' — итог' : ''}</h2><div class="tblwrap"><table><thead><tr>
    <th>Место</th><th class="nm">Игрок</th><th>Номер</th><th>Игр</th><th>Побед</th><th>Поражений</th><th>% побед</th><th>Пар в игре</th></tr></thead><tbody>
    ${R.map(r => { const g = r.w + r.l; return `<tr class="${pm[r.id] === 1 && g ? 'top' : ''}"><td><b>${pm[r.id]}</b></td><td class="nm">${esc(pName(r.id))}</td><td>${player(r.id).pos}</td>
      <td>${g}</td><td><b>${r.w}</b></td><td>${r.l}</td><td>${g ? Math.round(r.w / g * 100) + '%' : '—'}</td><td>${alive(r.id)}</td></tr>`; }).join('')}
    </tbody></table></div><p class="muted">Побеждает игрок с наибольшим числом побед. При равенстве — выше процент побед.</p></section>`;
  const p4 = S.players.filter(p => p.pos === 4), p2 = S.players.filter(p => p.pos === 2);
  h += `<section class="card"><h2>Пары: победы–поражения</h2><div class="tblwrap"><table class="cross"><thead><tr><th class="nm">4-й \\ 2-й</th>${p2.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
    ${p4.map(a => `<tr><td class="nm"><b>${esc(a.name)}</b></td>${p2.map(b => {
      const id = 'pr_' + a.id + '_' + b.id, w = I.pairW[id] || 0, l = I.pairL[id] || 0;
      return I.lost.has(id) ? `<td class="lost">✕ ${w}–${l}</td>` : `<td class="alive">${w || l ? w + '–' + l : '·'}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted">✕ — пара проиграла и в этом составе больше не выходит. «·» — пара ещё не играла.</p></section>`;
  return h;
}

// турнир, начатый в прошлой версии, — сразу объявляем следующую игру
if (S.stage === 'running' && S.matches) { try { planNext(S.matches.filter(m => m.court).length >= S.settings.courts); } catch (e) {} }
render();

/* ================= Передача турнира на другой телефон ================= */
// Весь турнир упаковывается в ссылку после «#» — эта часть ссылки не уходит ни на какой сервер.
const SHARE_V = 1;
function packState() {
  const pi = {}; S.pairs.forEach((p, i) => { pi[p.id] = i; });
  const ms = S.matches.slice().sort(byTime);
  return [SHARE_V, S.name, S.settings.courts, S.players.map(p => [p.id, p.name, p.pos]),
    ms.map(m => [m.num, m.time, pi[m.a], pi[m.b], m.court || 0, m.result ? (m.result.winner === 'a' ? 1 : 2) : 0]),
    S.statFin ? 1 : 0, S.tab];
}
function unpackState(d) {
  if (!Array.isArray(d) || d[0] !== SHARE_V) throw new Error('format');
  const [, name, courts, pl, ms, fin, tab] = d;
  const st = newState();
  st.name = String(name || 'Мастер микст'); st.settings.courts = Math.max(1, Math.min(20, +courts || 1));
  st.players = pl.map(([id, n, pos]) => ({ id: String(id), name: String(n), pos: pos === 4 ? 4 : 2 }));
  const p2 = st.players.filter(p => p.pos === 2), p4 = st.players.filter(p => p.pos === 4);
  for (const a of p4) for (const b of p2) st.pairs.push({ id: 'pr_' + a.id + '_' + b.id, members: [a.id, b.id] });
  const base = Date.now() - ms.length * 1000;
  st.matches = ms.map(([num, time, a, b, court, w]) => {
    if (!st.pairs[a] || !st.pairs[b]) throw new Error('pair');
    return { id: uid(), num, time, a: st.pairs[a].id, b: st.pairs[b].id, court: court || null,
      result: w ? { winner: w === 1 ? 'a' : 'b', sets: [], at: base + time * 1000 } : null };
  });
  st.stage = 'running'; st.tab = ['now', 'games', 'stats'].includes(tab) ? tab : 'now';
  st.statStart = 1; st.statFin = fin ? 1 : 0;   // для счётчика это тот же турнир, а не новый
  return st;
}
const b64u = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function streamBytes(bytes, T) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer()); }
async function encodeState() {
  const raw = new TextEncoder().encode(JSON.stringify(packState()));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64u(await streamBytes(raw, new CompressionStream('deflate-raw'))); } catch (e) {}
  }
  return 'u' + b64u(raw);
}
async function decodeState(str) {
  let bytes = unb64u(str.slice(1));
  if (str[0] === 'z') bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw'));
  else if (str[0] !== 'u') throw new Error('format');
  return unpackState(JSON.parse(new TextDecoder().decode(bytes)));
}
function shareLink(code) { return location.href.split('#')[0].split('?')[0] + '#t=' + code; }
async function shareTournament() {
  let url;
  try { url = shareLink(await encodeState()); } catch (e) { return toast(['Не удалось подготовить ссылку']); }
  let qr = '';
  try { const q = qrcode(0, 'L'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); } catch (e) {}
  const done = S.matches.filter(m => m.result).length;
  $('#modal').innerHTML = `<div class="dlg share">
    <h3>Передать турнир</h3>
    <p class="muted">Наведите камеру другого телефона на код — турнир откроется там с того же места (${S.players.length} игроков, сыграно игр: ${done}). Ставить приложение не нужно.</p>
    ${qr ? `<div class="qr">${qr}</div>` : '<p class="muted">QR-код не поместился — отправьте ссылку.</p>'}
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <button class="btn" onclick="sendLink()">Отправить ссылкой</button>
      <button class="btn ghost sm" onclick="closeModal()">Закрыть</button></div>
    <p class="muted" style="margin-top:10px">После передачи продолжайте отмечать игры на том телефоне. Здесь останется копия на текущий момент — она сама не обновляется. Вернуть турнир обратно можно так же.</p></div>`;
  $('#modal').dataset.url = url;
  $('#modal').classList.add('on');
}
async function sendLink() {
  const url = $('#modal').dataset.url; if (!url) return;
  if (navigator.share) { try { await navigator.share({ title: S.name, text: 'Турнир «' + S.name + '» — открыть и продолжить:', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast(['Ссылка скопирована — вставьте её в мессенджер']); }
  catch (e) { prompt('Скопируйте ссылку:', url); }
}
let incoming = null;
async function checkIncoming() {
  if (typeof location === 'undefined' || !location.hash.startsWith('#t=')) return;
  const code = location.hash.slice(3);
  try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) {}
  try { incoming = await decodeState(code); } catch (e) { return toast(['Ссылка на турнир повреждена или неполная — попросите прислать её ещё раз']); }
  const done = incoming.matches.filter(m => m.result).length;
  const mine = S.stage === 'running' && S.matches.some(m => m.result);
  $('#modal').innerHTML = `<div class="dlg">
    <h3>Принять турнир?</h3>
    <p><b>${esc(incoming.name)}</b><br>${incoming.players.length} игроков · сыграно игр: ${done}</p>
    ${mine ? '<p class="muted" style="color:var(--danger)">Турнир, который сейчас идёт на этом телефоне, будет заменён.</p>' : ''}
    <div class="row" style="justify-content:space-between">
      <button class="btn" onclick="acceptIncoming()">Принять</button>
      <button class="btn ghost sm" onclick="incoming=null;closeModal()">Отмена</button></div></div>`;
  $('#modal').classList.add('on');
}
function acceptIncoming() {
  if (!incoming) return;
  S = incoming; incoming = null; closeModal(); render();
  toast(['Турнир принят — продолжайте отмечать игры здесь']);
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('hashchange', checkIncoming);
  checkIncoming();
}

/* ================= Счётчик турниров =================
   Отправляется только «турнир начат / завершён» + число игроков и кортов.
   Ни имён, ни результатов, ни данных об устройстве. Без интернета событие ждёт в очереди. */
const STATS_URL = 'https://functions.yandexcloud.net/d4es919olmenclcq2ou3';   // адрес облачной функции; пусто — счётчик выключен
const STATS_Q = 'beachvb.statq';
function track(e, params) {
  if (!STATS_URL) return;
  let q = [];
  try { q = JSON.parse(localStorage.getItem(STATS_Q) || '[]'); } catch (x) {}
  q.push(Object.assign({ e }, params));
  try { localStorage.setItem(STATS_Q, JSON.stringify(q.slice(-50))); } catch (x) {}
  flushStats();
}
let statsBusy = false;
function flushStats() {
  if (!STATS_URL || statsBusy || typeof fetch === 'undefined') return;
  let q = [];
  try { q = JSON.parse(localStorage.getItem(STATS_Q) || '[]'); } catch (x) { return; }
  if (!q.length) return;
  statsBusy = true;
  fetch(STATS_URL + (STATS_URL.includes('?') ? '&' : '?') + new URLSearchParams(q[0]), { method: 'POST', mode: 'no-cors', keepalive: true })
    .then(() => {
      try { const cur = JSON.parse(localStorage.getItem(STATS_Q) || '[]'); cur.shift(); localStorage.setItem(STATS_Q, JSON.stringify(cur)); } catch (x) {}
      statsBusy = false; flushStats();
    })
    .catch(() => { statsBusy = false; });
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('online', flushStats);
  window.addEventListener('load', flushStats);
}

/* ================= PWA ================= */
// Android (Chrome и др.): своя кнопка «Установить» — ставит настоящее приложение, а не ярлык браузера.
let installEvt = null;
const INST_KEY = 'beachvb.inst';
function isStandalone() {
  try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; }
}
function installDismissed() { try { return localStorage.getItem(INST_KEY) === '0'; } catch (e) { return false; } }
function showInstall(manual) {
  const box = document.querySelector('#install');
  if (!box || isStandalone() || installDismissed()) return;
  document.querySelector('#install-txt').textContent = manual
    ? 'Меню браузера ⋮ → «Установить приложение» (не «Добавить ярлык»)'
    : 'Отдельное окно без браузера, работает офлайн';
  document.querySelector('#install-btn').hidden = !!manual;
  box.hidden = false;
}
function hideInstall(forever) {
  const box = document.querySelector('#install');
  if (box) box.hidden = true;
  if (forever) { try { localStorage.setItem(INST_KEY, '0'); } catch (e) {} }
}
function doInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  installEvt.userChoice.then(r => { if (r && r.outcome === 'accepted') hideInstall(); }).catch(() => {});
  installEvt = null;
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(false); });
  window.addEventListener('appinstalled', () => hideInstall(true));
  // Android-браузер без такого события (Яндекс, Samsung и др.) — подсказка, где найти установку
  window.addEventListener('load', () => setTimeout(() => {
    if (!installEvt && /Android/i.test(navigator.userAgent || '')) showInstall(true);
  }, 6000));
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
