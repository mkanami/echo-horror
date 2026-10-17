const GRAVITY = 15;
const IMPACT_DEPTH = -7;
const DRAG = 3;

export class PitFall {
  constructor(vx, vz) {
    this.vx = vx; this.vz = vz;
    this.y = this.vy = this.time = 0;
    this.impacted = false;
  }

  advance(dt) {
    if (this.impacted || dt <= 0) return { x: 0, z: 0 };
    // Integrate exactly so the fall and momentum agree at any frame rate.
    const remaining = (this.vy + Math.sqrt(this.vy ** 2 + 2 * GRAVITY * (this.y - IMPACT_DEPTH))) / GRAVITY;
    const t = Math.min(dt, remaining), decay = Math.exp(-DRAG * t);
    const drift = { x: this.vx * (1 - decay) / DRAG, z: this.vz * (1 - decay) / DRAG };
    this.y += this.vy * t - GRAVITY * t * t / 2;
    this.vy -= GRAVITY * t;
    this.vx *= decay; this.vz *= decay;
    this.time += t;
    if (dt >= remaining) { this.y = IMPACT_DEPTH; this.impacted = true; }
    return drift;
  }
}
