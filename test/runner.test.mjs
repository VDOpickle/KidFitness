// Road Run: course sanity, pose -> input mapping, and full playthroughs by a bot.
// Run: node test/runner.test.mjs
import { LEVELS, RunnerGame, Bot, inputFromPose, buildCourse } from '../js/runner.js';
import { synth, lerpPose } from '../js/figure.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const DT = 1 / 60;

// 1. Each body move produces the right game input.
{
  const ctx = { dt: DT };
  const at = (pose) => { const lm = synth(pose); return inputFromPose(lm, lm, ctx); };
  const stand = at({});
  check(stand.lane === 0 && stand.duck < 0.1 && stand.reach < 0.1 && stand.jump < 0.1, `standing should be neutral: ${JSON.stringify(stand)}`);
  check(at({ lean: -18 }).lane === -1, 'leaning left should pick the left lane');
  check(at({ lean: 0 }).lane === 0, 'standing up should return to the middle lane');
  check(at({ lean: 18 }).lane === 1, 'leaning right should pick the right lane');
  at({});
  check(at({ legL: 65, legR: 65, shinL: -15, shinR: -15 }).duck > 0.8, 'squatting should duck');
  check(at({ armL: 172, armR: 172 }).reach > 0.9, 'arms up should reach');
  let jumped = 0;
  for (let i = 0; i < 12; i++) jumped = Math.max(jumped, at({ lift: 0.09 * Math.sin((Math.PI * i) / 11) }).jump);
  check(jumped >= 0.5, `a hop should read as a jump (${jumped.toFixed(2)})`);
}

function play(level, mode) {
  const G = new RunnerGame(level), bot = new Bot(), ctx = { dt: DT };
  for (let i = 0; i < 60 * 240 && !G.done; i++) {
    let inp = {};
    if (mode !== 'idle') {
      const lm = synth(bot.step(G, DT, true));
      inp = inputFromPose(lm, lm, ctx);
    } else {
      const lm = synth({});
      inp = inputFromPose(lm, lm, ctx);
    }
    G.update(DT, inp);
  }
  return G;
}

for (const lv of LEVELS) {
  const c = buildCourse(lv);
  const kinds = new Set(c.items.map((i) => i.t));
  for (const m of lv.moves) {
    const need = { lean: 'block', jump: 'hurdle', duck: 'beam', reach: 'balloon' }[m];
    check(kinds.has(need), `${lv.id}: course has no ${need}`);
  }
  check(c.items.some((i) => i.t === 'star'), `${lv.id}: no stars to collect`);
  const bot = play(lv, 'bot'), idle = play(lv, 'idle');
  const rb = bot.result(), ri = idle.result();
  console.log(lv.id.padEnd(7), `bot: ${rb.collected}/${rb.total} stars, ${rb.bumps} bumps, ${rb.rating}★ | idle: ${ri.collected}/${ri.total}, ${ri.bumps} bumps, ${ri.rating}★ | ${Math.round(bot.t)}s`);
  check(bot.done, `${lv.id}: bot did not finish`);
  check(rb.bumps === 0 && rb.collected === rb.total && rb.rating === 5, `${lv.id}: a perfect player should get everything`);
  check(ri.bumps > 0 && ri.rating <= 2, `${lv.id}: standing still should not score well`);
  check(bot.t > 35 && bot.t < 120, `${lv.id}: course length ${Math.round(bot.t)}s is off`);
}

console.log(fail ? `\n${fail} failure(s)` : '\nall checks passed');
process.exit(fail ? 1 : 0);
