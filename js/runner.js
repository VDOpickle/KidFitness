// Road Run: a runner game steered by the child's body. DOM-free so it can be tested in Node.
//
//   lean left / right  -> change lane (dodge rocks and cones)
//   jump               -> hop over hurdles (and grab stars in the air)
//   squat              -> duck under high beams
//   reach up           -> pop balloons
//
// The pose is turned into game input by inputFromPose(); the game itself only sees
// { lane: -1|0|1, jump: 0..1, duck: 0..1, reach: 0..1 }.

import { hop, lean, knee, raise, avg, map } from './catalog.js';

export const JUMP_T = 0.8;           // seconds a jump lasts once detected
const LANES = [-1, 0, 1];

export const LEVELS = [
  { id: 'easy', name: 'Sunny Road', emoji: '🌞', hue: 135, blurb: 'Lean and jump!', moves: ['lean', 'jump'],
    speed: 7, count: 12, gap: [2.6, 3.4], seed: 11,
    theme: { sky: ['#6cc4ff', '#e6f6ff'], hill: '#7bd88a', grass: ['#5fd06d', '#3fae52'], road: '#5d6679', sun: '#ffe27a',
      scenery: ['🌳', '🌷', '🌻', '🌳'], blocks: ['🪨', '🚧'] } },
  { id: 'medium', name: 'Forest Run', emoji: '🌲', hue: 160, blurb: 'Lean, jump and duck!', moves: ['lean', 'jump', 'duck'],
    speed: 8.5, count: 16, gap: [2.2, 3.0], seed: 23,
    theme: { sky: ['#9ed4c6', '#eef6df'], hill: '#4fa56a', grass: ['#3fa65a', '#2c8444'], road: '#6a6258', sun: '#fff1a8',
      scenery: ['🌲', '🍄', '🌲', '🌲'], blocks: ['🪨', '🦔'] } },
  { id: 'hard', name: 'Beach Dash', emoji: '🌴', hue: 30, blurb: 'Lean, jump, duck and reach!', moves: ['lean', 'jump', 'duck', 'reach'],
    speed: 10, count: 20, gap: [2.0, 2.6], seed: 37,
    theme: { sky: ['#6fd3ff', '#fff0c4'], hill: '#ffd98a', grass: ['#f6dfa6', '#e5c27a'], road: '#6f6a72', sun: '#ffd25c',
      scenery: ['🌴', '🐚', '🌴', '🏖️'], blocks: ['🦀', '🚧'] } },
  { id: 'jerusalem', name: 'Jerusalem', emoji: '🏰', hue: 38, blurb: 'Old City streets: dodge cars, duck under lamps, jump potholes!', moves: ['lean', 'jump', 'duck'],
    speed: 8.5, count: 16, gap: [2.2, 3.0], seed: 53,
    theme: { scene: 'jerusalem', buildings: true, hurdle: 'pothole', beam: 'lamp',
      sky: ['#79c4f2', '#ffe9c2'], hill: '#cdb89b', grass: ['#e6d3a4', '#cdb27a'], road: '#6b665f', sun: '#fff0a8',
      curb: ['#efe0bb', '#d3b784'], blocks: ['🚗', '🚕', '🚙', '🚌'] } },
];

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Item distances are in "world units" along the road; the child's lane is -1, 0 or 1.
export function buildCourse(level) {
  const r = rng(level.seed), items = [];
  const star = (at, lane, h = 0) => items.push({ t: 'star', at, lane, h });
  let at = 30, last = '', g = 0;
  for (let n = 0; n < level.count; n++) {
    let move = level.moves[Math.floor(r() * level.moves.length)];
    if (move === last) move = level.moves[(level.moves.indexOf(move) + 1) % level.moves.length];
    last = move;
    if (move === 'lean') {
      const free = r() < 0.5 ? -1 : 1;
      const lanes = level.id === 'easy' ? [0] : [0, -free]; // easy: either side is open
      g++;
      lanes.forEach((lane, i) => items.push({ t: 'block', at, lane, g, emo: level.theme.blocks[(n + i) % level.theme.blocks.length] }));
      for (let k = 1; k <= 3; k++) star(at + 2.5 * k, free);
    } else if (move === 'jump') {
      items.push({ t: 'hurdle', at });
      star(at, 0, 1); star(at + 3, 0); star(at + 5.5, 0);
    } else if (move === 'duck') {
      items.push({ t: 'beam', at });
      star(at, 0); star(at + 3.5, 0);
    } else {
      items.push({ t: 'balloon', at, lane: 0 }, { t: 'balloon', at: at + 3, lane: 0 });
      star(at + 6, 0);
    }
    at += (level.gap[0] + r() * (level.gap[1] - level.gap[0])) * level.speed;
  }
  items.sort((a, b) => a.at - b.at);
  return { items, end: at + 6 };
}

export class RunnerGame {
  constructor(level) {
    this.level = level;
    const c = buildCourse(level);
    this.items = c.items; this.end = c.end;
    this.pos = 0; this.t = 0; this.speed = 0;
    this.player = { x: 0, targetX: 0, jt: -1, jh: 0, duck: 0, reach: 0, hit: 0 };
    this.stars = 0; this.bumps = 0;
    this.total = c.items.filter((i) => i.t === 'star' || i.t === 'balloon').length;
    this.hazards = c.items.filter((i) => i.t === 'hurdle' || i.t === 'beam').length + new Set(c.items.filter((i) => i.t === 'block').map((i) => i.g)).size;
    this.fx = []; this.events = []; this.done = false; this.armJump = true;
  }

  update(dt, inp) {
    if (this.done) return;
    const p = this.player;
    this.t += dt;
    this.speed = this.level.speed * Math.min(1, this.t / 1.5);
    this.pos += this.speed * dt;

    p.targetX = inp.lane || 0;
    const dx = p.targetX - p.x;
    p.x += Math.sign(dx) * Math.min(Math.abs(dx), 5 * dt);

    if ((inp.jump || 0) >= 0.5 && this.armJump && p.jt < 0) { p.jt = 0; this.armJump = false; this.events.push('jump'); }
    if ((inp.jump || 0) < 0.25) this.armJump = true;
    if (p.jt >= 0) { p.jt += dt; if (p.jt >= JUMP_T) p.jt = -1; }
    p.jh = p.jt >= 0 ? Math.sin((Math.PI * p.jt) / JUMP_T) : 0;
    p.duck += ((p.jt >= 0 ? 0 : inp.duck || 0) - p.duck) * Math.min(1, dt * 14);
    p.reach += ((inp.reach || 0) - p.reach) * Math.min(1, dt * 14);
    p.hit = Math.max(0, p.hit - dt);

    for (const it of this.items) {
      if (it.done || it.at - this.pos > 0.2) continue; // resolved as it passes the child
      it.done = true;
      this._resolve(it);
    }
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < 0.9);
    if (this.pos >= this.end) this.done = true;
  }

  _resolve(it) {
    const p = this.player, near = (l) => Math.abs(l - p.x) < 0.62;
    if (it.t === 'block') { if (near(it.lane)) this._bump(it); }
    else if (it.t === 'hurdle') { if (p.jh < 0.3) this._bump(it); }
    else if (it.t === 'beam') { if (p.duck < 0.5) this._bump(it); }
    else if (it.t === 'star') { if (near(it.lane) && (!it.h || p.jh > 0.3)) this._collect(it); }
    else if (it.t === 'balloon') { if (near(it.lane) && p.reach > 0.5) this._collect(it); }
  }
  _bump(it) { it.hit = true; this.player.hit = 1; this.bumps++; this.events.push('bump'); this.fx.push({ kind: 'bump', age: 0 }); }
  _collect(it) { it.got = true; this.stars++; this.events.push('star'); this.fx.push({ kind: 'star', age: 0 }); }

  // The move the child should be doing next, for the on-screen hint.
  hint() {
    const sp = this.speed || this.level.speed, p = this.player;
    for (const it of this.items) {
      if (it.done) continue;
      const tta = (it.at - this.pos) / sp;
      if (tta > 2.6) break;
      if (it.t === 'hurdle') return { kind: 'jump', tta, at: it.at };
      if (it.t === 'beam') return { kind: 'duck', tta, at: it.at };
      if (it.t === 'balloon') return { kind: 'reach', tta, at: it.at };
      if (it.t === 'block') {
        const grp = this.items.filter((x) => x.g === it.g);
        if (!grp.some((x) => Math.abs(x.lane - p.targetX) < 0.62)) continue; // already in a safe lane
        const free = LANES.filter((l) => !grp.some((x) => x.lane === l)).sort((a, b) => Math.abs(a - p.targetX) - Math.abs(b - p.targetX));
        return { kind: 'lean', dir: Math.sign(free[0] - p.targetX), tta, at: it.at };
      }
    }
    return null;
  }

  result() {
    const ratio = this.total ? this.stars / this.total : 1;
    const clean = this.hazards ? Math.max(0, 1 - this.bumps / this.hazards) : 1;
    const score = ratio * 0.6 + clean * 0.4;
    return { rating: Math.min(5, Math.max(1, Math.round(1 + 4 * score))), collected: this.stars, total: this.total, bumps: this.bumps, hazards: this.hazards };
  }
}

// ---- pose -> game input ------------------------------------------------------------------
// ctx persists between frames: { dt, lane, base }.
export function inputFromPose(p, w, ctx) {
  const l = lean(p), T = 8; // degrees of sideways lean to change lane
  if (ctx.lane == null) ctx.lane = 0;
  if (ctx.lane === 0) { if (l < -T) ctx.lane = -1; else if (l > T) ctx.lane = 1; }
  else if (ctx.lane < 0 ? l > -T / 2 : l < T / 2) ctx.lane = 0; // hysteresis: easy to hold, easy to return
  return {
    lean: l, lane: ctx.lane,
    jump: hop(p, ctx),
    duck: map(avg(knee, w), 165, 125),
    reach: map(avg(raise, w), 60, 150),
  };
}

// ---- demo player ---------------------------------------------------------------------------
// Plays the course by producing poses, which then go through inputFromPose like a real camera would.
export class Bot {
  constructor() { this.lean = 0; this.duck = 0; this.reach = 0; this.jt = -1; this.jumped = -1; }

  step(G, dt, active = true) {
    let laneT = 0, duckT = 0, reachT = 0;
    if (active) {
      const sp = G.speed || G.level.speed;
      for (const it of G.items) {
        if (it.done) continue;
        const tta = (it.at - G.pos) / sp;
        if (tta > 2.6) break;
        if (it.t === 'block') {
          if (tta > 1.4) break; // don't leave the middle lane before the stars in front are collected
          const grp = G.items.filter((x) => x.g === it.g);
          const free = LANES.filter((l) => !grp.some((x) => x.lane === l));
          const st = G.items.find((x) => x.t === 'star' && x.at > it.at && x.at < it.at + 9 && free.includes(x.lane));
          laneT = st ? st.lane : free[0];
          break;
        }
        if (it.t === 'star' && it.lane !== 0 && laneT === 0 && tta < 2.2) laneT = it.lane;
        if (it.t === 'hurdle' && tta < 0.5 && this.jt < 0 && this.jumped !== it.at) { this.jt = 0; this.jumped = it.at; }
        if (it.t === 'beam' && tta < 1.1) duckT = 1;
        if (it.t === 'balloon' && tta < 0.8) reachT = 1;
      }
    }
    const k = (rate) => 1 - Math.exp(-rate * dt);
    this.lean += (laneT * 18 - this.lean) * k(9);
    this.duck += (duckT - this.duck) * k(14);
    this.reach += (reachT - this.reach) * k(14);
    if (this.jt >= 0) { this.jt += dt; if (this.jt > 0.45) this.jt = -1; }
    const d = this.duck, a = 8 + 164 * this.reach;
    return {
      lean: this.lean, lift: this.jt >= 0 ? 0.09 * Math.sin((Math.PI * this.jt) / 0.45) : 0,
      legL: 4 + 61 * d, legR: 4 + 61 * d, shinL: 4 - 19 * d, shinR: 4 - 19 * d, armL: a, armR: a,
    };
  }
}
