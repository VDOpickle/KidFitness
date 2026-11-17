// Player avatar, ported from the Kinetra adult app and adapted for children.
//
//  - A photo becomes the head. Shirt, trousers, skin and hair colours are sampled from the photo.
//  - Or build a cartoon look by picking colours (no photo needed).
//  - It is drawn over the coach, the side-view figures and the demo player, and tints the Road Run runner.
//
// Differences from the adult app: no weight / body-size setting and no "paste an image link" box.
// Everything lives in memory only: the photo and colours are never saved or uploaded, and clear on reload.

const base = (p) => new URL(p, import.meta.url).href;

/** In-memory only: { [kidId]: { look, photoName, use } }. */
export const avatars = {};
export const DEFAULT_LOOK = { head: null, shirt: '#ff7a59', pants: '#3b5bdb', skin: '#f1c27d', hair: '#5b3a29', found: false };
export const SWATCHES = {
  shirt: ['#ff7a59', '#3b6fd6', '#2fe0c2', '#ffc93c', '#f58bd0', '#8e5cf6'],
  pants: ['#3b5bdb', '#2a3350', '#2f9e6b', '#7c4a2d', '#6b7390', '#c13b6b'],
  skin: ['#ffe0c2', '#f1c27d', '#d9a679', '#b97a56', '#8d5524', '#5c3a21'],
  hair: ['#2b1b12', '#5b3a29', '#b5651d', '#e6c15a', '#c0392b', '#9aa0a6'],
};
export const avatarFor = (id) => (avatars[id] ||= { look: null, photoName: '', use: true });
/** The look to draw for this kid, or null to show the plain stick figure. */
export const activeLook = (id) => { const a = avatars[id]; return a && a.use && a.look ? a.look : null; };

// ---- photo -> look -------------------------------------------------------------------------
let stillPromise = null;
/** A second pose model in IMAGE mode, loaded only when a photo is read. */
function loadStill() {
  if (!stillPromise) {
    stillPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(base('../vendor/tasks-vision/vision_bundle.mjs'));
      const files = await FilesetResolver.forVisionTasks(base('../vendor/tasks-vision/wasm'));
      const make = (delegate) => PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: base('../models/pose_landmarker_full.task'), delegate }, runningMode: 'IMAGE', numPoses: 1,
      });
      try { return await make('GPU'); } catch { return make('CPU'); }
    })();
    stillPromise.catch(() => { stillPromise = null; });
  }
  return stillPromise;
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function avgColor(g, x, y, r, W, H) {
  try {
    const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
    const w = Math.max(1, Math.min(W - x0, Math.round(r * 2))), h = Math.max(1, Math.min(H - y0, Math.round(r * 2)));
    const d = g.getImageData(x0, y0, w, h).data; let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
    return n ? hex(R / n, G / n, B / n) : null;
  } catch { return null; }
}

/** Build the look from a loaded <img>. Never throws. */
export async function buildLook(img) {
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
  const s = Math.min(1, 640 / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * s)), H = Math.max(1, Math.round(H0 * s));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);

  let lm = null;
  try { const st = await loadStill(); const r = st.detect(cv); lm = r.landmarks && r.landmarks[0]; } catch { lm = null; }

  const look = { ...DEFAULT_LOOK, found: !!lm };
  let cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.5; // no body found: centre square (works for selfies)
  if (lm) {
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
    const nose = P(0), eL = P(7), eR = P(8), sL = P(11), sR = P(12), hL = P(23), hR = P(24), kL = P(25), kR = P(26);
    const earD = Math.hypot(eL.x - eR.x, eL.y - eR.y), shD = Math.hypot(sL.x - sR.x, sL.y - sR.y);
    r = Math.max(earD * 1.05, shD * 0.34, 12);
    cx = (nose.x + (eL.x + eR.x) / 2) / 2; cy = (nose.y + (eL.y + eR.y) / 2) / 2 - r * 0.1;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const sh = mid(sL, sR), hp = mid(hL, hR), kn = mid(kL, kR);
    const patch = Math.max(6, shD * 0.12);
    const shirt = avgColor(g, (sh.x + hp.x) / 2, (sh.y + hp.y) / 2, patch, W, H);
    const pants = avgColor(g, (hp.x + kn.x) / 2, (hp.y + kn.y) / 2, patch, W, H);
    if (shirt) look.shirt = shirt;
    if (pants && lm[25].visibility > 0.4) look.pants = pants;
    const skin = avgColor(g, (nose.x + (eL.x + eR.x) / 2) / 2, nose.y + r * 0.15, Math.max(4, r * 0.18), W, H);
    if (skin) look.skin = skin;
    const hair = avgColor(g, cx, cy - r * 0.95, Math.max(4, r * 0.2), W, H); // just above the forehead
    if (hair) look.hair = hair;
  } else {
    const skin = avgColor(g, W / 2, H * 0.42, Math.min(W, H) * 0.04, W, H); if (skin) look.skin = skin;
  }
  // circular head crop
  const S = 160, hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hg = hc.getContext('2d'), side = r * 2.3;
  hg.save(); hg.beginPath(); hg.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); hg.clip();
  try { hg.drawImage(cv, cx - side / 2, cy - side / 2, side, side, 0, 0, S, S); } catch { /* ignore */ }
  hg.restore();
  look.head = hc;
  return look;
}

/** Load an <img> from a File URL or data URL. */
export function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('Image failed to load'));
    i.src = src;
  });
}

// ---- drawing ---------------------------------------------------------------------------------
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function limb(g, a, b, wd, color, alpha = 1) {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = Math.max(2, wd); g.lineCap = 'round';
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
}
const shade = (c, k) => { const n = parseInt(c.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return hex(f(n >> 16), f((n >> 8) & 255), f(n & 255)); };

function headOf(lm, w, h) {
  const a = lm[7], b = lm[8], n = lm[0];
  const cx = ((a.x + b.x) / 2) * w, cy = ((a.y + b.y) / 2) * h;
  const r = Math.max(h * 0.05, Math.hypot((a.x - b.x) * w, (a.y - b.y) * h) * 0.62);
  return { cx: cx * 0.5 + n.x * w * 0.5, cy: cy * 0.5 + n.y * h * 0.5 - r * 0.1, r };
}

const FAINT_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

/** Draw the child on top of a pose. `lm` = 33 normalised landmarks; `side` = side-view figure (right limbs are the far ones). */
export function drawAvatar(g, lm, w, h, look, { side = false, farAlpha = 0.5, alpha = 1 } = {}) {
  const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const sh = mid(P(11), P(12)), hip = mid(P(23), P(24));
  const T = Math.hypot(sh.x - hip.x, sh.y - hip.y) || h * 0.3;
  const K = T / 0.5;
  const far = (i) => (side && i % 2 === 0 ? farAlpha : 1);
  g.save(); g.globalAlpha = alpha;
  const { pants, shirt, skin } = look;
  for (const [hI, kI, aI, tI] of [[24, 26, 28, 32], [23, 25, 27, 31]]) { // legs and shoes
    const a = far(hI);
    limb(g, P(hI), P(kI), 0.15 * K, pants, a); limb(g, P(kI), P(aI), 0.105 * K, pants, a);
    limb(g, P(aI), P(tI), 0.07 * K, '#1a1f33', a);
  }
  if (side) limb(g, sh, hip, 0.2 * K, shirt);
  else {
    const L = P(11), R = P(12), hl = P(23), hr = P(24);
    const dx = L.x - R.x, dy = L.y - R.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    const ps = 0.04 * K, ph = 0.05 * K;
    g.beginPath();
    g.moveTo(L.x + ux * ps, L.y + uy * ps); g.lineTo(R.x - ux * ps, R.y - uy * ps);
    g.lineTo(hr.x - ux * ph, hr.y - uy * ph); g.lineTo(hl.x + ux * ph, hl.y + uy * ph); g.closePath();
    g.fillStyle = shirt; g.fill(); g.lineJoin = 'round'; g.lineWidth = 0.05 * K; g.strokeStyle = shirt; g.stroke();
  }
  for (const [sI, eI, wI] of [[12, 14, 16], [11, 13, 15]]) { // sleeves on the upper arm, skin below the elbow, hands
    const a = far(sI);
    limb(g, P(sI), P(eI), 0.095 * K, shade(shirt, 0.92), a);
    limb(g, P(eI), P(wI), 0.072 * K, skin, a);
    g.save(); g.globalAlpha = a; g.fillStyle = skin; g.beginPath(); g.arc(P(wI).x, P(wI).y, 0.05 * K, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const hd = headOf(lm, w, h);
  limb(g, sh, { x: hd.cx, y: hd.cy + hd.r * 0.7 }, 0.08 * K, skin);
  const R = hd.r * 1.18;
  if (look.head) { // photo head, cropped to a circle
    g.save(); g.beginPath(); g.arc(hd.cx, hd.cy, R, 0, Math.PI * 2); g.clip();
    g.drawImage(look.head, hd.cx - R, hd.cy - R, R * 2, R * 2); g.restore();
  } else { // cartoon head: face and hair in the picked colours
    g.fillStyle = skin; g.beginPath(); g.arc(hd.cx, hd.cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = look.hair || '#5b3a29'; g.beginPath(); g.arc(hd.cx, hd.cy, R, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill();
    g.fillStyle = '#1a1f33';
    const ex = side ? R * 0.35 : R * 0.34, ey = hd.cy + R * 0.05;
    if (side) { g.beginPath(); g.arc(hd.cx + ex, ey, R * 0.09, 0, 7); g.fill(); }
    else { g.beginPath(); g.arc(hd.cx - ex, ey, R * 0.09, 0, 7); g.arc(hd.cx + ex, ey, R * 0.09, 0, 7); g.fill(); }
    g.strokeStyle = '#1a1f33'; g.lineWidth = Math.max(1.5, R * 0.07); g.lineCap = 'round';
    g.beginPath(); g.arc(hd.cx + (side ? R * 0.2 : 0), hd.cy + R * 0.2, R * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(hd.cx, hd.cy, R, 0, Math.PI * 2); g.stroke();
  g.restore();
  // faint skeleton on top so the joints stay readable
  g.save(); g.globalAlpha = 0.35; g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, w * 0.004); g.lineCap = 'round'; g.beginPath();
  for (const [a, b] of FAINT_BONES) if (lm[a].visibility !== 0 && lm[b].visibility !== 0) { g.moveTo(lm[a].x * w, lm[a].y * h); g.lineTo(lm[b].x * w, lm[b].y * h); }
  g.stroke(); g.restore();
}
