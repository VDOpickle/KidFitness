import { EXERCISES, PROGRAMS, byId } from './catalog.js';
import { Tracker } from './engine.js';
import { figureSVG, lerpPose, synth, joints, sideJoints, viewPoses, landmarksFromJoints, sideLandmarks } from './figure.js';
import { avatars, avatarFor, activeLook, buildLook, loadImage, drawAvatar, SWATCHES, DEFAULT_LOOK } from './avatar.js';
import { LEVELS, RunnerGame, Bot, inputFromPose } from './runner.js';
import { drawScene } from './runnerView.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KID_COLORS = ['#2fe0c2', '#ffc93c', '#ff7a59', '#8fa8ff', '#f58bd0', '#6dffa8'];

// ---------------------------------------------------------------- storage
const KEY = 'kidfit.v1', OLD_KEY = 'starmoves.v1'; // OLD_KEY: saves from before the rename
let store = { kids: [{ id: 1, name: 'Player 1', stars: 0, sessions: 0 }], current: 1, voice: true };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY));
  if (s && Array.isArray(s.kids) && s.kids.length) store = s;
} catch { /* storage unavailable: play without saving */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } };
const kid = () => store.kids.find((k) => k.id === store.current) || store.kids[0];

// ---------------------------------------------------------------- sound + voice
let actx;
function ding(i = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.11;
    o.type = 'triangle';
    o.frequency.value = [523, 659, 784, 988, 1175][i] || 523;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + 0.32);
  } catch { /* no audio */ }
}
function thud() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), gn = actx.createGain(), t = actx.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    gn.gain.setValueAtTime(0.3, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(gn).connect(actx.destination); o.start(t); o.stop(t + 0.26);
  } catch { /* no audio */ }
}

// Speech uses the voices installed on this computer. Pick the most natural-sounding one
// available; the home screen lets a grown-up override the choice.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;
function voiceScore(v) {
  const n = v.name;
  let s = 0;
  if (/premium/i.test(n)) s += 50;
  if (/natural|neural/i.test(n)) s += 45;
  if (/enhanced/i.test(n)) s += 40;
  if (/^Google (US|UK) English/.test(n)) s += 30;
  if (/^(Samantha|Ava|Allison|Zoe|Evan|Nicky|Karen|Serena|Daniel|Moira|Tessa)\b/.test(n)) s += 10;
  if (/en[-_]US/i.test(v.lang)) s += 3;
  if (NOVELTY.test(n)) s -= 40;
  return s;
}
function englishVoices() {
  try {
    return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  } catch { return []; }
}
function pickVoice() {
  const list = englishVoices();
  return list.find((v) => v.name === store.voiceName) || list[0] || null;
}
function renderVoices() {
  const sel = $('voiceSel'), list = englishVoices();
  const auto = list[0] ? `Automatic (${list[0].name})` : 'Automatic';
  sel.innerHTML = `<option value="">${esc(auto)}</option>` +
    list.map((v) => `<option value="${esc(v.name)}" ${v.name === store.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
}
function say(text, interrupt = true, force = false) {
  if ((!store.voice && !force) || !('speechSynthesis' in window)) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 0.92; u.pitch = 1; // natural voices sound best unaltered
    speechSynthesis.speak(u);
  } catch { /* no speech */ }
}
if ('speechSynthesis' in window) {
  try { speechSynthesis.addEventListener('voiceschanged', renderVoices); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- home
let tab = 'programs';
const lastPlay = { game: null }; // set when a game is started, cleared when a session is started
const amount = (ex) => (ex.kind === 'hold' ? `Hold ${ex.holdSec}s × ${ex.reps}` : `${ex.reps} reps`);
const minutes = (p) => Math.max(1, Math.round(p.steps.reduce((s, id) => {
  const ex = byId[id];
  return s + 8 + (ex.kind === 'hold' ? ex.reps * (ex.holdSec + 3) : ex.reps * 2.5);
}, 0) / 60));

function show(id) {
  for (const s of ['home', 'detail', 'session', 'game', 'summary']) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

function renderKids() {
  $('kids').innerHTML = store.kids.map((k, i) =>
    `<button class="kid ${k.id === store.current ? 'on' : ''}" data-kid="${k.id}">
      <i style="background:${KID_COLORS[i % KID_COLORS.length]}">${esc(k.name[0].toUpperCase())}</i>
      ${esc(k.name)} <small>★ ${k.stars}</small></button>`).join('') +
    '<button class="kid add" data-kid="add">+ Add</button><button class="kid add av" data-avatar>🧍 My avatar</button>';
}

function renderGrid() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('grid').innerHTML = tab === 'games'
    ? LEVELS.map((l) => `<button class="card prog game" style="--h:${l.hue}" data-game="${l.id}">
        <div class="emoji big">${l.emoji}</div><h3>Road Run: ${esc(l.name)}</h3><p>${esc(l.blurb)}</p>
        <span class="tag">${l.moves.length} moves · about 1 min</span></button>`).join('')
    : tab === 'programs'
    ? PROGRAMS.map((p) => `<button class="card prog" style="--h:${p.hue}" data-prog="${p.id}">
        <div class="emoji">${p.emoji}</div><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p>
        <span class="tag">${p.steps.length} moves · about ${minutes(p)} min</span></button>`).join('')
    : EXERCISES.filter((e) => e.cat === tab).map((e) => `<button class="card ex" data-ex="${e.id}">
        <div class="thumb"><span>${e.emoji}</span>${figureSVG(e.demo.targets[0])}</div>
        <h3>${esc(e.name)}</h3><span class="tag">${amount(e)}</span></button>`).join('');
}

function renderHome() {
  renderKids(); renderGrid(); renderVoices();
  $('heroFig').innerHTML = figureSVG({ armL: 150, armR: 150, legL: 25, legR: 25 });
  show('home');
}

function renderDetail(p) {
  $('detail').innerHTML = `
    <button class="ghost" data-back>‹ Back</button>
    <div class="detail-head" style="--h:${p.hue}">
      <div class="emoji">${p.emoji}</div>
      <div><h2>${esc(p.name)}</h2><p>${esc(p.blurb)} ${p.steps.length} moves · about ${minutes(p)} min</p></div>
      <button class="primary" data-start="${p.id}">Start ▶</button>
    </div>
    <ol class="steps">${p.steps.map((id, i) => {
      const e = byId[id];
      return `<li><i>${i + 1}</i><div class="mini">${figureSVG(e.demo.targets[0])}</div><b>${e.emoji} ${esc(e.name)}</b><small>${amount(e)}</small></li>`;
    }).join('')}</ol>`;
  show('detail');
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; renderGrid(); }
  else if (d.kid === 'add') { $('kidName').value = ''; $('kidDlg').showModal(); }
  else if (d.kid) { store.current = +d.kid; save(); renderKids(); }
  else if (d.prog) renderDetail(PROGRAMS.find((p) => p.id === d.prog));
  else if (d.ex) startSession(byId[d.ex].name, [byId[d.ex]]);
  else if (d.start) { const p = PROGRAMS.find((x) => x.id === d.start); startSession(p.name, p.steps.map((id) => byId[id])); }
  else if ('back' in d || 'home' in d) renderHome();
  else if ('avatar' in d) openAvatar();
  else if (d.game) startGame(d.game);
  else if ('again' in d) (lastPlay.game ? startGame(lastPlay.game) : startSession(S.title, S.list));
  else if ('sim' in d) { forceSim = true; S.sim = true; $('video').hidden = true; beginExercise(0); }
  else if ('gsim' in d) { forceSim = true; S.sim = true; $('gvideo').hidden = true; beginGame(); }
});
$('kidDlg').addEventListener('close', () => {
  const name = $('kidName').value.trim();
  if ($('kidDlg').returnValue !== 'ok' || !name) return;
  const id = Math.max(0, ...store.kids.map((k) => k.id)) + 1;
  store.kids.push({ id, name, stars: 0, sessions: 0 });
  store.current = id; save(); renderKids();
});
$('voiceSel').onchange = () => { store.voiceName = $('voiceSel').value || undefined; save(); };
$('voiceTest').onclick = () => say('Hi! I am your coach. Reach up high like a giraffe. Great job!', true, true);
$('simBtn').onclick = () => { forceSim = true; $('simBtn').textContent = 'Demo mode is on: pick something to play'; };

// ---------------------------------------------------------------- camera + pose model
let forceSim = new URLSearchParams(location.search).has('sim');
let landmarker = null, stream = null, lastVideoTime = -1;
let video = $('video'); // the game screen has its own <video>

async function loadModel() {
  if (landmarker) return;
  const { FilesetResolver, PoseLandmarker } = await import('../vendor/tasks-vision/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(new URL('../vendor/tasks-vision/wasm', import.meta.url).href);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: new URL('../models/pose_landmarker_full.task', import.meta.url).href, delegate },
    runningMode: 'VIDEO', numPoses: 1,
  });
  try { landmarker = await PoseLandmarker.createFromOptions(files, opts('GPU')); }
  catch { landmarker = await PoseLandmarker.createFromOptions(files, opts('CPU')); }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera here. Open the app from http://localhost or an https address.');
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
}
// Opens the model and camera. Returns null on success, or an error message for the screen.
async function initCamera() {
  try {
    await Promise.all([loadModel(), startCamera()]);
    S.aspect = video.videoWidth / video.videoHeight || 16 / 9;
    return null;
  } catch (err) {
    stopCamera();
    return err?.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this page, then try again.'
      : err?.name === 'NotFoundError' ? 'No camera was found on this device.' : `The camera could not start${err?.message ? ` (${err.message})` : ''}.`;
  }
}
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null;
}

// ---------------------------------------------------------------- session
const S = { running: false, list: [], idx: 0, title: '', results: [], phase: '', sim: false };
const overlay = $('overlay'), g = overlay.getContext('2d');
const PRAISE = ['', 'Good try!', 'Nice!', 'Great!', 'Awesome!', 'Perfect!'];
const NEED_FULL = [11, 12, 23, 24, 25, 26, 27, 28], NEED_UPPER = [11, 12, 13, 14, 23, 24];

function message(html, clear = false) {
  const m = $('msg');
  if (html == null) { m.hidden = true; return; }
  if (m.dataset.html !== html) { m.innerHTML = html; m.dataset.html = html; }
  m.classList.toggle('clear', clear);
  m.hidden = false;
}

async function startSession(title, list) {
  GM.running = false; lastPlay.game = null; video = $('video'); lastVideoTime = -1;
  Object.assign(S, { running: true, title, list, idx: 0, results: [], phase: 'loading', sim: forceSim, aspect: 16 / 9, lm: null, smooth: null });
  show('session');
  $('voiceBtn').classList.toggle('off', !store.voice);
  $('totalStars').textContent = '0';
  video.hidden = S.sim;
  message('<div class="mid">Waking up the camera…</div><div class="sub">Say yes if your browser asks to use the camera.</div>');
  say(' '); // unlock speech on the click that started the session
  requestAnimationFrame(frame);
  if (!S.sim) {
    const why = await initCamera();
    if (!S.running) { stopCamera(); return; }
    if (why) {
      S.phase = 'error';
      message(`<div class="mid">Camera problem</div><div class="sub">${esc(why)}</div><button class="primary" data-sim>Play in demo mode</button>`);
      return;
    }
  }
  if (S.running) beginExercise(0);
}

function beginExercise(i) {
  S.idx = i;
  const ex = S.ex = S.list[i];
  S.tracker = new Tracker(ex);
  S.results[i] = { ex, stars: [] };
  Object.assign(S, { phase: 'intro', tPhase: performance.now(), seen: 0, lost: 0, simA: 0, simAmp: 1, simPh: 0 });
  refreshAvatarUI();
  $('hudEmoji').textContent = ex.emoji;
  $('hudName').textContent = ex.name;
  $('hudStep').textContent = S.list.length > 1 ? `${i + 1} / ${S.list.length}` : '';
  $('cue').textContent = ex.cue;
  $('repLabel').textContent = ex.kind === 'hold' ? `Hold for ${ex.holdSec} seconds` : 'Reps';
  $('burst').hidden = true;
  $('segs').innerHTML = S.list.map((_, k) => `<i class="${k < i && S.results[k]?.stars.length ? 'done' : ''}"></i>`).join('');
  renderReps();
  say(`${ex.name}. ${ex.cue}`);
}

function renderReps() {
  const r = S.tracker.reps, ex = S.ex;
  $('pips').innerHTML = Array.from({ length: ex.reps }, (_, i) => (i < r.length ? `<i class="got">${r[i]}★</i>` : '<i>·</i>')).join('');
  $('totalStars').textContent = S.results.reduce((s, x) => s + x.stars.reduce((a, b) => a + b, 0), 0);
}

function onRep(stars) {
  S.results[S.idx].stars.push(stars);
  renderReps();
  const b = $('burst');
  b.innerHTML = `<div class="stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= stars ? 'on' : ''}" style="animation-delay:${n * 0.07}s">★</span>`).join('')}</div><div class="word">${PRAISE[stars]}</div>`;
  b.hidden = false;
  clearTimeout(S.burstT);
  S.burstT = setTimeout(() => { b.hidden = true; }, 1300);
  for (let i = 0; i < stars; i++) ding(i);
  const n = S.tracker.reps.length;
  if (S.tracker.done) return;
  if (stars <= 2) say(S.ex.tip);
  else if (S.ex.kind === 'hold') say(S.ex.demo.targets.length > 1 ? 'Now the other side!' : 'One more time!');
  else say(String(n));
}

function renderSummary({ heading, avg, line, rows }) {
  $('summary').innerHTML = `
    <div class="sum-card">
      <button class="bigbtn home" data-home aria-label="Home">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 8 48h12v38h22V62h16v24h22V48h12z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></svg>
        <span>Home</span>
      </button>
      <div class="sum-mid">
        <h2>${esc(heading)}</h2>
        <div class="bigstars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= Math.round(avg) ? 'on' : ''}">★</span>`).join('')}</div>
        <div class="count">${line}</div>
      </div>
      <button class="bigbtn again" data-again aria-label="Play again">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 18a32 32 0 1 1-30.4 22" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/><path d="M52 2v32L30 18z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>
        <span>Again</span>
      </button>
    </div>
    <ol class="steps">${rows}</ol>`;
}

function endSession(toSummary) {
  S.running = false;
  stopCamera();
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  if (!toSummary) return renderHome();
  const done = S.results.filter((r) => r.stars.length);
  const total = done.reduce((s, r) => s + r.stars.reduce((a, b) => a + b, 0), 0);
  const reps = done.reduce((s, r) => s + r.stars.length, 0);
  const avg = reps ? total / reps : 0;
  const k = kid();
  k.stars += total; k.sessions += 1; save();
  const row = (n) => [1, 2, 3, 4, 5].map((i) => (i <= Math.round(n) ? '★' : '<u>★</u>')).join('');
  renderSummary({
    heading: reps ? `Way to go, ${k.name}!` : 'All done!', avg,
    line: reps ? `You earned <span class="star">★ ${total}</span> out of ${reps * 5} in ${esc(S.title)}` : `No stars this time in ${esc(S.title)}`,
    rows: S.results.map((r, i) => `<li><i>${i + 1}</i><b>${r.ex.emoji} ${esc(r.ex.name)}</b>
      <span class="st">${r.stars.length ? row(r.stars.reduce((a, b) => a + b, 0) / r.stars.length) : '<small>skipped</small>'}</span></li>`).join(''),
  });
  show('summary');
  if (reps) { say(`All done! You earned ${total} stars!`); for (let i = 0; i < 5; i++) ding(i); }
}

function nextExercise() {
  if (S.idx + 1 < S.list.length) beginExercise(S.idx + 1);
  else endSession(true);
}

$('skipBtn').onclick = () => { if (S.running && S.phase !== 'loading' && S.phase !== 'error') nextExercise(); };
$('exitBtn').onclick = () => endSession(S.results.some((r) => r.stars.length));
$('voiceBtn').onclick = () => {
  store.voice = !store.voice; save();
  $('voiceBtn').classList.toggle('off', !store.voice);
  if (!store.voice) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
};

// ---------------------------------------------------------------- figures on small canvases (coach front/side, you side)
function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  return [cv.getContext('2d'), W, H];
}

// makeLm(aspect) -> 33 normalised landmarks, or null to draw only the floor.
function paintFigure(cv, makeLm, { look = null, side = false, floor = false, color = '#2fe0c2' } = {}) {
  const [c, W, H] = fitCanvas(cv);
  c.clearRect(0, 0, W, H);
  const fy = H * 0.96;
  c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.ellipse(W / 2, fy, W * 0.34, H * 0.018, 0, 0, 7); c.fill();
  if (floor) { c.strokeStyle = 'rgba(255,255,255,.16)'; c.setLineDash([4, 5]); c.beginPath(); c.moveTo(W * 0.06, fy); c.lineTo(W * 0.94, fy); c.stroke(); c.setLineDash([]); }
  const lm = makeLm && makeLm(W / H);
  if (!lm) return;
  if (look) return drawAvatar(c, lm, W, H, look, { side });
  const wd = Math.max(3, H * 0.032), far = (a, b) => side && a % 2 === 0 && b % 2 === 0 && a > 10;
  c.lineCap = 'round'; c.strokeStyle = color; c.lineWidth = wd;
  for (const [a, b] of BONES) {
    if (lm[a].visibility === 0 || lm[b].visibility === 0) continue;
    c.globalAlpha = far(a, b) ? 0.45 : 1;
    c.beginPath(); c.moveTo(lm[a].x * W, lm[a].y * H); c.lineTo(lm[b].x * W, lm[b].y * H); c.stroke();
  }
  c.globalAlpha = 1;
  c.fillStyle = color; c.beginPath(); c.arc(lm[0].x * W, lm[0].y * H, H * 0.062, 0, 7); c.fill();
  c.fillStyle = '#fff';
  for (const i of JOINTS) { if (lm[i].visibility === 0) continue; c.beginPath(); c.arc(lm[i].x * W, lm[i].y * H, wd * 0.55, 0, 7); c.fill(); }
}

// ---------------------------------------------------------------- avatar editor
function refreshAvatarUI() {
  const a = avatars[store.current];
  $('avTog').hidden = !(a && a.look);
  $('avTog').classList.toggle('off', !(a && a.use));
}

function paintAvatarDialog() {
  const a = avatarFor(store.current), look = a.look;
  paintFigure($('avPrev'), (asp) => landmarksFromJoints(joints({ armL: 22, armR: 22 }), { aspect: asp, k: 0.8, floorY: 0.97 }), { look });
  $('avName').textContent = !look ? 'No avatar yet, so the stick figure is shown.'
    : a.photoName ? `${a.photoName} · ${look.found ? 'body found, colours matched' : 'head only, pick colours below'}` : 'Cartoon avatar';
  $('avSw').innerHTML = Object.entries(SWATCHES).map(([part, list]) =>
    `<div class="sw-row"><span>${part[0].toUpperCase() + part.slice(1)}</span>${list.map((c) =>
      `<button type="button" class="sw ${look && look[part].toLowerCase() === c ? 'on' : ''}" data-part="${part}" data-color="${c}" style="background:${c}" aria-label="${part} colour"></button>`).join('')}</div>`).join('');
  $('avUse').checked = a.use;
  refreshAvatarUI();
}

function openAvatar() {
  $('avWho').textContent = kid().name;
  paintAvatarDialog();
  $('avDlg').showModal();
  paintAvatarDialog(); // paint again now that the dialog has a size
}

async function setPhoto(loader, name) {
  const a = avatarFor(store.current);
  $('avName').textContent = 'Reading the photo…';
  try { a.look = await buildLook(await loader()); a.photoName = name; a.use = true; }
  catch { $('avName').textContent = "Couldn't read that picture. Try another one."; return; }
  paintAvatarDialog();
}

let capStream = null;
function closeCapture() { capStream?.getTracks().forEach((t) => t.stop()); capStream = null; $('capVid').srcObject = null; if ($('capDlg').open) $('capDlg').close(); }

$('avUpload').onclick = () => $('avFile').click();
$('avFile').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const url = URL.createObjectURL(f);
  setPhoto(() => loadImage(url), f.name).finally(() => URL.revokeObjectURL(url));
};
$('avClear').onclick = () => { const a = avatarFor(store.current); a.look = null; a.photoName = ''; paintAvatarDialog(); };
$('avUse').onchange = (e) => { avatarFor(store.current).use = e.target.checked; refreshAvatarUI(); };
$('avDone').onclick = () => $('avDlg').close();
$('avSw').addEventListener('click', (e) => {
  const b = e.target.closest('.sw'); if (!b) return;
  const a = avatarFor(store.current);
  a.look ||= { ...DEFAULT_LOOK };
  a.look[b.dataset.part] = b.dataset.color; a.use = true;
  paintAvatarDialog();
});
$('avShoot').onclick = async () => {
  $('avDlg').close(); $('capDlg').showModal();
  try {
    capStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    $('capVid').srcObject = capStream; await $('capVid').play();
  } catch { closeCapture(); openAvatar(); $('avName').textContent = 'The camera could not start. You can upload a photo instead.'; }
};
$('capCancel').onclick = () => { closeCapture(); openAvatar(); };
$('capGo').onclick = () => {
  const v = $('capVid'), c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.9);
  closeCapture(); openAvatar();
  setPhoto(() => loadImage(url), 'Camera photo');
};
$('capDlg').addEventListener('cancel', () => { closeCapture(); });
$('avTog').onclick = () => { const a = avatars[store.current]; if (a) { a.use = !a.use; refreshAvatarUI(); } };

// ---------------------------------------------------------------- per-frame loop
function simPose(now) {
  const ex = S.ex, tr = S.tracker;
  if (S.phase !== 'active') { S.simView = viewPoses(ex.demo, 0, 0); return S.simView.front; }
  if (ex.kind === 'rep') {
    const ph = ((now - S.tPhase) % 1700) / 1700;
    if (ph < S.simPh) S.simAmp = 0.7 + Math.random() * 0.35;
    S.simPh = ph;
    S.simA = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
  } else {
    if (tr.state === 'cool' && S.simA > 0.9) S.simAmp = 0.8 + Math.random() * 0.25;
    S.simA += ((tr.state === 'cool' ? 0 : 1) - S.simA) * 0.08;
    if (tr.state === 'rest' && S.simA > 0.97) S.simAmp = Math.min(1, S.simAmp + 0.004); // never get stuck short of a pose
  }
  S.simView = viewPoses(ex.demo, tr.reps.length, S.simA * Math.min(1, S.simAmp));
  return S.simView.front;
}

function readPose(now) {
  if (S.sim) { const lm = synth(GM.running ? GM.simPose : simPose(now), S.aspect); return { p: lm, w: lm }; }
  if (!landmarker || video.readyState < 2) return null;
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const res = landmarker.detectForVideo(video, now);
    if (res.landmarks?.length) {
      // Mirror into screen space so the child's left side is on the left.
      const raw = res.landmarks[0].map((l) => ({ x: (1 - l.x) * S.aspect, y: l.y, z: l.z, v: l.visibility ?? 1 }));
      S.smooth = S.smooth ? raw.map((r, i) => {
        const s = S.smooth[i];
        return { x: s.x + (r.x - s.x) * 0.6, y: s.y + (r.y - s.y) * 0.6, z: r.z, v: r.v };
      }) : raw;
      S.lm = { p: S.smooth, w: res.worldLandmarks[0].map((l) => ({ x: -l.x, y: l.y, z: l.z })) };
    } else { S.lm = null; S.smooth = null; }
  }
  return S.lm;
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function draw(pose, prog, ok) {
  const box = $('stageInner'), stage = box.parentElement, dpr = Math.min(2, window.devicePixelRatio || 1);
  // Fit the camera frame inside the stage without cropping anyone's feet.
  const bw = Math.floor(Math.min(stage.clientWidth, (stage.clientHeight - 18) * S.aspect)); // 18px = progress bars + gap
  const bh = Math.floor(bw / S.aspect);
  if (box.clientWidth !== bw || box.clientHeight !== bh) {
    box.style.width = `${bw}px`; box.style.height = `${bh}px`;
    $('segs').style.width = `${bw}px`;
  }
  const W = Math.round(box.clientWidth * dpr), H = Math.round(box.clientHeight * dpr);
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  g.clearRect(0, 0, W, H);
  if (S.sim) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16213d'); bg.addColorStop(1, '#0a1020');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, H * 0.93, W, H * 0.07);
  }
  if (!pose) return;
  const p = pose.p, u = H / 100;
  const X = (i) => (p[i].x / S.aspect) * W, Y = (i) => p[i].y * H;
  const vis = (i) => p[i].v > 0.4;
  const active = S.phase === 'active' && ok;
  const mix = active ? prog : 0;
  const col = `rgb(${Math.round(47 + 62 * mix)}, ${Math.round(224 + 31 * mix)}, ${Math.round(194 - 26 * mix)})`;

  const look = S.sim ? activeLook(store.current) : null; // on the live camera the child sees themselves, so only the demo player wears the avatar
  if (look) drawAvatar(g, p.map((q) => ({ x: q.x / S.aspect, y: q.y, z: 0, visibility: q.v })), W, H, look);
  else {
    g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = 2.2 * u;
    g.strokeStyle = col; g.lineWidth = 1.1 * u; g.globalAlpha = ok ? 0.95 : 0.45;
    g.beginPath();
    for (const [a, b] of BONES) if (vis(a) && vis(b)) { g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); }
    g.stroke();
    if (vis(0) && vis(11) && vis(12)) { // head ring
      const r = Math.hypot(X(11) - X(12), Y(11) - Y(12)) * 0.34;
      g.beginPath(); g.arc(X(0), Y(0), r, 0, 7); g.stroke();
    }
    g.shadowBlur = 0;
  }

  const focus = new Set(S.ex.focus);
  for (const i of JOINTS) {
    if (!vis(i)) continue;
    const f = focus.has(i);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(X(i), Y(i), (f ? 1.25 : 0.85) * u, 0, 7); g.fill();
    if (f) { // movement tracker: a ring that fills as the move gets closer to the target
      g.lineWidth = 0.55 * u;
      g.strokeStyle = 'rgba(255,255,255,.28)';
      g.beginPath(); g.arc(X(i), Y(i), 2.6 * u, 0, 7); g.stroke();
      if (active && prog > 0.02) {
        g.strokeStyle = prog > 0.93 ? '#ffc93c' : '#6dffa8';
        g.beginPath(); g.arc(X(i), Y(i), 2.6 * u, -Math.PI / 2, -Math.PI / 2 + prog * 2 * Math.PI); g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
}

function frame(now) {
  if (!S.running) return;
  requestAnimationFrame(frame);
  if (!S.ex) { draw(null); return; }
  const ex = S.ex, tr = S.tracker;
  let pose = null;
  try { pose = readPose(now); } catch (e) { console.error(e); }
  const need = ex.need || (ex.upper ? NEED_UPPER : NEED_FULL);
  const ok = !!pose && need.every((i) => pose.p[i].v > 0.5);
  const dt = Math.min(100, now - (S.tFrame || now)); S.tFrame = now;
  S.seen = ok ? S.seen + dt : 0;
  S.lost = ok ? 0 : S.lost + dt;
  const since = now - S.tPhase;
  const fit = ex.upper ? 'Stand where I can see your head, arms and hips!' : 'Step back until I can see you from head to toes!';

  if (S.phase === 'intro') {
    message(`<div class="mid">${ex.emoji} ${esc(ex.name)}</div><div class="sub">${S.seen > 0 ? 'Get ready…' : fit}</div>`);
    if (since > 2800 && S.seen > 600) { S.phase = 'count'; S.tPhase = now; S.n = 0; }
  } else if (S.phase === 'count') {
    const n = 3 - Math.floor(since / 800);
    if (n >= 1) {
      message(`<div class="big">${n}</div>`);
      if (n !== S.n) { S.n = n; ding(0); }
    } else { S.phase = 'active'; S.tPhase = now; message(null); ding(4); say('Go!'); }
  } else if (S.phase === 'active') {
    if (ok) {
      const stars = tr.update(pose.p, pose.w, now);
      if (stars) onRep(stars);
      if (tr.done) { S.phase = 'done'; S.tPhase = now; }
    }
    if (S.lost > 1200) message(`<div class="mid">I can't see you!</div><div class="sub">${fit}</div>`);
    else if (tr.state === 'cool') message('<div class="mid">Relax… shake it out!</div>', true);
    else message(null);
  } else if (S.phase === 'done') {
    const st = S.results[S.idx].stars, sum = st.reduce((a, b) => a + b, 0);
    message(`<div class="mid">${ex.emoji} Great job!</div><div class="big star">★ ${sum}</div>`);
    if (since < 20) say('Great job!');
    if (since > 2200) { nextExercise(); return; }
  }

  // HUD
  const prog = S.phase === 'active' && ok ? tr.prog : 0;
  $('powerFill').style.height = `${Math.round(prog * 100)}%`;
  const holding = ex.kind === 'hold' && S.phase === 'active';
  const part = S.phase === 'done' ? 1 : holding ? tr.held / ex.holdSec : tr.reps.length / ex.reps;
  $('meterFill').style.height = `${Math.round(Math.min(1, part) * 100)}%`;
  $('meterNum').textContent = ex.kind === 'hold'
    ? (holding && tr.state !== 'cool' ? Math.max(1, Math.ceil(ex.holdSec - tr.held)) : ex.holdSec)
    : tr.reps.length;
  $('meterLabel').textContent = ex.kind === 'hold' ? 'HOLD' : `OF ${ex.reps}`;
  // Current exercise's bar fills as its reps are completed.
  const seg = $('segs').children[S.idx];
  if (seg) {
    const whole = S.phase === 'done' ? 1 : (tr.reps.length + (holding ? Math.min(1, tr.held / ex.holdSec) : 0)) / ex.reps;
    seg.style.setProperty('--p', `${Math.round(Math.min(1, whole) * 100)}%`);
  }

  // Coach animation
  const T = ex.demo.targets, per = ex.kind === 'hold' ? 3200 : 1700;
  const ph = (now % per) / per, which = Math.floor(now / per) % T.length;
  const a = ex.kind === 'hold' ? Math.min(1, Math.max(0, Math.sin(Math.PI * ph) * 1.8)) : 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
  const look = activeLook(store.current), v = viewPoses(ex.demo, which, a);
  paintFigure($('coachCv'), (asp) => landmarksFromJoints(joints(v.front), { aspect: asp }), { look });
  paintFigure($('coachSide'), (asp) => landmarksFromJoints(sideJoints(v.side, v.planar), { aspect: asp }), { look, side: true, floor: true });
  let you = null;
  if (S.sim) { const sv = S.simView || v; you = (asp) => landmarksFromJoints(sideJoints(sv.side, sv.planar), { aspect: asp }); }
  else if (pose && ok) you = (asp) => sideLandmarks(pose.w, { aspect: asp });
  paintFigure($('youSide'), you, { look, side: true, floor: true, color: '#6dffa8' });

  draw(pose, prog, ok);
}

// ---------------------------------------------------------------- game: road run
const GM = { running: false, simPose: {} };
const gcv = $('gcv'), gg = gcv.getContext('2d'), gover = $('gover'), gpg = gover.getContext('2d');
const HINT_POSE = { left: { lean: -24, armL: 25, armR: 25 }, right: { lean: 24, armL: 25, armR: 25 }, jump: { lift: 0.08, armL: 40, armR: 40 },
  duck: { legL: 65, legR: 65, shinL: -15, shinR: -15, armL: 70, armR: 70 }, reach: { armL: 172, armR: 172 } };
const HINT_TEXT = { jump: ['⬆️', 'Jump!', 'Jump!'], duck: ['⬇️', 'Squat down!', 'Squat down!'], reach: ['🙌', 'Reach up!', 'Reach up!'] };

function gmessage(html, clear = false) {
  const m = $('gMsg');
  if (html == null) { m.hidden = true; return; }
  if (m.dataset.html !== html) { m.innerHTML = html; m.dataset.html = html; }
  m.classList.toggle('clear', clear);
  m.hidden = false;
}

async function startGame(id) {
  const level = LEVELS.find((l) => l.id === id);
  lastPlay.game = id;
  S.running = false;
  Object.assign(GM, { running: true, level, game: new RunnerGame(level), bot: new Bot(), ctx: { dt: 0 }, phase: 'loading', simPose: {},
    tPhase: performance.now(), seen: 0, lost: 0, tFrame: 0, hintKey: null, sayAt: 0 });
  Object.assign(S, { sim: forceSim, aspect: 16 / 9, lm: null, smooth: null, game: true });
  video = $('gvideo'); lastVideoTime = -1;
  video.hidden = S.sim;
  show('game');
  $('gEmoji').textContent = level.emoji; $('gName').textContent = level.name; $('gStars').textContent = '0';
  $('gProg').style.width = '0'; $('gHint').hidden = true;
  $('gVoice').classList.toggle('off', !store.voice);
  gmessage('<div class="mid">Waking up the camera…</div><div class="sub">Say yes if your browser asks to use the camera.</div>');
  say(' ');
  requestAnimationFrame(gframe);
  if (!S.sim) {
    const why = await initCamera();
    if (!GM.running) { stopCamera(); return; }
    if (why) {
      GM.phase = 'error';
      gmessage(`<div class="mid">Camera problem</div><div class="sub">${esc(why)}</div><button class="primary" data-gsim>Play in demo mode</button>`);
      return;
    }
  }
  beginGame();
}

function beginGame() {
  if (!GM.running) return;
  $('gPip').style.aspectRatio = String(S.aspect);
  GM.phase = 'intro'; GM.tPhase = performance.now(); GM.seen = 0;
  say(`${GM.level.name}! Lean to dodge, jump over hurdles, squat under beams and reach for balloons!`);
}

function endGame(toSummary) {
  GM.running = false; S.game = false;
  stopCamera();
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  if (!toSummary) return renderHome();
  const r = GM.game.result(), k = kid();
  k.stars += r.collected; k.sessions += 1; save();
  renderSummary({
    heading: `Great run, ${k.name}!`, avg: r.rating,
    line: `You collected <span class="star">★ ${r.collected}</span> of ${r.total} in ${esc(GM.level.name)}`,
    rows: `<li><i>⭐</i><b>Stars collected</b><span class="st">${r.collected} / ${r.total}</span></li>
           <li><i>💥</i><b>Bumps</b><span class="st">${r.bumps}</span></li>`,
  });
  show('summary');
  say(`Great run! You collected ${r.collected} stars!`);
  for (let i = 0; i < 5; i++) ding(i);
}

$('gExit').onclick = () => endGame(false);
$('gVoice').onclick = () => {
  store.voice = !store.voice; save();
  $('gVoice').classList.toggle('off', !store.voice);
  if (!store.voice) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
};

function drawPip(pose) {
  const el = $('gPip'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(el.clientWidth * dpr), H = Math.round(el.clientHeight * dpr);
  if (gover.width !== W || gover.height !== H) { gover.width = W; gover.height = H; }
  gpg.clearRect(0, 0, W, H);
  if (S.sim) { gpg.fillStyle = '#0d1528'; gpg.fillRect(0, 0, W, H); }
  if (!pose) return;
  const p = pose.p, X = (i) => (p[i].x / S.aspect) * W, Y = (i) => p[i].y * H, vis = (i) => p[i].v > 0.4;
  gpg.lineCap = 'round'; gpg.strokeStyle = '#2fe0c2'; gpg.lineWidth = Math.max(2, H * 0.025);
  gpg.beginPath();
  for (const [a, b] of BONES) if (vis(a) && vis(b)) { gpg.moveTo(X(a), Y(a)); gpg.lineTo(X(b), Y(b)); }
  gpg.stroke();
  gpg.fillStyle = '#fff';
  for (const i of JOINTS) if (vis(i)) { gpg.beginPath(); gpg.arc(X(i), Y(i), Math.max(2, H * 0.03), 0, 7); gpg.fill(); }
}

function showHint(h, playing) {
  const el = $('gHint');
  if (!h || !playing) { el.hidden = true; return; }
  const key = h.kind === 'lean' ? (h.dir < 0 ? 'left' : 'right') : h.kind;
  const label = key === 'left' ? ['⬅️', 'Lean left!'] : key === 'right' ? ['➡️', 'Lean right!'] : HINT_TEXT[key];
  const html = `${figureSVG(HINT_POSE[key])}<span>${label[0]} ${label[1]}</span>`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.classList.toggle('now', h.tta < 1.1);
  el.hidden = false;
  if (GM.hintKey !== `${key}${h.at}`) { // speak each new cue once
    GM.hintKey = `${key}${h.at}`;
    if (performance.now() - GM.sayAt > 1500) { GM.sayAt = performance.now(); say(label[1].replace('!', ''), true); }
  }
}

function gframe(now) {
  if (!GM.running) return;
  requestAnimationFrame(gframe);
  const G = GM.game, dt = Math.min(0.1, Math.max(0, (now - (GM.tFrame || now)) / 1000));
  GM.tFrame = now;
  if (S.sim) GM.simPose = GM.bot.step(G, dt, GM.phase === 'play');
  let pose = null;
  try { pose = readPose(now); } catch (e) { console.error(e); }
  const ok = !!pose && NEED_FULL.every((i) => pose.p[i].v > 0.5);
  GM.seen = ok ? GM.seen + dt * 1000 : 0;
  GM.lost = ok ? 0 : GM.lost + dt * 1000;
  const since = now - GM.tPhase, fit = 'Step back until I can see you from head to toes!';

  if (GM.phase === 'intro') {
    gmessage(`<div class="mid">${GM.level.emoji} ${esc(GM.level.name)}</div><div class="sub">${GM.seen > 0 ? 'Get ready to run!' : fit}</div>`);
    if (since > 3500 && GM.seen > 600) { GM.phase = 'count'; GM.tPhase = now; GM.n = 0; }
  } else if (GM.phase === 'count') {
    const n = 3 - Math.floor(since / 800);
    if (n >= 1) { gmessage(`<div class="big">${n}</div>`); if (n !== GM.n) { GM.n = n; ding(0); } }
    else { GM.phase = 'play'; GM.tPhase = now; gmessage(null); ding(4); say('Run!'); }
  } else if (GM.phase === 'play') {
    if (ok) {
      GM.ctx.dt = dt;
      G.update(dt, inputFromPose(pose.p, pose.w, GM.ctx));
    }
    for (const e of G.events.splice(0)) { if (e === 'star') ding(Math.min(4, 2 + (G.stars % 3))); else if (e === 'bump') thud(); }
    if (GM.lost > 1200) gmessage(`<div class="mid">I can't see you!</div><div class="sub">${fit}</div>`);
    else gmessage(null);
    if (G.done) { GM.phase = 'done'; GM.tPhase = now; say('You made it to the finish!'); }
  } else if (GM.phase === 'done') {
    gmessage(`<div class="mid">🏁 Finish!</div><div class="big star">★ ${G.stars}</div>`);
    if (since > 2600) { endGame(true); return; }
  }

  // HUD
  $('gStars').textContent = G.stars;
  $('gProg').style.width = `${Math.round(Math.min(1, G.pos / G.end) * 100)}%`;
  showHint(GM.phase === 'play' && ok ? G.hint() : null, GM.phase === 'play' && ok);

  // scene
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(gcv.clientWidth * dpr), H = Math.round(gcv.clientHeight * dpr);
  if (gcv.width !== W || gcv.height !== H) { gcv.width = W; gcv.height = H; }
  drawScene(gg, W, H, G, now, activeLook(store.current));
  drawPip(pose);
}

renderHome();
