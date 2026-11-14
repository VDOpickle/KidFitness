// Drives every exercise's detector with its own coach animation.
// Run: node test/engine.test.mjs
import { EXERCISES, PROGRAMS, byId } from '../js/catalog.js';
import { Tracker } from '../js/engine.js';
import { lerpPose, synth } from '../js/figure.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };

function run(ex, amp, seconds = 60) {
  const tr = new Tracker(ex);
  let a = 0;
  for (let t = 0; t < seconds * 1000 && !tr.done; t += 16) {
    const tgt = ex.demo.targets[tr.reps.length % ex.demo.targets.length];
    if (ex.kind === 'rep') a = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t % 1700)) / 1700);
    else a += ((tr.state === 'cool' ? 0 : 1) - a) * 0.08;
    const lm = synth(lerpPose(ex.demo.rest, tgt, a * amp));
    tr.update(lm, lm, t);
  }
  return tr;
}

for (const ex of EXERCISES) {
  const full = run(ex, 1);
  check(full.done, `${ex.id}: full-range demo did not complete (${full.reps.length}/${ex.reps})`);
  check(full.reps.every((s) => s === 5), `${ex.id}: full-range demo should be 5 stars, got ${full.reps}`);
  const idle = run(ex, 0, 10);
  check(idle.reps.length === 0, `${ex.id}: standing still counted ${idle.reps.length} reps`);
  const partial = run(ex, 0.8, 30); // informational: shows how forgiving each detector is
  console.log(ex.id.padEnd(12), 'full', full.reps.join(''), ' 80%', partial.reps.join('') || '-');
}

for (const p of PROGRAMS) {
  check(p.steps.length >= 10 && p.steps.length <= 15, `${p.id}: ${p.steps.length} steps`);
  for (const s of p.steps) check(byId[s], `${p.id}: unknown exercise ${s}`);
  check(new Set(p.steps).size === p.steps.length, `${p.id}: duplicate steps`);
}

console.log(fail ? `\n${fail} failure(s)` : '\nall checks passed');
process.exit(fail ? 1 : 0);
