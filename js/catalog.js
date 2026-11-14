// Exercise + program catalogs.
// measure(p, w, ctx) -> 0..1
//   p: 2D landmarks in mirrored screen space (x in [0, aspect], y in [0, 1]);
//      the child's left side appears on the left, like a mirror.
//   w: 3D world landmarks (metres) - used for joint angles so they hold up when a
//      limb moves toward the camera (e.g. knees in a squat).
// Landmark indices follow MediaPipe Pose.

const L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16,
  L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28;

const clamp = (v) => Math.min(1, Math.max(0, v));
const map = (v, a, b) => clamp((v - a) / (b - a));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const deg = (r) => (r * 180) / Math.PI;

// Interior angle at b (degrees), 3D-aware.
function ang(a, b, c) {
  const ux = a.x - b.x, uy = a.y - b.y, uz = (a.z || 0) - (b.z || 0);
  const vx = c.x - b.x, vy = c.y - b.y, vz = (c.z || 0) - (b.z || 0);
  const d = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1;
  return deg(Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / d))));
}

const raise = (w, s) => ang(w[L_EL + s], w[L_SH + s], w[L_HIP + s]);   // arm lift away from the body
const elbow = (w, s) => ang(w[L_SH + s], w[L_EL + s], w[L_WR + s]);
const knee = (w, s) => ang(w[L_HIP + s], w[L_KN + s], w[L_AN + s]);
const hipFlex = (w, s) => ang(w[L_SH + s], w[L_HIP + s], w[L_KN + s]);
const avg = (f, w) => (f(w, 0) + f(w, 1)) / 2;
const shW = (p) => Math.abs(p[L_SH].x - p[R_SH].x) || 1e-6;
const torso = (p) => dist(mid(p[L_SH], p[R_SH]), mid(p[L_HIP], p[R_HIP])) || 1e-6;
const stance = (p) => Math.abs(p[L_AN].x - p[R_AN].x) / shW(p);
// Signed sideways lean of the trunk; negative = toward screen-left.
const lean = (p) => {
  const s = mid(p[L_SH], p[R_SH]), h = mid(p[L_HIP], p[R_HIP]);
  return deg(Math.atan2(s.x - h.x, h.y - s.y));
};
const legOut = (p, s) => {
  const h = p[L_HIP + s], a = p[L_AN + s];
  return Math.abs(deg(Math.atan2(a.x - h.x, a.y - h.y)));
};
const reachDown = (p) => {
  const hy = (p[L_HIP].y + p[R_HIP].y) / 2, ay = (p[L_AN].y + p[R_AN].y) / 2;
  const wy = (p[L_WR].y + p[R_WR].y) / 2;
  return (wy - hy) / (ay - hy || 1e-6);
};
const footLift = (p) => Math.abs(p[L_AN].y - p[R_AN].y) / torso(p);
const handsTogetherUp = (p, w) => Math.min(map(avg(raise, w), 40, 150), map(dist(p[L_WR], p[R_WR]) / shW(p), 2.0, 0.7));
const near = (v, target, inner, outer) => 1 - map(Math.abs(v - target), inner, outer);

const ARMS = [11, 12, 13, 14, 15, 16], LEGS = [23, 24, 25, 26, 27, 28], ALL = [...ARMS, ...LEGS];

const T = (targets) => ({ rest: {}, targets });

export const EXERCISES = [
  // ---------- Workouts (count reps) ----------
  { id: 'squat', cat: 'workout', kind: 'rep', reps: 5, name: 'Frog Squats', emoji: '🐸',
    cue: 'Bend your knees like a frog, then stand up tall!', tip: 'Bend your knees a little more!',
    focus: [23, 24, 25, 26],
    measure: (p, w) => map(avg(knee, w), 160, 100),
    demo: { rest: {}, targets: [{ legL: 65, legR: 65, shinL: -15, shinR: -15, armL: 70, armR: 70 }] } },

  { id: 'jacks', cat: 'workout', kind: 'rep', reps: 6, name: 'Star Jumps', emoji: '⭐',
    cue: 'Jump your feet out and throw your arms up like a star!', tip: 'Reach your arms up higher!',
    focus: ALL,
    measure: (p, w) => Math.min(map(avg(raise, w), 40, 130), map(stance(p), 1.1, 1.8)),
    demo: T([{ armL: 150, armR: 150, legL: 25, legR: 25 }]) },

  { id: 'armRaise', cat: 'workout', kind: 'rep', reps: 6, name: 'Reach for the Sky', emoji: '☁️',
    cue: 'Lift both arms way up high, then bring them down!', tip: 'Stretch your arms all the way up!',
    focus: ARMS, upper: true,
    measure: (p, w) => map(avg(raise, w), 40, 155),
    demo: T([{ armL: 172, armR: 172 }]) },

  { id: 'march', cat: 'workout', kind: 'rep', reps: 8, name: 'Marching Band', emoji: '🥁',
    cue: 'March on the spot. Lift your knees up high!', tip: 'Lift your knee up higher!',
    focus: LEGS,
    measure: (p, w) => Math.max(map(hipFlex(w, 0), 165, 105), map(hipFlex(w, 1), 165, 105)),
    demo: T([{ legL: 78, shinL: 0, armR: 50 }, { legR: 78, shinR: 0, armL: 50 }]) },

  { id: 'sideBend', cat: 'workout', kind: 'rep', reps: 6, name: 'Windy Tree', emoji: '🌳',
    cue: 'Sway side to side like a tree in the wind!', tip: 'Lean over a little further!',
    focus: [11, 12, 23, 24],
    measure: (p) => map(Math.abs(lean(p)), 5, 22),
    demo: T([{ lean: -26, armL: 20, armR: 190 }, { lean: 26, armR: 20, armL: 190 }]) },

  { id: 'toeTouch', cat: 'workout', kind: 'rep', reps: 5, name: 'Touch Your Toes', emoji: '🦶',
    cue: 'Reach down to your toes, then stand back up!', tip: 'Reach down a bit lower!',
    focus: [15, 16, 27, 28],
    measure: (p) => map(reachDown(p), 0.3, 0.7),
    demo: T([{ fold: 1, armL: 4, armR: 4 }]) },

  { id: 'crossCrawl', cat: 'workout', kind: 'rep', reps: 6, name: 'Elbow to Knee', emoji: '🤸',
    cue: 'Lift a knee and tap it with your other elbow!', tip: 'Bring your elbow closer to your knee!',
    focus: [13, 14, 25, 26],
    measure: (p) => Math.max(map(dist(p[L_EL], p[R_KN]) / shW(p), 1.5, 0.6), map(dist(p[R_EL], p[L_KN]) / shW(p), 1.5, 0.6)),
    demo: T([{ fold: 0.4, legR: -70, shinR: 0, armL: -10, foreL: -10 }, { fold: 0.4, legL: -70, shinL: 0, armR: -10, foreR: -10 }]) },

  { id: 'hops', cat: 'workout', kind: 'rep', reps: 6, name: 'Bunny Hops', emoji: '🐰',
    cue: 'Hop up and down like a bunny!', tip: 'Jump a little higher!',
    focus: [27, 28],
    measure: (p, w, ctx) => {
      const ay = (p[L_AN].y + p[R_AN].y) / 2;
      if (ctx.base == null) ctx.base = ay;
      // Floor line: follows the feet down quickly, drifts up slowly.
      const tau = ay > ctx.base ? 0.15 : 4;
      ctx.base += (ay - ctx.base) * (1 - Math.exp(-ctx.dt / tau));
      return map((ctx.base - ay) / torso(p), 0.06, 0.25);
    },
    demo: T([{ lift: 0.09, armL: 30, armR: 30 }]) },

  { id: 'clapSky', cat: 'workout', kind: 'rep', reps: 6, name: 'Clap the Sky', emoji: '👏',
    cue: 'Clap your hands high above your head!', tip: 'Clap up high over your head!',
    focus: ARMS, upper: true,
    measure: handsTogetherUp,
    demo: T([{ armL: 165, armR: 165, foreL: 215, foreR: 215 }]) },

  { id: 'sideKick', cat: 'workout', kind: 'rep', reps: 6, name: 'Side Kicks', emoji: '🦵',
    cue: 'Lift one leg out to the side, then the other!', tip: 'Lift your leg out a bit more!',
    focus: LEGS,
    measure: (p) => Math.max(map(legOut(p, 0), 10, 35), map(legOut(p, 1), 10, 35)),
    demo: T([{ legL: 42, armL: 60, armR: 60 }, { legR: 42, armL: 60, armR: 60 }]) },

  { id: 'pickApples', cat: 'workout', kind: 'rep', reps: 8, name: 'Pick Apples', emoji: '🍎',
    cue: 'Reach up with one hand to pick an apple, then the other!', tip: 'Reach up higher for the apple!',
    focus: ARMS, upper: true,
    measure: (p, w) => Math.max(map(raise(w, 0), 40, 155), map(raise(w, 1), 40, 155)),
    demo: T([{ armL: 172 }, { armR: 172 }]) },

  { id: 'speedyFeet', cat: 'workout', kind: 'rep', reps: 10, name: 'Speedy Feet', emoji: '🏃',
    cue: 'Run on the spot as fast as you can!', tip: 'Pick your feet up!',
    focus: LEGS,
    measure: (p, w) => Math.max(map(hipFlex(w, 0), 170, 130), map(hipFlex(w, 1), 170, 130)),
    demo: T([{ legL: 52, shinL: -20, armR: 40, armL: -20 }, { legR: 52, shinR: -20, armL: 40, armR: -20 }]) },

  { id: 'wings', cat: 'workout', kind: 'rep', reps: 8, name: 'Flap Your Wings', emoji: '🐦',
    cue: 'Flap your arms up and down like a bird!', tip: 'Lift your wings up to your shoulders!',
    focus: ARMS, upper: true,
    measure: (p, w) => map(avg(raise, w), 25, 85),
    demo: T([{ armL: 95, armR: 95 }]) },

  { id: 'muscles', cat: 'workout', kind: 'rep', reps: 6, name: 'Show Your Muscles', emoji: '💪',
    cue: 'Arms out wide, then bend your elbows to show your muscles!', tip: 'Keep your elbows up and squeeze!',
    focus: ARMS, upper: true,
    measure: (p, w) => Math.min(map(avg(elbow, w), 150, 75), map(avg(raise, w), 50, 80)),
    demo: { rest: { armL: 90, armR: 90 }, targets: [{ armL: 90, armR: 90, foreL: 200, foreR: 200 }] } },

  // ---------- Stretches (hold still) ----------
  { id: 'giraffe', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Giraffe Stretch', emoji: '🦒',
    cue: 'Reach both arms up tall like a giraffe and hold!', tip: 'Stretch up as tall as you can!',
    focus: ARMS, upper: true,
    measure: (p, w) => map(avg(raise, w), 60, 160),
    demo: T([{ armL: 174, armR: 174 }]) },

  { id: 'rainbow', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Rainbow Bend', emoji: '🌈',
    cue: 'Bend to one side like a rainbow and hold. Then the other side!', tip: 'Lean over like the coach!',
    focus: [11, 12, 23, 24],
    measure: (p, w, ctx) => map(lean(p) * (ctx.side ? 1 : -1), 5, 20),
    demo: T([{ lean: -24, armL: 20, armR: 195 }, { lean: 24, armR: 20, armL: 195 }]) },

  { id: 'ragDoll', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Rag Doll', emoji: '🧸',
    cue: 'Fold forward and let your arms hang down like a floppy doll!', tip: 'Let your hands hang lower!',
    focus: [15, 16, 27, 28],
    measure: (p) => map(reachDown(p), 0.3, 0.7),
    demo: T([{ fold: 1, armL: 4, armR: 4 }]) },

  { id: 'airplane', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Airplane Arms', emoji: '✈️',
    cue: 'Hold your arms out straight like airplane wings!', tip: 'Keep your arms straight out to the sides!',
    focus: ARMS, upper: true,
    measure: (p, w) => Math.min(near(raise(w, 0), 90, 15, 50), near(raise(w, 1), 90, 15, 50), map(avg(elbow, w), 110, 150)),
    demo: T([{ armL: 90, armR: 90 }]) },

  { id: 'starfish', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Starfish', emoji: '🌟',
    cue: 'Arms out, legs wide. Be a big starfish and hold!', tip: 'Make your star even bigger!',
    focus: ALL,
    measure: (p, w) => Math.min(map(avg(raise, w), 50, 105), map(stance(p), 1.1, 1.8)),
    demo: T([{ armL: 125, armR: 125, legL: 25, legR: 25 }]) },

  { id: 'flamingo', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 4, name: 'Flamingo Stand', emoji: '🦩',
    cue: 'Stand on one leg like a flamingo. Then switch legs!', tip: 'Lift your foot a bit higher!',
    focus: LEGS,
    measure: (p) => map(footLift(p), 0.1, 0.35),
    demo: T([{ legL: 50, shinL: -40, armL: 80, armR: 80 }, { legR: 50, shinR: -40, armL: 80, armR: 80 }]) },

  { id: 'bigHug', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Big Bear Hug', emoji: '🐻',
    cue: 'Wrap your arms around yourself for a big bear hug!', tip: 'Hug yourself tighter!',
    focus: ARMS, upper: true,
    measure: (p) => (map(dist(p[L_WR], p[R_SH]) / shW(p), 1.3, 0.5) + map(dist(p[R_WR], p[L_SH]) / shW(p), 1.3, 0.5)) / 2,
    demo: T([{ armL: -30, armR: -30, foreL: -132, foreR: -132 }]) },

  { id: 'cactus', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Cactus Arms', emoji: '🌵',
    cue: 'Elbows out, hands up. Stand like a cactus!', tip: 'Elbows level with your shoulders, hands up!',
    focus: ARMS, upper: true,
    measure: (p, w) => (p[L_WR].y < p[L_EL].y && p[R_WR].y < p[R_EL].y)
      ? Math.min(near(raise(w, 0), 90, 20, 50), near(raise(w, 1), 90, 20, 50), near(elbow(w, 0), 90, 25, 60), near(elbow(w, 1), 90, 25, 60))
      : 0,
    demo: T([{ armL: 90, armR: 90, foreL: 180, foreR: 180 }]) },

  { id: 'owl', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 4, name: 'Sleepy Owl', emoji: '🦉',
    cue: 'Gently tip your ear toward your shoulder. Then the other side!', tip: 'Tip your head a little more, nice and slow!',
    focus: [7, 8, 11, 12], upper: true,
    measure: (p) => {
      const e = Math.atan2(p[R_EAR].y - p[L_EAR].y, p[R_EAR].x - p[L_EAR].x);
      const s = Math.atan2(p[R_SH].y - p[L_SH].y, p[R_SH].x - p[L_SH].x);
      return map(Math.abs(deg(e - s)), 6, 20);
    },
    demo: T([{ headTilt: -26 }, { headTilt: 26 }]) },

  { id: 'chair', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 4, name: 'Invisible Chair', emoji: '🪑',
    cue: 'Bend your knees and sit on a pretend chair. Hold it!', tip: 'Sit down a little lower!',
    focus: [23, 24, 25, 26],
    measure: (p, w) => map(avg(knee, w), 165, 125),
    demo: T([{ legL: 50, legR: 50, shinL: -10, shinR: -10, armL: 85, armR: 85 }]) },

  { id: 'tree', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 4, name: 'Tree Pose', emoji: '🌲',
    cue: 'Stand on one leg and grow your branches up high!', tip: 'Lift your foot and reach up!',
    focus: ALL,
    measure: (p, w) => Math.min(map(footLift(p), 0.1, 0.35), map(avg(raise, w), 60, 150)),
    demo: T([{ legL: 55, shinL: -50, armL: 168, armR: 168 }, { legR: 55, shinR: -50, armL: 168, armR: 168 }]) },

  { id: 'rocket', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Rocket Ship', emoji: '🚀',
    cue: 'Hands together over your head. You are a rocket! Hold still!', tip: 'Press your hands together up high!',
    focus: ARMS, upper: true,
    measure: handsTogetherUp,
    demo: T([{ armL: 165, armR: 165, foreL: 215, foreR: 215 }]) },

  { id: 'chicken', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Chicken Wings', emoji: '🐔',
    cue: 'Put your hands on your shoulders and lift your elbows!', tip: 'Fingers on shoulders, elbows out!',
    focus: ARMS, upper: true,
    measure: (p, w) => Math.min(
      (map(dist(p[L_WR], p[L_SH]) / shW(p), 1.0, 0.4) + map(dist(p[R_WR], p[R_SH]) / shW(p), 1.0, 0.4)) / 2,
      map(avg(raise, w), 25, 55)),
    demo: T([{ armL: 70, armR: 70, foreL: -110, foreR: -110 }]) },

  { id: 'giant', cat: 'stretch', kind: 'hold', reps: 2, holdSec: 5, name: 'Giant Steps', emoji: '👣',
    cue: 'Step your feet far apart like a giant and hold!', tip: 'Step your feet wider!',
    focus: LEGS,
    measure: (p) => map(stance(p), 1.3, 2.1),
    demo: T([{ legL: 28, legR: 28, armL: 35, armR: 35, foreL: -30, foreR: -30 }]) },
];

export const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const PROGRAMS = [
  { id: 'sunny', name: 'Sunny Morning Wake-Up', emoji: '🌞', hue: 38, blurb: 'Gentle moves to start the day.',
    steps: ['giraffe', 'owl', 'airplane', 'wings', 'rainbow', 'ragDoll', 'march', 'starfish', 'bigHug', 'rocket'] },
  { id: 'jungle', name: 'Jungle Adventure', emoji: '🦁', hue: 140, blurb: 'Move like the animals!',
    steps: ['giraffe', 'squat', 'march', 'pickApples', 'sideBend', 'flamingo', 'hops', 'crossCrawl', 'wings', 'toeTouch', 'tree', 'bigHug'] },
  { id: 'hero', name: 'Superhero Training', emoji: '🦸', hue: 350, blurb: 'Get strong and speedy.',
    steps: ['muscles', 'armRaise', 'squat', 'jacks', 'sideKick', 'clapSky', 'speedyFeet', 'crossCrawl', 'hops', 'airplane', 'chair', 'cactus', 'rocket'] },
  { id: 'wiggle', name: 'Wiggle Break', emoji: '🪱', hue: 275, blurb: 'Shake out the sillies, fast.',
    steps: ['speedyFeet', 'jacks', 'wings', 'hops', 'sideBend', 'clapSky', 'march', 'toeTouch', 'starfish', 'bigHug'] },
  { id: 'calm', name: 'Calm Down Stretch', emoji: '🌙', hue: 225, blurb: 'Slow stretches to relax.',
    steps: ['giraffe', 'rainbow', 'owl', 'chicken', 'cactus', 'airplane', 'giant', 'ragDoll', 'tree', 'bigHug', 'rocket'] },
  { id: 'ocean', name: 'Ocean Explorers', emoji: '🐙', hue: 190, blurb: 'The big one: 15 moves under the sea.',
    steps: ['starfish', 'wings', 'squat', 'sideKick', 'pickApples', 'hops', 'giant', 'toeTouch', 'crossCrawl', 'flamingo', 'clapSky', 'march', 'airplane', 'ragDoll', 'bigHug'] },
];
