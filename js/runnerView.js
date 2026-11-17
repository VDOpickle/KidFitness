// Canvas drawing for Road Run: a pseudo-3D road that rushes toward the child's avatar.
const F = 7; // perspective strength: bigger = flatter
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function emoji(g, ch, x, y, size, alpha = 1) {
  g.globalAlpha = alpha;
  g.font = `${Math.round(size)}px ${EMOJI}`;
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(ch, x, y);
  g.globalAlpha = 1;
}

const shadeHex = (c, k) => {
  const n = parseInt(c.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const STONE = ['#ecd9b0', '#e0c48f', '#f3e6c4', '#e6cf9f'];
const AWNING = ['#c0392b', '#2f6fb5', '#e6a21f', '#2f9e6b'];

// Old City skyline on the horizon: hills, the golden dome, a tower and the city wall.
function jerusalemSkyline(g, W, H, hz) {
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  g.fillStyle = '#d8c5a8'; g.beginPath(); g.moveTo(-20, hz + 2);
  for (let x = -20; x <= W + 20; x += 20) g.lineTo(x, hz - H * 0.07 * (0.55 + 0.35 * Math.sin(x * 0.004 + 0.5) + 0.25 * Math.sin(x * 0.011)));
  g.lineTo(W + 20, hz + 2); g.fill();
  // golden dome
  const dx = W * 0.68, bw = H * 0.2;
  rect(dx - bw / 2, hz - H * 0.085, bw, H * 0.085, '#efe6d0');
  rect(dx - bw / 2, hz - H * 0.06, bw, H * 0.026, '#3b7fc4');
  rect(dx - bw * 0.3, hz - H * 0.11, bw * 0.6, H * 0.03, '#3b7fc4');
  g.fillStyle = '#f3b82f'; g.beginPath(); g.arc(dx, hz - H * 0.11, H * 0.052, Math.PI, 0); g.fill();
  rect(dx - 1, hz - H * 0.185, 2, H * 0.025, '#d9a21c');
  // tower with a pointed cap
  const tx = W * 0.3;
  rect(tx - H * 0.04, hz - H * 0.09, H * 0.08, H * 0.09, '#dcc291');
  rect(tx - H * 0.012, hz - H * 0.17, H * 0.024, H * 0.08, '#e6cf9f');
  g.fillStyle = '#9aa8b8'; g.beginPath(); g.moveTo(tx - H * 0.017, hz - H * 0.17); g.lineTo(tx, hz - H * 0.215); g.lineTo(tx + H * 0.017, hz - H * 0.17); g.fill();
  // cypress trees
  g.fillStyle = '#4f7a4a';
  for (const x of [0.12, 0.2, 0.47, 0.55, 0.83, 0.9]) { g.beginPath(); g.ellipse(W * x, hz - H * 0.025, H * 0.011, H * 0.03, 0, 0, 7); g.fill(); }
  // city wall with battlements
  const wh = H * 0.05;
  rect(0, hz - wh, W, wh + 2, '#e6cf9f');
  g.fillStyle = '#e6cf9f';
  for (let x = 0; x < W; x += H * 0.04) g.fillRect(x, hz - wh - H * 0.014, H * 0.022, H * 0.015);
  g.fillStyle = 'rgba(120,90,50,.18)'; g.fillRect(0, hz - wh * 0.45, W, 2);
}

export function drawScene(g, W, H, G, now, look = null) {
  const th = G.level.theme, P = G.player, pos = G.pos;
  const hz = H * 0.34, gy = H * 0.86, cx = W / 2;
  const LW = Math.min(W * (W < H ? 0.24 : 0.17), H * 0.3), U = Math.min(H * 0.27, LW); // U: height unit; scales down on narrow screens
  const sc = (a) => F / (F + Math.max(a, -F * 0.85));
  const X = (x, a) => cx + x * LW * sc(a);
  const Y = (a, h = 0) => hz + (gy - hz) * sc(a) - h * U * sc(a);
  const poly = (pts, col, alpha = 1) => {
    g.globalAlpha = alpha; g.fillStyle = col; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fill(); g.globalAlpha = 1;
  };
  const flat = (x0, x1, a0, a1, col) => poly([[X(x0, a0), Y(a0)], [X(x1, a0), Y(a0)], [X(x1, a1), Y(a1)], [X(x0, a1), Y(a1)]], col);
  const wall = (x, a0, a1, h0, h1, col) => poly([[X(x, a0), Y(a0, h0)], [X(x, a1), Y(a1, h0)], [X(x, a1), Y(a1, h1)], [X(x, a0), Y(a0, h1)]], col);
  const face = (x0, x1, h0, h1, a, col, alpha = 1) => poly([[X(x0, a), Y(a, h0)], [X(x1, a), Y(a, h0)], [X(x1, a), Y(a, h1)], [X(x0, a), Y(a, h1)]], col, alpha);

  const shake = P.hit > 0.7 ? (Math.random() - 0.5) * 12 * ((P.hit - 0.7) / 0.3) : 0;
  g.save(); g.translate(shake, 0);

  // sky, sun, clouds, hills
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(-20, 0, W + 40, hz + 2);
  g.fillStyle = th.sun; g.beginPath(); g.arc(W * 0.8, hz * 0.5, H * 0.07, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 4; i++) {
    const x = (((i * 0.31 + now * 0.000012) % 1.3) - 0.15) * W, y = hz * (0.2 + 0.18 * (i % 3)), r = H * (0.035 + 0.01 * (i % 2));
    g.beginPath(); g.arc(x, y, r, 0, 7); g.arc(x + r * 1.1, y + r * 0.2, r * 0.8, 0, 7); g.arc(x - r * 1.1, y + r * 0.25, r * 0.7, 0, 7); g.fill();
  }
  g.fillStyle = th.hill; g.beginPath(); g.moveTo(-20, hz + 2);
  for (let x = -20; x <= W + 20; x += 20) g.lineTo(x, hz - H * 0.05 * (0.6 + 0.4 * Math.sin(x * 0.006 + 1) + 0.3 * Math.sin(x * 0.015)));
  g.lineTo(W + 20, hz + 2); g.fill();
  if (th.scene === 'jerusalem') jerusalemSkyline(g, W, H, hz);

  // grass and road
  const gr = g.createLinearGradient(0, hz, 0, H);
  gr.addColorStop(0, th.grass[0]); gr.addColorStop(1, th.grass[1]);
  g.fillStyle = gr; g.fillRect(-20, hz, W + 40, H - hz + 2);
  const NEAR = -1.5, FAR = 120;
  flat(-1.7, 1.7, NEAR, FAR, th.road);
  for (let a = -(pos % 6) - 6; a < FAR; a += 3) {
    const m = Math.floor((a + pos) / 3);
    const col = th.curb ? th.curb[m % 2 ? 0 : 1] : m % 2 ? '#ffffff' : '#ff6b6b';
    flat(-1.95, -1.7, Math.max(a, NEAR), a + 3, col); flat(1.7, 1.95, Math.max(a, NEAR), a + 3, col);
  }
  for (let a = -(pos % 5) - 5; a < FAR; a += 5) {
    for (const x of [-0.5, 0.5]) flat(x - 0.05, x + 0.05, Math.max(a, NEAR), a + 2.2, 'rgba(255,255,255,.8)');
  }

  // everything that stands on the road, drawn far to near
  const draws = [];
  const facade = (side, a, m) => { // one 6-unit stretch of limestone building along the street
    const x = side * 2.3, a0 = Math.max(a, -1.2), a1 = a + 6, sd = side < 0 ? 1 : 0.8, i = ((m % 4) + 4) % 4;
    const hgt = 2.6 + 1.4 * ((((m * 37) % 5) + 5) % 5) / 4;
    if (a1 < -1) return;
    wall(x, a0, a1, 0, hgt, shadeHex(STONE[i], sd));
    wall(x, a0, a1, hgt - 0.12, hgt, shadeHex('#b79a66', sd)); // roof edge
    for (const wa of [a + 0.9, a + 3.7]) { // arched windows (drawn as tall panes) on the upper floor
      if (wa < -1) continue;
      wall(x, wa, wa + 0.9, hgt * 0.5, hgt * 0.5 + 0.95, shadeHex('#3d3a46', sd));
      wall(x, wa - 0.08, wa, hgt * 0.5, hgt * 0.5 + 1.0, shadeHex('#c7ab75', sd));
    }
    if (a + 3.6 > -1) wall(x, a + 2.0, a + 3.6, 0, 1.3, shadeHex('#6b4a2f', sd)); // door
    const aw = AWNING[(i + (side > 0 ? 1 : 0)) % 4]; // shop awning over the pavement
    poly([[X(x, a0), Y(a0, 1.55)], [X(x, a1), Y(a1, 1.55)], [X(x - side * 0.45, a1), Y(a1, 1.32)], [X(x - side * 0.45, a0), Y(a0, 1.32)]], shadeHex(aw, sd));
  };
  for (let k = 0; k < 20; k++) {
    const a = k * 6 - (pos % 6), m = Math.floor((a + pos) / 6);
    if (th.buildings) { draws.push({ a: a + 3, fn: () => { facade(-1, a, m); facade(1, a, m + 2); } }); continue; }
    draws.push({ a, fn: () => {
      const s = sc(a), size = U * 2.3 * s;
      emoji(g, th.scenery[((m % 4) + 4) % 4], X(-3.3 - (m % 2) * 0.8, a), Y(a), size, clamp((110 - a) / 25, 0, 1));
      emoji(g, th.scenery[(((m + 1) % 4) + 4) % 4], X(3.3 + ((m + 1) % 2) * 0.8, a), Y(a), size, clamp((110 - a) / 25, 0, 1));
    } });
  }
  for (const it of G.items) {
    const a = it.at - pos;
    if (a > 100 || a < -4 || it.got) continue;
    const fade = clamp((105 - a) / 25, 0, 1) * (it.hit ? 0.35 : 1), s = sc(a);
    draws.push({ a: it.t === 'hurdle' && th.hurdle ? Math.max(a, 0.001) : a, fn: () => {
      if (it.t === 'hurdle' && th.hurdle === 'pothole') {
        const yn = Y(a - 0.9), yf = Y(a + 0.9), cy = (yn + yf) / 2, ry = (yn - yf) / 2, rx = 1.45 * LW * s;
        g.globalAlpha = fade;
        g.fillStyle = '#9a9186'; g.beginPath(); g.ellipse(cx, cy, rx * 1.1, ry * 1.14, 0, 0, 7); g.fill();
        g.fillStyle = '#2b2724'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
        g.fillStyle = '#17120f'; g.beginPath(); g.ellipse(cx, cy + ry * 0.15, rx * 0.78, ry * 0.68, 0, 0, 7); g.fill();
        g.strokeStyle = '#4a443d'; g.lineWidth = Math.max(1, 3 * s); g.lineCap = 'round'; g.beginPath();
        for (const [ax, ay] of [[-1.3, 0.5], [-0.7, -0.9], [0.2, 1], [1.0, -0.7], [1.45, 0.3]]) {
          g.moveTo(cx + ax * rx * 0.97, cy + ay * ry * 0.9); g.lineTo(cx + ax * rx * 1.28, cy + ay * ry * 1.4);
        }
        g.stroke(); g.globalAlpha = 1;
      } else if (it.t === 'beam' && th.beam === 'lamp') {
        face(-1.72, -1.6, 0, 1.45, a, '#3b3b44', fade); face(1.6, 1.72, 0, 1.45, a, '#3b3b44', fade); // iron posts
        face(-1.72, 1.72, 1.27, 1.4, a, '#3b3b44', fade);                                                // arm across the street
        for (const lx of [-1, 0, 1]) {
          const gl = g.createRadialGradient(X(lx, a), Y(a, 1.1), 0, X(lx, a), Y(a, 1.1), 0.5 * LW * s);
          gl.addColorStop(0, `rgba(255,214,120,${0.55 * fade})`); gl.addColorStop(1, 'rgba(255,214,120,0)');
          g.fillStyle = gl; g.fillRect(X(lx, a) - 0.5 * LW * s, Y(a, 1.1) - 0.5 * LW * s, LW * s, LW * s);   // soft glow
          face(lx - 0.02, lx + 0.02, 1.22, 1.27, a, '#3b3b44', fade);                                       // hanger
          face(lx - 0.16, lx + 0.16, 1.0, 1.22, a, '#ffd36b', fade);                                        // lantern
          face(lx - 0.2, lx + 0.2, 0.96, 1.0, a, '#3b3b44', fade);
        }
      } else if (it.t === 'block') emoji(g, it.emo, X(it.lane, a), Y(a), LW * 1.05 * s, fade);
      else if (it.t === 'star') emoji(g, '⭐', X(it.lane, a), Y(a, it.h ? 1.75 : 0.32), LW * 0.62 * s, fade);
      else if (it.t === 'balloon') emoji(g, '🎈', X(it.lane, a), Y(a, 1.55), LW * 0.95 * s, fade);
      else if (it.t === 'hurdle') {
        face(-1.62, -1.5, 0, 0.7, a, '#ffffff', fade); face(1.5, 1.62, 0, 0.7, a, '#ffffff', fade);
        for (let i = 0; i < 8; i++) face(-1.6 + i * 0.4, -1.2 + i * 0.4, 0.42, 0.64, a, i % 2 ? '#ffffff' : '#ff4d4d', fade);
      } else if (it.t === 'beam') {
        face(-1.62, -1.5, 0, 1.4, a, '#ffd23f', fade); face(1.5, 1.62, 0, 1.4, a, '#ffd23f', fade);
        for (let i = 0; i < 8; i++) face(-1.6 + i * 0.4, -1.2 + i * 0.4, 1.05, 1.38, a, i % 2 ? '#2b2b3a' : '#ffd23f', fade);
      }
    } });
  }
  draws.push({ a: 0, fn: () => avatar(g, X(P.x, 0), Y(0), U, G, now, look) });
  draws.sort((p, q) => q.a - p.a).forEach((d) => d.fn());

  // floating "+1" and bump marks
  for (const f of G.fx) {
    const k = f.age / 0.9, x = cx + P.x * LW, y = Y(0) - (1.5 + k * 1.1) * U;
    if (f.kind === 'star') emoji(g, '⭐', x, y, U * 0.5, 1 - k);
    else emoji(g, '💥', x, y, U * 0.7, 1 - k);
  }
  g.restore();
  if (P.hit > 0.6) { g.fillStyle = `rgba(255,70,70,${(P.hit - 0.6) * 0.5})`; g.fillRect(0, 0, W, H); }
}

// The child's avatar, seen from behind.
function avatar(g, x, y, U, G, now, look) {
  const C = { shirt: look?.shirt || '#ff7a59', pants: look?.pants || '#3b5bdb', skin: look?.skin || '#ffcfa3', hair: look?.hair || '#5b3a29' };
  const P = G.player, run = G.speed > 0 ? 1 : 0, phase = G.pos * 1.5;
  const jump = P.jh, duck = P.duck, reach = Math.max(P.reach, jump * 0.55);
  const lift = jump * 0.65 * U;
  // shadow
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath();
  g.ellipse(x, y + U * 0.02, U * 0.32 * (1 - jump * 0.4), U * 0.07 * (1 - jump * 0.4), 0, 0, 7); g.fill();
  if (P.hit > 0.3 && Math.floor(now / 90) % 2 === 0) g.globalAlpha = 0.45;

  const legLen = U * 0.45 * (1 - 0.45 * duck), hipY = y - lift - legLen, torsoH = U * 0.38 * (1 - 0.1 * duck), topY = hipY - torsoH;
  const tilt = clamp((P.targetX - P.x) * 0.18, -0.25, 0.25);
  g.save(); g.translate(x, hipY); g.rotate(tilt); g.translate(-x, -hipY);
  g.lineCap = 'round';
  // legs
  for (const s of [-1, 1]) {
    const ph = phase + (s > 0 ? 0 : Math.PI), foot = Math.max(0, Math.sin(ph)) * 0.2 * U * run * (1 - jump);
    const tuck = jump * 0.22 * U, spread = (0.1 + 0.09 * duck) * U;
    g.strokeStyle = C.pants; g.lineWidth = U * 0.17;
    g.beginPath(); g.moveTo(x + s * 0.1 * U, hipY); g.lineTo(x + s * spread, y - lift - foot - tuck); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + s * spread, y - lift - foot - tuck, U * 0.12, U * 0.07, 0, 0, 7); g.fill();
  }
  // arms
  for (const s of [-1, 1]) {
    const sx = x + s * 0.27 * U, sy = topY + U * 0.07, sw = Math.sin(phase + (s > 0 ? Math.PI : 0)) * run * (1 - reach);
    const hx = x + s * (0.34 - 0.14 * reach) * U, hy = sy + (0.34 + 0.1 * sw) * U * (1 - reach) - reach * 0.5 * U;
    g.strokeStyle = C.shirt; g.lineWidth = U * 0.14;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = C.skin; g.beginPath(); g.arc(hx, hy, U * 0.075, 0, 7); g.fill();
  }
  // torso, head
  g.fillStyle = C.shirt; g.beginPath(); g.roundRect(x - 0.25 * U, topY, 0.5 * U, torsoH, 0.13 * U); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(x - 0.25 * U, topY + torsoH * 0.55, 0.5 * U, U * 0.05);
  g.fillStyle = C.skin; g.fillRect(x - 0.06 * U, topY - 0.05 * U, 0.12 * U, 0.08 * U);
  const hy = topY - 0.17 * U;
  g.fillStyle = C.skin; g.beginPath(); g.arc(x - 0.17 * U, hy + 0.02 * U, U * 0.04, 0, 7); g.arc(x + 0.17 * U, hy + 0.02 * U, U * 0.04, 0, 7); g.fill();
  g.fillStyle = C.hair; g.beginPath(); g.arc(x, hy, U * 0.18, 0, 7); g.fill();
  g.fillStyle = '#2fe0c2'; g.fillRect(x - 0.18 * U, hy - 0.03 * U, 0.36 * U, 0.05 * U);
  g.restore();
  g.globalAlpha = 1;
}
