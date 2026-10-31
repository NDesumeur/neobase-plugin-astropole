// Astropole : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Astropole</span><span class=\"hint\" id=\"ciInfo\"></span><div class=\"agNav\"><span class=\"row\" id=\"ciBuy\"><button class=\"btn px\" data-k=\"1\">×1</button><button class=\"btn px\" data-k=\"10\">×10</button><button class=\"btn px\" data-k=\"100\">×100</button><button class=\"btn px\" data-k=\"max\">MAX</button></span><button class=\"btn main px\" id=\"ciColony\" title=\"Tout recommencer avec des Mémoires qui multiplient la production\">NOUVELLE COLONIE</button></div></div>\n      <div class=\"gameBox g169\"><canvas id=\"ciCanvas\" width=\"384\" height=\"216\"></canvas></div>\n      <div class=\"ciList\" id=\"ciList\"></div>\n      <div class=\"hint\">La ville produit des crédits chaque seconde, même quand NeoBase est fermé : à l'ouverture, tout le temps passé est compté (depuis la dernière sauvegarde, sur n'importe lequel de tes PC). Achète des bâtiments ; tous les 25 d'un même bâtiment, sa production double, et chaque nouveau type en débloque un autre, sans fin (après les 16 premiers viennent les mégastructures). Clic sur la ville : 1 seconde de production ; clic sur un cargo doré : 30 secondes. Après 1 billion de crédits produits, « Nouvelle colonie » recommence tout avec des Mémoires (+10 % de production chacune, pour toujours). Les nombres n'ont pas de limite. Sauvegardé et synchronisé.</div>\n    </div>";
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  view.innerHTML = HTML;
  const $ = id => id === "cityApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":["city"],"best":"^$"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const mixc = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

/* ---------- jeu "Astropole": an idle space city. Buildings make crédits every second, even when NeoBase is closed (on opening, the time
   spent away is counted from the last save, on whichever PC). Numbers are kept as their log10, so they can grow without limit, and the
   building tiers never end (after the 16 named ones come numbered megastructures). Every 25 of a building doubles it; "Nouvelle colonie"
   starts over with Mémoires that multiply everything. Saved in games.city (synced). ---------- */
const CI = {W: 384, H: 216, R: Math.log10(1.15),
  names: ['Module d\'habitat', 'Serre hydroponique', 'Champ solaire', 'Mine d\'astéroïdes', 'Raffinerie de glace', 'Chantier naval', 'Laboratoire orbital', 'Port spatial',
    'Anneau d\'habitation', 'Ascenseur spatial', 'Forge stellaire', 'Essaim de Dyson', 'Portail de saut', 'Cerveau-planète', 'Moteur à trou noir', 'Architecte du vide'],
  cols: ['#7fe0ee', '#5fd08a', '#ffd07a', '#a08a70', '#c9e8ff', '#8f8fa8', '#b46aee', '#ff8ae6', '#4f9fe0', '#e8e4d0', '#ff7a4f', '#ffc23a', '#ff5ad9', '#8ee8a0', '#6a3ad0', '#ffffff'],
};
// big numbers: x is stored as log10(x), -Infinity is 0
const LG = {
  add: (a, b) => { if (a === -Infinity) return b; if (b === -Infinity) return a; const m = Math.max(a, b); return m + Math.log10(1 + 10 ** (Math.min(a, b) - m)); },
  sub: (a, b) => { if (b === -Infinity) return a; const d = b - a; return d >= 0 ? -Infinity : a + Math.log10(1 - 10 ** d); },  // a - b, never below 0
  of: x => x > 0 ? Math.log10(x) : -Infinity,
};
const CI_SUF = ['million', 'milliard', 'billion', 'billiard', 'trillion', 'trilliard', 'quadrillion', 'quadrilliard', 'quintillion', 'quintilliard'];
function ciFmt(L) {
  if (L === -Infinity || L < 0) return L === -Infinity ? '0' : (10 ** L).toFixed(1).replace('.', ',');
  if (L < 6) return Math.floor(10 ** L + 1e-9).toLocaleString('fr-FR');
  if (L < 36) { const i = Math.floor((L - 6) / 3); return (10 ** (L - 6 - i * 3)).toFixed(2).replace('.', ',') + ' ' + CI_SUF[i] + (10 ** (L - 6 - i * 3) >= 2 ? 's' : ''); }
  if (L < 1e6) return (10 ** (L % 1)).toFixed(2).replace('.', ',') + 'e' + Math.floor(L).toLocaleString('fr-FR');
  return 'e' + ciFmt(Math.log10(L));  // a number of digits so large it is itself written short
}
const ROMAN = n => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const ciName = i => CI.names[i] || 'Mégastructure ' + ROMAN(i - CI.names.length + 1);
const ciCost0 = i => 1 + i * 1.25 + i * i * .04;              // log10 of the first one's price
const ciProd0 = i => ciCost0(i) - 2 - i * .18;                 // log10 of what one makes a second
const ciSave = () => gstore('city', {cr: 1, run: 1, all: 1, b: [], mem: -Infinity, colonies: 0, last: Date.now(), clicks: 0, ships: 0, buy: 1});
// JSON has no -Infinity: it is saved as null
const ciL = v => v == null ? -Infinity : v;
const ciMult = () => LG.of(1 + .1 * 10 ** Math.min(300, ciL(ciSave().mem))) + (ciL(ciSave().mem) > 300 ? ciL(ciSave().mem) - 300 : 0);
const ciProdOf = (i, n = ciSave().b[i] || 0) => n ? ciProd0(i) + Math.log10(n) + Math.floor(n / 25) * Math.log10(2) + ciMult() : -Infinity;
const ciProd = () => (ciSave().b.length ? ciSave().b : [0]).reduce((L, n, i) => LG.add(L, ciProdOf(i, n)), -Infinity);
const ciCost = (i, k = 1) => { const n = ciSave().b[i] || 0; return ciCost0(i) + n * CI.R + (k > 200 ? k * CI.R - Math.log10(.15) : Math.log10((1.15 ** k - 1) / .15)); };  // k more, in one go
function ciMaxBuy(i) {
  const s = ciSave(), x = ciL(s.cr) - ciCost0(i) - (s.b[i] || 0) * CI.R + Math.log10(.15);
  return Math.max(0, Math.floor((x > 15 ? x : Math.log10(1 + 10 ** x)) / CI.R + 1e-9));
}
const ciTiers = () => Math.min((ciSave().b.length || 0) + 1, Math.max(1, ciSave().b.findLastIndex(n => n > 0) + 2));  // the next tier shows once the last one has one
// the time spent away: everything the city made since the last save
function ciCatchUp(now = Date.now()) {
  const s = ciSave(), dt = Math.max(0, (now - s.last) / 1000); s.last = now;
  if (!dt) return -Infinity;
  const got = ciProd() + Math.log10(dt);
  ciGain(got); return got;
}
function ciGain(L) { const s = ciSave(); s.cr = LG.add(ciL(s.cr), L); s.run = LG.add(ciL(s.run), L); s.all = LG.add(ciL(s.all), L); }
function ciBuy(i, k) {
  const s = ciSave(); k = k === 'max' ? ciMaxBuy(i) : k; if (!k) return false;
  const c = ciCost(i, k); if (c > ciL(s.cr) + 1e-9) return false;
  s.cr = LG.sub(ciL(s.cr), c); s.b[i] = (s.b[i] || 0) + k;
  sfx('click'); ciUi(); return true;
}
// a new colony: start again from nothing, with Mémoires (square root of what this run made, past a trillion)
const ciMemGain = () => { const L = ciL(ciSave().run); return L >= 12 ? (L - 12) / 2 : -Infinity; };
async function ciColony() {
  const g = ciMemGain(); if (g < 0) return toast('Il faut avoir produit 1 billion de crédits dans cette colonie', true);
  if (await ask('Fonder une nouvelle colonie ?', 'oui', 'Tout repart de zéro, mais tu gagnes ' + ciFmt(g) + ' Mémoires (+10 % de production chacune). Tape « oui ».') !== 'oui') return;
  const s = ciSave(); s.mem = LG.add(ciL(s.mem), g); s.colonies++; s.b = []; s.cr = 1; s.run = 1;
  ci.flash = 40; sfx('launch'); ciUi(); saveGames();
}
let ci = null;
function ciOpen() {
  const s = ciSave(), away = (Date.now() - s.last) / 1000, got = ciCatchUp();
  if (away > 60 && got > 0) toast('Pendant ton absence (' + fmtAway(away) + '), Astropole a produit ' + ciFmt(got) + ' crédits');
  ci ??= {raf: 0, g: $('ciCanvas').getContext('2d'), tick: 0, ships: [], pops: [], flash: 0}; ci.mode = 'play';
  saveGames(); ciUi(); gameLoop(ci, 'neodyme:city', ciUpdate, ciDraw);
}
const fmtAway = s => s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h ' + String(Math.round(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 86400) + ' j ' + Math.floor(s % 86400 / 3600) + ' h';
function ciUpdate() {
  if (ci.mode !== 'play') return;
  if (ci.tick % 6 === 0) ciCatchUp();
  if (ci.tick % 30 === 0) ciUi(true);
  if (ci.tick % 600 === 0) saveGames();
  if (ci.flash) ci.flash--;
  // a cargo ship crosses the sky now and then: clicking it brings 30 s of production
  if (!ci.ships.some(sh => sh.cargo) && Math.random() < 1 / 2400) ci.ships.push({cargo: true, x: -20, y: 20 + Math.random() * 40, v: .6});
  if (ci.tick % 50 === 0 && ci.ships.length < 6) ci.ships.push({x: Math.random() < .5 ? -10 : CI.W + 10, y: 50 + Math.random() * 60, v: 0});
  for (const sh of ci.ships) { if (!sh.v) sh.v = sh.x < 0 ? .4 + Math.random() * .5 : -.4 - Math.random() * .5; sh.x += sh.v; }
  ci.ships = ci.ships.filter(sh => sh.x > -30 && sh.x < CI.W + 30);
  for (const p of ci.pops) { p.y -= .4; p.t--; } ci.pops = ci.pops.filter(p => p.t > 0);
}
/* ---------- drawing: the city grows with each tier, the sky changes with the colonies ---------- */
function ciDraw() {
  const g = ci.g, t = ci.tick, s = ciSave(), W = CI.W, H = CI.H, ground = 176;
  const sky = ['#0b031c', '#06121f', '#140320', '#031a14'][s.colonies % 4];
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const r = seeded(5 + s.colonies); for (let i = 0; i < 90; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * ground); px(g, (i + (t >> 5)) % 11 ? 'rgba(217,198,255,.35)' : '#ffffff', x, y); }
  // a planet in the sky, a ring once there are many tiers
  const pc = CI.cols[s.colonies % CI.cols.length]; for (let dy = -18; dy <= 18; dy++) { const w = Math.round(Math.sqrt(324 - dy * dy)); px(g, dy < -6 ? pc : mixc(pc, sky, .45), 320 - w, 40 + dy, w * 2, 1); }
  if (s.b.length > 6) { g.strokeStyle = '#ffd07a88'; g.beginPath(); g.ellipse(320, 40, 30, 6, -.3, 0, Math.PI * 2); g.stroke(); }
  // ground
  px(g, '#2a1f50', 0, ground, W, H - ground); px(g, '#3a2a6e', 0, ground, W, 2);
  for (let x = 0; x < W; x += 16) px(g, '#1c1238', x + (x * 7) % 11, ground + 8 + (x * 3) % 20, 6, 2);
  // one row of structures per tier: more of them as you own more (1, 2, 4, 8 … shown by the log of the count)
  s.b.forEach((n, i) => {
    if (!n) return;
    const k = Math.min(10, 1 + Math.floor(Math.log2(n))), col = CI.cols[i % CI.cols.length], kind = i % 8, rr = seeded(i * 31 + 7);
    for (let j = 0; j < k; j++) {
      const x = Math.floor(rr() * (W - 30)) + 6, h = 10 + Math.floor(rr() * 18) + Math.min(60, i * 4), y = ground - h;
      if (kind === 0) { px(g, col, x, ground - 8, 14, 8); px(g, '#ffffff', x + 4, ground - 12, 6, 4); }                                  // dome module
      else if (kind === 1) { px(g, '#5fd08a55', x, ground - 12, 18, 12); px(g, col, x + 2, ground - 6, 14, 2); px(g, '#ffffff33', x, ground - 12, 18, 1); }  // greenhouse
      else if (kind === 2) { for (let q = 0; q < 3; q++) px(g, '#4f9fe0', x + q * 6, ground - 6, 5, 3); px(g, col, x, ground - 3, 17, 1); }    // solar field
      else if (kind === 3) { px(g, '#8f8fa8', x + 4, y, 4, h); px(g, col, x, y, 12, 3); px(g, '#4a4a60', x + 1, ground - 6, 10, 6); }          // mine tower
      else if (kind === 4) { px(g, col, x, y + 6, 10, h - 6); px(g, '#ffffff', x + 2, y + 6, 6, 2); px(g, '#8f8fa8', x + 4, y, 2, 6); }        // refinery
      else if (kind === 5) { px(g, '#5a5470', x, y, 2, h); px(g, '#5a5470', x + 16, y, 2, h); px(g, '#5a5470', x, y, 18, 2); px(g, col, x + 5, ground - 10, 8, 10); }  // shipyard crane
      else if (kind === 6) { px(g, col, x + 3, y, 8, h); px(g, '#ffffff', x + 1, y + 4, 12, 3); for (let q = 6; q < h - 2; q += 5) px(g, '#ffd07a', x + 5, y + q, 2, 2); }  // tower
      else { px(g, col, x + 6, y - 20, 2, h + 20); px(g, '#ffffff', x + 2, y - 22, 10, 2); }                                            // spire
      if ((t + j * 40 + i * 13) % 160 < 80) px(g, '#ffd07a', x + 6, y - (kind === 7 ? 23 : 1), 1, 1);  // blinking light
    }
  });
  for (const sh of ci.ships) {
    if (sh.cargo) { px(g, '#ffd07a', sh.x, sh.y, 16, 5); px(g, '#ffffff', sh.x + 11, sh.y + 1, 4, 2); px(g, '#ff7a4f', sh.x - 3 - (t >> 2) % 2, sh.y + 1, 3, 3); }
    else { px(g, '#d9c6ff', sh.x, sh.y, 5, 2); px(g, '#7fe0ee', sh.x + (sh.v > 0 ? -2 : 5), sh.y, 2, 2); }
  }
  for (const p of ci.pops) { g.fillStyle = '#ffd07a'; g.font = '7px "Press Start 2P", monospace'; g.fillText(p.text, p.x, p.y); }
  if (ci.flash) { g.fillStyle = `rgba(255,208,244,${ci.flash / 50})`; g.fillRect(0, 0, W, H); }
  // the counter
  g.fillStyle = 'rgba(11,3,28,.6)'; g.fillRect(0, 0, W, 26);
  g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#ffd07a'; g.fillText(ciFmt(ciL(s.cr)) + ' ⌬', 8, 12);
  g.font = '6px "Press Start 2P", monospace'; g.fillStyle = '#d9c6ff'; g.fillText('+' + ciFmt(ciProd()) + ' / s', 8, 22);
  g.textAlign = 'right'; g.fillText('COLONIE ' + (s.colonies + 1) + (ciL(s.mem) > -Infinity ? ' · ' + ciFmt(ciL(s.mem)) + ' MÉMOIRES' : ''), W - 8, 12); g.textAlign = 'left';
}
/* ---------- page: the list of buildings ---------- */
function ciUi(soft) {
  const s = ciSave(), list = $('ciList'), n = ciTiers(), k = s.buy;
  $('ciInfo').textContent = ciFmt(ciL(s.cr)) + ' crédits · ' + ciFmt(ciProd()) + ' / s · ' + s.b.reduce((a, b) => a + (b || 0), 0) + ' bâtiments · colonie ' + (s.colonies + 1) + ' · Mémoires ' + ciFmt(ciL(s.mem)) + ' (×' + ciFmt(LG.of(10 ** Math.min(300, ciMult()))) + ') · total produit ' + ciFmt(ciL(s.all));
  const mg = ciMemGain(); $('ciColony').textContent = mg >= 0 ? 'NOUVELLE COLONIE (+' + ciFmt(mg) + ' MÉM.)' : 'NOUVELLE COLONIE'; $('ciColony').disabled = mg < 0;
  [...$('ciBuy').children].forEach(b => b.classList.toggle('main', b.dataset.k === String(k)));
  if (!soft || list.children.length !== n) list.replaceChildren(...Array.from({length: n}, (_, i) => {
    const row = el('div', 'ciRow px'), b = el('button', 'btn px ciBtn'); b.dataset.i = i;
    row.append(Object.assign(el('span', 'ciDot'), {style: 'background:' + CI.cols[i % CI.cols.length]}), el('div', 'ciTxt'), b);
    b.onclick = () => { ciBuy(i, s.buy === 'max' ? 'max' : s.buy); b.blur(); };
    return row;
  }));
  [...list.children].forEach((row, i) => {
    const have = s.b[i] || 0, kk = k === 'max' ? Math.max(1, ciMaxBuy(i)) : k, c = ciCost(i, kk), next = 25 - have % 25;
    row.children[1].replaceChildren(el('b', '', ciName(i) + ' · ' + have), el('small', '', (have ? ciFmt(ciProdOf(i)) + ' / s' : 'chacun ' + ciFmt(ciProd0(i) + ciMult()) + ' / s') + ' · ×2 dans ' + next + (kk > 1 ? ' · achat ×' + kk.toLocaleString('fr-FR') : '')));
    const btn = row.children[2]; btn.textContent = ciFmt(c); btn.disabled = c > ciL(s.cr) + 1e-9;
  });
}
$('ciBuy').onclick = e => { const k = e.target.dataset?.k; if (!k) return; ciSave().buy = k === 'max' ? 'max' : +k; ciUi(); e.target.blur(); };
$('ciColony').onclick = () => { ciColony(); $('ciColony').blur(); };
$('ciCanvas').onpointerdown = e => {
  const cv = $('ciCanvas'), r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * CI.W / r.width, y = (e.clientY - r.top) * CI.H / r.height;
  const ship = ci.ships.find(sh => sh.cargo && Math.abs(x - sh.x - 8) < 14 && Math.abs(y - sh.y - 2) < 10);
  const got = ship ? Math.max(1, ciProd() + Math.log10(30)) : Math.max(0, LG.add(0, ciProd()));  // a click: 1 crédit + 1 s of production
  ciGain(got); ciSave().clicks++; if (ship) { ship.cargo = false; ship.v *= 3; ciSave().ships++; sfx('notify'); }
  ci.pops.push({text: '+' + ciFmt(got), x: Math.min(CI.W - 60, x), y, t: 40}); ciUi(true);
};
{  // self-check of the big numbers and the prices
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  console.assert(near(LG.add(2, 2), 2 + Math.log10(2)) && LG.sub(2, 2) === -Infinity && near(LG.sub(3, 2), Math.log10(900)) && ciFmt(Math.log10(1234)) === (1234).toLocaleString('fr-FR')
    && ciFmt(9) === '1,00 milliard' && ciFmt(40.5).startsWith('3,16e40') && ciFmt(2e6).startsWith('e2,00 million') && ROMAN(14) === 'XIV'
    && near(ciCost0(0), 1) && near(Math.log10((1.15 ** 3 - 1) / .15), Math.log10(1 + 1.15 + 1.3225)), 'astropole numbers');
}  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { ciOpen(); });
}
