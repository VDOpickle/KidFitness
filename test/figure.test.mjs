// Front and side figures: nothing falls off the canvas, feet stay on the floor, side poses match their front poses.
// Run: node test/figure.test.mjs
import { EXERCISES } from '../js/catalog.js';
import { viewPoses, joints, sideJoints, landmarksFromJoints, sideLandmarks, synth } from '../js/figure.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const inside = (lm) => lm.every((p) => !p.visibility || (p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99));
let authored = 0;

for (const ex of EXERCISES) {
  const d = ex.demo;
  check(!d.side || d.side.targets.length === d.targets.length, `${ex.id}: side targets must match front targets`);
  if (d.side) authored++;
  for (let w = 0; w < d.targets.length; w++) for (const a of [0, 0.5, 1]) {
    const v = viewPoses(d, w, a);
    const front = landmarksFromJoints(joints(v.front), { aspect: 0.75 });
    const side = landmarksFromJoints(sideJoints(v.side, v.planar), { aspect: 0.75 });
    check(inside(front), `${ex.id}: front figure leaves the panel (target ${w}, a=${a})`);
    check(inside(side), `${ex.id}: side figure leaves the panel (target ${w}, a=${a})`);
    const sj = sideJoints(v.side, v.planar);
    const air = (v.side.lift || 0) + (v.side.rise || 0) * 0.045; // jumps and tiptoes leave the floor on purpose
    check(Math.abs(Math.max(sj.anL.y, sj.anR.y) + air) < 1e-6, `${ex.id}: side view feet are not on the floor`);
    check(Object.values(sj).every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)), `${ex.id}: side view has NaN`);
  }
}
console.log(`${authored} exercises have authored side poses; the other ${EXERCISES.length - authored} use the projected front pose`);

// Authored side poses really bend the knee / lean forward at full effort.
{
  const sq = EXERCISES.find((e) => e.id === 'squat'), v = viewPoses(sq.demo, 0, 1), j = sideJoints(v.side, true), s0 = sideJoints({}, true);
  check(j.knL.x - j.hipL.x > 0.15, 'squat: knees should be well forward of the hips');
  check(j.neck.x > 0.1, 'squat: torso should lean forward');
  check(s0.neck.x < 0.01 && Math.abs(s0.knL.x) < 0.05, 'standing side view should be upright');
  const up = sideJoints({ armL: 172, armR: 172 }, false);
  check(Math.abs(up.wrL.x - up.neck.x) < 1e-6 && up.wrL.y < up.neck.y - 0.2, 'arms raised sideways should look like a vertical line from the side');
  const fold = sideJoints({ fold: 1 }, false);
  check(fold.neck.x > 0.2 && fold.head.y > fold.neck.y - 0.1, 'a forward fold should tip the torso forward and hang the head');
}

// A measured body (world landmarks) is scaled by its own torso, so a small child fills the panel like a tall adult.
{
  const body = (scale) => {
    const lm = synth({ legL: 40, shinL: -30 }, 1, 1).map((p) => ({ x: p.x * scale, y: p.y * scale, z: -0.0 }));
    return lm;
  };
  const a = sideLandmarks(body(1)), b = sideLandmarks(body(2));
  const h = (lm) => Math.max(...lm.filter((p) => p.visibility).map((p) => p.y)) - Math.min(...lm.filter((p) => p.visibility).map((p) => p.y));
  check(Math.abs(h(a) - h(b)) < 0.02, 'side view should be independent of body size');
}
console.log(fail ? `\n${fail} failure(s)` : '\nall checks passed');
process.exit(fail ? 1 : 0);
