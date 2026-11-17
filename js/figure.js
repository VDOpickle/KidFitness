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

// ---------------------------------------------------------------------------------------------
// Side view. The figure faces screen-right; the near limb is the child's left.
//
//  planar = true : the pose is authored for the side view (angles are forward swings: armL 80 = arm
//                  straight out in front, legL 70 = thigh forward). Used for squats, marching, etc.
//  planar = false: the pose is a front-view pose. Its limbs are projected onto the side plane, so arms
//                  raised out to the side point at the camera and appear as short vertical lines.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const foldAngle = (fold) => Math.acos(clamp(1 - 1.1 * fold, -1, 1)) / D;

export function sideJoints(pose, planar = false) {
  const p = resolve(pose);
  const fwd = (planar ? p.lean : 0) + foldAngle(p.fold);
  const lat = planar ? 0 : p.lean * D;
  const T = DIM.torso, f = fwd * D;
  const neck = { x: Math.sin(f) * T, y: -Math.cos(f) * Math.cos(lat) * T };
  const ha = (fwd + 25 * p.fold) * D;
  const j = { neck, shL: neck, shR: neck, hipL: { x: 0, y: 0 }, hipR: { x: 0, y: 0 } };
  j.head = { x: neck.x + Math.sin(ha) * DIM.neck, y: neck.y - Math.cos(ha) * DIM.neck };
  j.earL = j.head; j.earR = j.head;
  const seg = (from, len, ang) => (planar
    ? { x: from.x + Math.sin(ang * D) * len, y: from.y + Math.cos(ang * D) * len }
    : { x: from.x, y: from.y + Math.cos(ang * D) * len }); // front-view limb seen end-on
  j.elL = seg(neck, DIM.upper, p.armL); j.elR = seg(neck, DIM.upper, p.armR);
  j.wrL = seg(j.elL, DIM.fore, p.foreL); j.wrR = seg(j.elR, DIM.fore, p.foreR);
  j.knL = seg(j.hipL, DIM.thigh, p.legL); j.knR = seg(j.hipR, DIM.thigh, p.legR);
  j.anL = seg(j.knL, DIM.shin, p.shinL); j.anR = seg(j.knR, DIM.shin, p.shinR);
  const up = p.rise * 0.045;
  const dy = -Math.max(j.anL.y, j.anR.y) - p.lift - up;
  for (const k in j) j[k] = { x: j[k].x, y: j[k].y + dy };
  j.toeL = { x: j.anL.x + 0.07, y: j.anL.y + up }; j.toeR = { x: j.anR.x + 0.07, y: j.anR.y + up };
  return j;
}

/** Front pose, side pose and whether the side pose is authored, for coach target `which` at blend `a`. */
export function viewPoses(demo, which, a) {
  const front = lerpPose(demo.rest, demo.targets[which % demo.targets.length], a);
  const sd = demo.side;
  const side = sd ? lerpPose(sd.rest, sd.targets[which % sd.targets.length], a) : front;
  return { front, side, planar: !!sd };
}

/** Joints -> 33 normalised landmarks (0..1 of a w x h canvas, y down) so the avatar and skeleton drawers can use them. */
export function landmarksFromJoints(j, { aspect = 1, k = 0.84, cx = 0.5, floorY = 0.96 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const key in MP) if (j[key]) lm[MP[key]] = { x: cx + (j[key].x * k) / aspect, y: floorY + j[key].y * k, z: 0, visibility: 1 };
  return lm;
}

/** Side view of a measured body (MediaPipe world landmarks, metres). Faces screen-right, feet on the floor line.
 *  Scaled from the torso length so a child and an adult fill the panel alike. */
export function sideLandmarks(wl, { aspect = 1, k = 0.84, cx = 0.5, floorY = 0.96 } = {}) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
  const sh = mid(wl[11], wl[12]), hp = mid(wl[23], wl[24]);
  const T = Math.hypot(sh.x - hp.x, sh.y - hp.y, sh.z - hp.z) || 0.3;
  const s = (k * DIM.torso) / T;
  let low = -9;
  for (const i of [27, 28, 31, 32]) low = Math.max(low, wl[i].y);
  return wl.map((q) => ({ x: cx + ((-(q.z || 0) + hp.z) * s) / aspect, y: floorY + (q.y - low) * s, z: 0, visibility: 1 }));
}
