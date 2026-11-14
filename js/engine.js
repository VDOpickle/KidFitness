// Rep / hold tracking and star scoring. DOM-free so it can be tested in Node.
//
// Every exercise supplies measure(p, w, ctx) -> 0..1 "how close to the target pose".
//   rep  : progress rises past ENTER, then falls back below EXIT  => one rep,
//          scored on the best progress reached (range of motion).
//   hold : progress stays above HOLD_MIN until holdSec seconds are banked => one rep,
//          scored on the average progress while holding.
// Scoring is deliberately generous: any counted rep earns at least 1 star.

export const ENTER = 0.5, EXIT = 0.25, HOLD_MIN = 0.55;

export function starsFor(kind, q) {
  const cuts = kind === 'hold' ? [0.64, 0.72, 0.8, 0.9] : [0.6, 0.71, 0.82, 0.93];
  let s = 1;
  for (const c of cuts) if (q >= c) s++;
  return s;
}

export class Tracker {
  constructor(ex) {
    this.ex = ex;
    this.ctx = { side: 0, dt: 0 };
    this.reps = [];      // stars for each completed rep
    this.state = 'rest'; // rest | active | cool
    this.prog = 0;       // smoothed 0..1
    this.held = 0;       // seconds banked in the current hold
    this.sum = 0;
    this.grace = 0;
    this.peak = 0;
    this.last = null;
  }

  get done() { return this.reps.length >= this.ex.reps; }

  // Returns the star count when a rep completes on this frame, otherwise 0.
  update(p, w, t) {
    const dt = this.last == null ? 0 : Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    const first = this.last == null;
    this.last = t;
    this.ctx.dt = dt;
    let raw = this.ex.measure(p, w, this.ctx);
    if (!Number.isFinite(raw)) raw = 0;
    raw = Math.min(1, Math.max(0, raw));
    this.prog = first ? raw : this.prog + (raw - this.prog) * (1 - Math.exp(-dt / 0.05));
    const g = this.prog;

    if (this.ex.kind === 'hold') {
      if (this.state === 'cool') {
        if (t >= this.coolUntil) this.state = 'rest';
        return 0;
      }
      if (g >= HOLD_MIN) {
        this.state = 'active';
        this.grace = 0;
        this.held += dt;
        this.sum += g * dt;
      } else if (this.state === 'active') {
        // A wobble pauses the timer instead of resetting it.
        this.grace += dt;
        if (this.grace > 1) this.state = 'rest';
      }
      if (this.held >= this.ex.holdSec) {
        const s = this._finish(this.sum / this.held);
        this.held = 0; this.sum = 0;
        this.state = 'cool';
        this.coolUntil = t + 1500;
        return s;
      }
      return 0;
    }

    if (this.state === 'rest') {
      if (g >= ENTER) { this.state = 'active'; this.peak = g; this.tStart = t; }
    } else {
      this.peak = Math.max(this.peak, g);
      if (g <= EXIT) {
        this.state = 'rest';
        if (t - this.tStart >= 120) return this._finish(this.peak);
      }
    }
    return 0;
  }

  _finish(q) {
    const s = starsFor(this.ex.kind, q);
    this.reps.push(s);
    this.ctx.side = this.reps.length % 2;
    return s;
  }
}
