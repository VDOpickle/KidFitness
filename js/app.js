import { EXERCISES, PROGRAMS, byId } from './catalog.js';
import { Tracker } from './engine.js';
import { figureSVG, lerpPose, synth } from './figure.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KID_COLORS = ['#2fe0c2', '#ffc93c', '#ff7a59', '#8fa8ff', '#f58bd0', '#6dffa8'];

// ---------------------------------------------------------------- storage
const KEY = 'starmoves.v1';
let store = { kids: [{ id: 1, name: 'Player 1', stars: 0, sessions: 0 }], current: 1, voice: true };
try {
  const s = JSON.parse(localStorage.getItem(KEY));
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
const amount = (ex) => (ex.kind === 'hold' ? `Hold ${ex.holdSec}s × ${ex.reps}` : `${ex.reps} reps`);
const minutes = (p) => Math.max(1, Math.round(p.steps.reduce((s, id) => {
  const ex = byId[id];
  return s + 8 + (ex.kind === 'hold' ? ex.reps * (ex.holdSec + 3) : ex.reps * 2.5);
}, 0) / 60));

function show(id) {
  for (const s of ['home', 'detail', 'session', 'summary']) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

function renderKids() {
  $('kids').innerHTML = store.kids.map((k, i) =>
    `<button class="kid ${k.id === store.current ? 'on' : ''}" data-kid="${k.id}">
      <i style="background:${KID_COLORS[i % KID_COLORS.length]}">${esc(k.name[0].toUpperCase())}</i>
      ${esc(k.name)} <small>★ ${k.stars}</small></button>`).join('') +
    '<button class="kid add" data-kid="add">+ Add</button>';
}

function renderGrid() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('grid').innerHTML = tab === 'programs'
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
  else if ('again' in d) startSession(S.title, S.list);
  else if ('sim' in d) { forceSim = true; S.sim = true; $('video').hidden = true; beginExercise(0); }
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
const video = $('video');

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
  Object.assign(S, { running: true, title, list, idx: 0, results: [], phase: 'loading', sim: forceSim, aspect: 16 / 9, lm: null, smooth: null });
  show('session');
  $('voiceBtn').classList.toggle('off', !store.voice);
  $('totalStars').textContent = '0';
  video.hidden = S.sim;
  message('<div class="mid">Waking up the camera…</div><div class="sub">Say yes if your browser asks to use the camera.</div>');
  say(' '); // unlock speech on the click that started the session
  requestAnimationFrame(frame);
  if (!S.sim) {
    try {
      await Promise.all([loadModel(), startCamera()]);
      S.aspect = video.videoWidth / video.videoHeight || 16 / 9;
    } catch (err) {
      if (!S.running) return;
      stopCamera();
      S.phase = 'error';
      const why = err?.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this page, then try again.'
        : err?.name === 'NotFoundError' ? 'No camera was found on this device.' : `The camera could not start${err?.message ? ` (${err.message})` : ''}.`;
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
  $('summary').innerHTML = `
    <div class="sum-card">
      <button class="bigbtn home" data-home aria-label="Home">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 8 48h12v38h22V62h16v24h22V48h12z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></svg>
        <span>Home</span>
      </button>
      <div class="sum-mid">
        <h2>${reps ? `Way to go, ${esc(k.name)}!` : 'All done!'}</h2>
        <div class="bigstars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= Math.round(avg) ? 'on' : ''}">★</span>`).join('')}</div>
        <div class="count">${reps ? `You earned <span class="star">★ ${total}</span> out of ${reps * 5} in ${esc(S.title)}` : `No stars this time in ${esc(S.title)}`}</div>
      </div>
      <button class="bigbtn again" data-again aria-label="Play again">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 18a32 32 0 1 1-30.4 22" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/><path d="M52 2v32L30 18z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>
        <span>Again</span>
      </button>
    </div>
    <ol class="steps">${S.results.map((r, i) => `<li><i>${i + 1}</i><b>${r.ex.emoji} ${esc(r.ex.name)}</b>
      <span class="st">${r.stars.length ? row(r.stars.reduce((a, b) => a + b, 0) / r.stars.length) : '<small>skipped</small>'}</span></li>`).join('')}</ol>`;
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

// ---------------------------------------------------------------- per-frame loop
function simPose(now) {
  const ex = S.ex, tr = S.tracker;
  if (S.phase !== 'active') return ex.demo.rest;
  const tgt = ex.demo.targets[tr.reps.length % ex.demo.targets.length];
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
  return lerpPose(ex.demo.rest, tgt, S.simA * Math.min(1, S.simAmp));
}

function readPose(now) {
  if (S.sim) { const lm = synth(simPose(now), S.aspect); return { p: lm, w: lm }; }
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
  $('coachFig').innerHTML = figureSVG(lerpPose(ex.demo.rest, T[which], a));

  draw(pose, prog, ok);
}

renderHome();
