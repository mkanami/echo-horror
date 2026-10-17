// Generator work has one clock. Visual phases, inventory changes and audible
// pump strokes use these same boundaries, including long frames and retries.
export class GeneratorSequence {
  constructor({ installed = 0, fueled = false } = {}) {
    this.stages = [];
    for (let slot = installed; slot < 2; slot++) this.stages.push({ kind: 'insertFuse', slot, duration: 1.25, marker: 0.82, event: 'insert' });
    if (!fueled) this.stages.push(
      { kind: 'uncap', duration: 0.8, marker: 0.62, event: 'capOpen' },
      { kind: 'pour', duration: 2.6, marker: 0.93, event: 'fuel', sounds: [0.28, 0.5, 0.72] },
      { kind: 'recap', duration: 0.65, marker: 0.62, event: 'capClose' },
    );
    this.stages.push({ kind: 'prime', duration: 5 });
    this.duration = this.stages.reduce((n, s) => n + s.duration, 0);
    this.t = 0;
    this.emitted = new Set();
  }

  advance(dt) {
    this.t = Math.min(this.duration, this.t + dt);
    const events = [];
    let start = 0;
    for (const stage of this.stages) {
      const markers = stage.kind === 'prime'
        ? Array.from({ length: 5 }, (_, index) => ({ at: start + index + 0.62, key: `pump${index}`, event: 'pump', index }))
        : stage.event ? [{ at: start + stage.duration * stage.marker, key: `${stage.event}${stage.slot ?? ''}`, event: stage.event, slot: stage.slot }] : [];
      for (const [index, at] of (stage.sounds || []).entries()) markers.push({ at: start + stage.duration * at, key: `liquid${index}`, event: 'liquid' });
      markers.sort((a,b)=>a.at-b.at);
      for (const marker of markers) if (this.t >= marker.at && !this.emitted.has(marker.key)) {
        this.emitted.add(marker.key);
        events.push(marker);
      }
      start += stage.duration;
    }
    return events;
  }

  get done() { return this.t >= this.duration; }
  get frame() {
    let start = 0;
    for (const stage of this.stages) {
      if (this.t < start + stage.duration || stage === this.stages.at(-1)) {
        const time = Math.max(0, this.t - start);
        return { ...stage, time, k: Math.min(1, time / stage.duration), total: this.t / this.duration };
      }
      start += stage.duration;
    }
  }
}

export const FUSE_ACTIONS = {
  unscrew: { duration: 2.8, grip: 0.22, commit: 0.72 },
  pickupFuse: { duration: 1.65, grip: 0.34, commit: 0.4 },
};
