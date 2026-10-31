// Astropole : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Astropole</span><span class=\"hint\" id=\"ciInfo\"></span><div class=\"agNav\"><span class=\"row\" id=\"ciBuy\"><button class=\"btn px\" data-k=\"1\">×1</button><button class=\"btn px\" data-k=\"10\">×10</button><button class=\"btn px\" data-k=\"100\">×100</button><button class=\"btn px\" data-k=\"max\">MAX</button></span><button class=\"btn main px\" id=\"ciColony\" title=\"Tout recommencer avec des Mémoires qui multiplient la production\">NOUVELLE COLONIE</button></div></div>\n      <div class=\"gameBox g169\"><canvas id=\"ciCanvas\" width=\"384\" height=\"216\"></canvas></div>\n      <div class=\"ciList\" id=\"ciList\"></div>\n      <div class=\"hint\">La ville produit des crédits chaque seconde, même quand NeoBase est fermé : à l'ouverture, tout le temps passé est compté (depuis la dernière sauvegarde, sur n'importe lequel de tes PC). Achète des bâtiments ; tous les 25 d'un même bâtiment, sa production double, et chaque nouveau type en débloque un autre, sans fin (après les 16 premiers viennent les mégastructures). Clic sur la ville : 1 seconde de production ; clic sur un cargo doré : 30 secondes. Après 1 billion de crédits produits, « Nouvelle colonie » recommence tout avec des Mémoires (+10 % de production chacune, pour toujours). Les nombres n'ont pas de limite. Sauvegardé et synchronisé.</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gameBox{display:grid;place-items:center;padding:10px;background:#05010b;box-shadow:0 0 0 3px var(--line2)}
.ciList{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:8px}
.ciRow{--fill:var(--win);display:flex;align-items:center;gap:10px;padding:8px 10px}
.ciRow{border-left:4px solid var(--c,#7fe0ee)}
.ciIcon{width:51px;height:45px;flex:none;image-rendering:pixelated;background:linear-gradient(#0b031c,#2a1d52);box-shadow:inset 0 0 0 2px var(--line2)}
.ciBar{height:4px;background:#2a1d52;margin-top:4px}.ciBar i{display:block;height:100%;background:var(--c,#7fe0ee)}
.ciTxt b{font-size:15px}
.ciTxt{flex:1;display:flex;flex-direction:column;min-width:0}
.ciTxt small{color:var(--muted)}
.ciBtn{flex:none;min-width:110px;font-size:12px;white-space:nowrap}
.gameBox canvas{width:min(100%,1152px);aspect-ratio:384/144;image-rendering:pixelated;cursor:var(--cp,pointer)}
.gameBox.tall canvas{width:auto;height:min(720px,72vh);aspect-ratio:240/320}
.gameBox.g169 canvas{aspect-ratio:384/216;width:min(100%,calc((100vh - 250px) * 1.777))}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
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
const ciHash = (a, b = 0, c = 0) => { let h = Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1274126177, 2246822519) ^ Math.imul(c + 3266489917, 3266489917); h = Math.imul(h ^ h >>> 13, 1274126177); return (h ^ h >>> 16) >>> 0; };
const ciShade = (c, k) => k >= 0 ? mixc(c, '#ffffff', k) : mixc(c, '#000000', -k);
const ciRgba = (hex, a) => 'rgba(' + [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(',') + ',' + a + ')';
function ciBlk(g, x, y, w, h, col) {  // un volume : contour sombre, face éclairée à gauche, ombre à droite
  px(g, '#0d0620', x - 1, y - 1, w + 2, h + 2); px(g, col, x, y, w, h); px(g, ciShade(col, .3), x, y, 1, h); px(g, ciShade(col, .2), x, y, w, 1); px(g, ciShade(col, -.35), x + w - 1, y, 1, h);
}
function ciWins(g, x, y, w, h, seed, t) {  // des fenêtres, certaines allumées, une qui clignote de temps en temps
  for (let yy = y + 2; yy + 2 <= y + h - 1; yy += 4) for (let xx = x + 2; xx + 2 <= x + w - 3; xx += 4) { const hv = ciHash(seed, xx, yy); px(g, hv % 7 < 4 ? (hv % 53 === (t >> 6) % 53 ? '#fff6c8' : '#ffd07a') : '#241a48', xx, yy, 2, 2); }
}
// 8 familles de bâtiments : largeur et dessin (x = bord gauche, b = sol, h = hauteur, col = couleur du palier, s = graine, t = temps)
const CI_W = [22, 22, 24, 16, 20, 22, 10, 10];
const CI_ART = [
  (g, x, b, h, col, s, t) => {  // module d'habitat : dôme de verre sur une dalle
    const r = 10; ciBlk(g, x, b - 3, 22, 3, '#4a3c86');
    for (let dy = 0; dy < r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)), y = b - 4 - dy; px(g, '#0d0620', x + 11 - hw - 1, y, 1, 1); px(g, '#0d0620', x + 11 + hw, y, 1, 1); px(g, ciShade(col, .5 - dy / r * .5), x + 11 - hw, y, hw * 2, 1); }
    px(g, '#0d0620', x + 5, b - 4 - r, 12, 1); px(g, '#ffffff', x + 5, b - 12, 2, 1); px(g, '#ffffff', x + 4, b - 11, 1, 2);
    for (let k = 0; k < 4; k++) px(g, ciHash(s, k) % 3 ? '#ffd07a' : '#241a48', x + 5 + k * 4, b - 7, 2, 3);
  },
  (g, x, b, h, col, s, t) => {  // serre hydroponique
    ciBlk(g, x, b - 11, 22, 11, '#2f6a52'); for (let k = 0; k < 5; k++) { px(g, k % 2 ? '#8ee8a0' : '#5fd08a', x + 2 + k * 4, b - 9, 3, 7); px(g, '#2a8a4a', x + 2 + k * 4, b - 3, 3, 2); }
    px(g, '#c8ffe0', x + 1, b - 11, 20, 1); px(g, '#ffffff', x + 3 + (t >> 4) % 14, b - 10, 1, 4);
  },
  (g, x, b, h, col, s, t) => {  // champ solaire
    for (let q = 0; q < 3; q++) { const px0 = x + q * 8; px(g, '#5a5470', px0 + 3, b - 5, 2, 5); ciBlk(g, px0, b - 10, 7, 5, '#2f6bc0'); px(g, '#1d4f9a', px0 + 3, b - 10, 1, 5); px(g, '#1d4f9a', px0, b - 8, 7, 1); px(g, '#cfe8ff', px0 + (q * 2 + (t >> 3)) % 6, b - 9, 1, 3); }
  },
  (g, x, b, h, col, s, t) => {  // mine d'astéroïdes : grue et benne
    ciBlk(g, x, b - 6, 16, 6, '#4a4a60'); ciBlk(g, x + 10, b - h, 4, h - 6, '#6a6a84'); px(g, '#0d0620', x, b - h - 1, 15, 4); px(g, '#e0b860', x + 1, b - h, 13, 2);
    const sw = Math.round(Math.sin(t / 30 + s) * 2); px(g, '#222', x + 3 + sw, b - h + 2, 1, 9); ciBlk(g, x + 1 + sw, b - h + 10, 5, 3, '#a08a70'); px(g, '#a08a70', x - 4, b - 3, 4, 3); px(g, '#6a5a48', x - 6, b - 1, 6, 1);
  },
  (g, x, b, h, col, s, t) => {  // raffinerie de glace : deux cuves et une cheminée qui fume
    ciBlk(g, x, b - h + 4, 8, h - 4, '#c9e8ff'); ciBlk(g, x + 8, b - h + 10, 6, h - 10, '#a8d0f0'); px(g, '#6aa0d0', x + 1, b - h + 9, 6, 1); px(g, '#6aa0d0', x + 1, b - h + 15, 6, 1);
    ciBlk(g, x + 15, b - h - 6, 4, h + 6, '#8f8fa8'); px(g, '#ff5a5a', x + 15, b - h - 6, 4, 2); px(g, '#ff5a5a', x + 15, b - h, 4, 2);
    for (let k = 0; k < 4; k++) { const u = ((t >> 1) + k * 9) % 36; px(g, ciRgba('#e6e0ff', .55 - u / 80), x + 16 + Math.round(Math.sin(u / 6 + k) * 2), b - h - 8 - u / 2 | 0, 2, 2); }
  },
  (g, x, b, h, col, s, t) => {  // chantier naval : portique et coque en construction
    px(g, '#0d0620', x - 1, b - h - 1, 24, 4); px(g, '#6a6490', x, b - h, 22, 2); ciBlk(g, x, b - h + 2, 2, h - 2, '#6a6490'); ciBlk(g, x + 20, b - h + 2, 2, h - 2, '#6a6490');
    ciBlk(g, x + 4, b - 9, 14, 6, col); px(g, '#ffffff', x + 14, b - 8, 3, 2); px(g, ciShade(col, -.4), x + 5, b - 4, 12, 1); px(g, '#ffd07a', x + 2, b - 3, 18, 1);
    if ((t >> 3) % 3) px(g, '#fff6c8', x + 5 + (t >> 2) % 10, b - 10, 2, 2);
  },
  (g, x, b, h, col, s, t) => {  // laboratoire : tour vitrée, parabole, balise
    ciBlk(g, x, b - h, 10, h, col); ciWins(g, x, b - h, 10, h, s, t); px(g, '#c0c0d0', x + 4, b - h - 8, 1, 8); px(g, '#dddde8', x + 6, b - h - 5, 3, 2); px(g, (t >> 4) % 2 ? '#ff4f6d' : '#5a1020', x + 4, b - h - 9, 1, 1);
  },
  (g, x, b, h, col, s, t) => {  // flèche de lumière
    ciBlk(g, x + 3, b - h, 4, h, col); for (let k = 0; k < 3; k++) px(g, '#ffffff', x + (k % 2), b - h + 8 + k * 12, 10 - (k % 2) * 2, 2);
    const glow = (t >> 3) % 2; px(g, ciShade(col, .6), x + 4, b - h - 10, 2, 10); px(g, glow ? '#ffffff' : '#ffd07a', x + 4, b - h - 11, 2, 2);
  },
];
function ciPaint(g, i, x, b, h, t, seed) { CI_ART[i % 8](g, x, b, h, CI.cols[i % CI.cols.length], seed, t); }
function ciPlanet(pc, sky) {  // la planète, dessinée une fois : bandes, ombre, cratères
  const key = pc + sky; if (ci.planet?.key === key) return ci.planet.cv;
  const cv = document.createElement('canvas'), R = 22; cv.width = cv.height = R * 2 + 14; const g = cv.getContext('2d');
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy); if (d > R) continue;
    const lit = (-dx * .6 - dy * .8) / R, band = Math.sin(dy / 2.6 + Math.sin(dx / 9)) * .08;
    let c = mixc(pc, '#ffffff', Math.max(0, lit) * .35 + band); if (lit < -.1) c = mixc(c, sky, Math.min(.85, -lit * .9)); if (d > R - 1.2) c = mixc(c, sky, .35);
    px(g, c, dx + R + 7, dy + R + 7);
  }
  for (const [cx, cy, cr] of [[-8, -4, 3], [6, 8, 4], [4, -12, 2]]) for (let dy = -cr; dy <= cr; dy++) for (let dx = -cr; dx <= cr; dx++) if (Math.hypot(dx, dy) <= cr && Math.hypot(cx + dx, cy + dy) < R - 2) px(g, mixc(pc, sky, .35), cx + dx + R + 7, cy + dy + R + 7);
  ci.planet = {key, cv}; return cv;
}
function ciDraw() {
  const g = ci.g, t = ci.tick, s = ciSave(), W = CI.W, H = CI.H, ground = 176;
  const sky = ['#0b031c', '#06121f', '#140320', '#031a14'][s.colonies % 4], glow = ['#4a1f7a', '#0f4a6a', '#6a1f5a', '#0f6a4a'][s.colonies % 4];
  // le ciel : bandes qui s'éclairent vers l'horizon
  for (let y = 0; y < ground; y += 4) px(g, mixc(sky, glow, Math.pow(y / ground, 3) * .75), 0, y, W, 4);
  const r = seeded(5 + s.colonies); for (let i = 0; i < 100; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * (ground - 20)), tw = (i * 7 + (t >> 4)) % 13; px(g, tw === 0 ? '#ffffff' : tw < 3 ? 'rgba(217,198,255,.25)' : 'rgba(217,198,255,.55)', x, y); }
  if (ci.meteor) { const m = ci.meteor; for (let k = 0; k < 10; k++) px(g, ciRgba('#ffffff', .8 - k * .08), m.x - k * 2, m.y - k, 1, 1); m.x += 3; m.y += 1.5; if (m.x > W + 20) ci.meteor = null; } else if (Math.random() < 1 / 900) ci.meteor = { x: Math.random() * 200, y: Math.random() * 50 };
  // une planète (avec son anneau quand il y a beaucoup de paliers)
  const pc = CI.cols[s.colonies % CI.cols.length];
  if (s.b.length > 6) { g.strokeStyle = 'rgba(255,208,122,.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(322, 44, 36, 8, -.35, Math.PI, Math.PI * 2); g.stroke(); }
  g.drawImage(ciPlanet(pc, sky), 322 - 29, 44 - 29);
  if (s.b.length > 6) { g.beginPath(); g.ellipse(322, 44, 36, 8, -.35, 0, Math.PI); g.stroke(); }
  // la skyline lointaine
  const rs = seeded(77 + s.colonies); for (let x = 0; x < W; x += 6) { const h = 6 + Math.floor(rs() * 22); px(g, mixc(sky, glow, .35), x, ground - h, 6, h); if (rs() < .5) px(g, 'rgba(255,208,122,.5)', x + 2, ground - h + 3 + Math.floor(rs() * 4), 1, 1); }
  // le sol : plateforme, route avec lampadaires, véhicules
  px(g, '#1c1238', 0, ground, W, H - ground); px(g, '#3a2a6e', 0, ground, W, 2); px(g, '#2a1f50', 0, ground + 2, W, 6);
  for (let x = 0; x < W; x += 24) { px(g, '#3a2a6e', x, ground + 8, 1, H - ground - 8); }
  px(g, '#120a26', 0, 204, W, 8); for (let x = 0; x < W; x += 12) px(g, '#6a5aa0', x + (t >> 2) % 12, 207, 5, 1);
  // les bâtiments, sur trois plans (le plus lointain est noyé dans la brume du ciel)
  const items = []; const maxK = Math.max(0, ...s.b.map(n => n ? Math.min(10, 1 + Math.floor(Math.log2(n))) : 0));
  for (let j = 0; j < maxK; j++) s.b.forEach((n, i) => { if (n && Math.min(10, 1 + Math.floor(Math.log2(n))) > j) items.push({ i, j }); });
  const cur = [4, 14, 2], bases = [ground, ground + 6, ground + 13], layers = [[], [], []];
  items.slice(0, 70).forEach((it, n) => {
    const L = ciHash(it.i, it.j, 3) % 3, w = CI_W[it.i % 8], h = 14 + ciHash(it.i, it.j) % 12 + Math.min(34, it.i * 3);
    if (cur[L] + w > W - 4) return; layers[L].push({ i: it.i, j: it.j, x: cur[L], h, b: bases[L] + (it.i % 8 === 3 || it.i % 8 === 4 ? 0 : 0) }); cur[L] += w + 3 + ciHash(it.i, it.j, 9) % 6;
  });
  [2, 1, 0].forEach(L => {
    for (const b of layers[L]) ciPaint(g, b.i, b.x, b.b, b.h, t + b.j * 40, ciHash(b.i, b.j, 5));
    if (L) { g.fillStyle = ciRgba(mixc(sky, glow, .25), L === 2 ? .5 : .22); g.fillRect(0, ground - 70, W, 90); }
  });
  for (let k = 0, n = Math.min(5, s.b.length); k < n; k++) { const x = ((t * (k % 2 ? -1 : 1) * (.5 + k * .15) + k * 90) % (W + 20) + W + 20) % (W + 20) - 10; px(g, '#0d0620', x - 1, 205, 8, 4); px(g, ['#ff5ad9', '#7fe0ee', '#ffd07a', '#8ee8a0', '#ff7a4f'][k], x, 206, 6, 2); px(g, '#fff6c8', x + (k % 2 ? 0 : 5), 206, 1, 1); }
  for (const sh of ci.ships) {
    if (sh.cargo) { px(g, '#0d0620', sh.x - 1, sh.y - 1, 18, 7); px(g, '#ffd07a', sh.x, sh.y, 16, 5); px(g, '#ffffff', sh.x + 11, sh.y + 1, 4, 2); px(g, '#ff7a4f', sh.x - 3 - (t >> 2) % 2, sh.y + 1, 3, 3); px(g, '#fff6c8', sh.x + 2, sh.y + 1, 2, 1); }
    else { px(g, '#d9c6ff', sh.x, sh.y, 5, 2); px(g, '#7fe0ee', sh.x + (sh.v > 0 ? -2 : 5), sh.y, 2, 2); for (let k = 1; k < 5; k++) px(g, ciRgba('#7fe0ee', .4 - k * .07), sh.x + (sh.v > 0 ? -2 - k * 2 : 6 + k * 2), sh.y, 1, 1); }
  }
  for (const p of ci.pops) { g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#05010b'; g.fillText(p.text, p.x + 1, p.y + 1); g.fillStyle = '#ffd07a'; g.fillText(p.text, p.x, p.y); }
  if (ci.flash) { g.fillStyle = 'rgba(255,208,244,' + ci.flash / 50 + ')'; g.fillRect(0, 0, W, H); }
  // le compteur
  px(g, 'rgba(11,3,28,.72)', 0, 0, W, 28); px(g, '#3a2a6e', 0, 28, W, 1);
  g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#ffd07a'; g.fillText(ciFmt(ciL(s.cr)) + ' ⌬', 8, 12);
  g.font = '6px "Press Start 2P", monospace'; g.fillStyle = '#d9c6ff'; g.fillText('+' + ciFmt(ciProd()) + ' / s', 8, 23);
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
    const ic = el('canvas', 'ciIcon'); ic.width = 34; ic.height = 30; ciPaint(ic.getContext('2d'), i, 17 - (CI_W[i % 8] >> 1), 28, 16, 0, i + 1);
    row.style.setProperty('--c', CI.cols[i % CI.cols.length]); row.append(ic, el('div', 'ciTxt'), b);
    b.onclick = () => { ciBuy(i, s.buy === 'max' ? 'max' : s.buy); b.blur(); };
    return row;
  }));
  [...list.children].forEach((row, i) => {
    const have = s.b[i] || 0, kk = k === 'max' ? Math.max(1, ciMaxBuy(i)) : k, c = ciCost(i, kk), next = 25 - have % 25;
    row.children[1].replaceChildren(el('b', '', ciName(i) + ' · ' + have), el('small', '', (have ? ciFmt(ciProdOf(i)) + ' / s' : 'chacun ' + ciFmt(ciProd0(i) + ciMult()) + ' / s') + ' · ×2 dans ' + next + (kk > 1 ? ' · achat ×' + kk.toLocaleString('fr-FR') : '')), (() => { const bar = el('div', 'ciBar'), f = el('i'); f.style.width = (have % 25) / 25 * 100 + '%'; bar.append(f); return bar; })());
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
