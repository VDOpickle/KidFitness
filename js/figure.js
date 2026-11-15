// Stick-figure guide: a tiny forward-kinematics model used for
//  1) the animated "copy me" coach, 2) catalog thumbnails,
//  3) synthetic landmarks for demo mode and automated tests.
// Angles are degrees measured from "hanging straight down"; positive = outward.

const D = Math.PI / 180;
const DIM = { sw: 0.11, hw: 0.07, torso: 0.28, upper: 0.15, fore: 0.14, thigh: 0.22, shin: 0.22, neck: 0.12 };

const BASE = { lean: 0, fold: 0, lift: 0, rise: 0, turn: 0, headTilt: 0, armL: 8, armR: 8, legL: 4, legR: 4 };

export function resolve(pose = {}) {
  const p = { ...BASE, ...pose };
  if (p.foreL == null) p.foreL = p.armL;
  if (p.foreR == null) p.foreR = p.armR;
  if (p.shinL == null) p.shinL = p.legL;
  if (p.shinR == null) p.shinR = p.legR;
  return p;
}

export function lerpPose(a, b, t) {
  const A = resolve(a), B = resolve(b), o = {};
  for (const k in A) o[k] = A[k] + (B[k] - A[k]) * t;
  return o;
}

const add = (p, len, ang, side) => ({ x: p.x + side * Math.sin(ang * D) * len, y: p.y + Math.cos(ang * D) * len });

// Returns joint positions; ground is y = 0, up is negative y.
export function joints(pose) {
  const p = resolve(pose);
  const T = DIM.torso * (1 - 1.1 * p.fold);
  const hipC = { x: 0, y: 0 };
  const neck = { x: Math.sin(p.lean * D) * T, y: -Math.cos(p.lean * D) * T };
  const ax = Math.cos(p.lean * D), ay = Math.sin(p.lean * D);
  const tw = Math.cos(p.turn * 90 * D); // turning side-on narrows the body
  const sw = DIM.sw * tw, hw = DIM.hw * tw;
  const j = {
    neck,
    shL: { x: neck.x - ax * sw, y: neck.y - ay * sw },
    shR: { x: neck.x + ax * sw, y: neck.y + ay * sw },
    hipL: { x: hipC.x - hw, y: 0 },
    hipR: { x: hipC.x + hw, y: 0 },
  };
  const ht = (p.lean + p.headTilt) * D;
  const hl = DIM.neck * (1 - 2 * p.fold);
  j.head = { x: neck.x + Math.sin(ht) * hl, y: neck.y - Math.cos(ht) * hl };
  j.earL = { x: j.head.x - Math.cos(ht) * 0.045, y: j.head.y - Math.sin(ht) * 0.045 };
  j.earR = { x: j.head.x + Math.cos(ht) * 0.045, y: j.head.y + Math.sin(ht) * 0.045 };
  j.elL = add(j.shL, DIM.upper, p.armL, -1);
  j.elR = add(j.shR, DIM.upper, p.armR, 1);
  j.wrL = add(j.elL, DIM.fore, p.foreL, -1);
  j.wrR = add(j.elR, DIM.fore, p.foreR, 1);
  j.knL = add(j.hipL, DIM.thigh, p.legL, -1);
  j.knR = add(j.hipR, DIM.thigh, p.legR, 1);
  j.anL = add(j.knL, DIM.shin, p.shinL, -1);
  j.anR = add(j.knR, DIM.shin, p.shinR, 1);
  const up = p.rise * 0.045; // heels lift, toes stay down
  const dy = -Math.max(j.anL.y, j.anR.y) - p.lift - up;
  for (const k in j) j[k] = { x: j[k].x, y: j[k].y + dy };
  j.toeL = { x: j.anL.x - 0.035 * tw, y: j.anL.y + up };
  j.toeR = { x: j.anR.x + 0.035 * tw, y: j.anR.y + up };
  return j;
}

const BONES = [
  ['shL', 'shR'], ['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'],
  ['shL', 'hipL'], ['shR', 'hipR'], ['hipL', 'hipR'],
  ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR'], ['anL', 'toeL'], ['anR', 'toeR'], ['neck', 'head'],
];
const DOTS = ['shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR'];

export function figureSVG(pose) {
  const j = joints(pose);
  const f = (n) => n.toFixed(3);
  let s = '<svg viewBox="-0.5 -1.02 1 1.08" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
  s += '<ellipse cx="0" cy="0.012" rx="0.3" ry="0.022" class="fig-ground"/>';
  s += '<g class="fig-bones" stroke-linecap="round" stroke-width="0.05" fill="none">';
  for (const [a, b] of BONES) s += `<line x1="${f(j[a].x)}" y1="${f(j[a].y)}" x2="${f(j[b].x)}" y2="${f(j[b].y)}"/>`;
  s += '</g>';
  s += `<circle class="fig-head" cx="${f(j.head.x)}" cy="${f(j.head.y)}" r="0.078"/>`;
  s += '<g class="fig-dots">';
  for (const d of DOTS) s += `<circle cx="${f(j[d].x)}" cy="${f(j[d].y)}" r="0.021"/>`;
  s += '</g></svg>';
  return s;
}

// MediaPipe pose landmark indices for each figure joint.
const MP = { head: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, toeL: 31, toeR: 32 };

// Fake a 33-point landmark set (screen space: x in [0, aspect], y in [0, 1]).
export function synth(pose, aspect = 16 / 9, scale = 0.75) {
  const j = joints(pose);
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
  for (const k in MP) lm[MP[k]] = { x: aspect / 2 + j[k].x * scale, y: 0.93 + j[k].y * scale, z: 0, v: 1 };
  return lm;
}
