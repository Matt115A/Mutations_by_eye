import { OnlineLogReg, standardiser } from './features';
import { makeRng, type Rng } from './rng';
import { SessionCore } from './session';
import type { Config, Dataset, Label, PriorExperience, Session, Variant } from './types';

/** Toy player for debug runs/tests: noisy online logistic regression on the displayed cues. */
export class SimPlayer {
  private rng: Rng; private m: OnlineLogReg; private x: (v: Variant) => number[];
  constructor(seed: number, all: Variant[]) { this.rng = makeRng(seed); this.x = standardiser(all); this.m = new OnlineLogReg(this.x(all[0]).length, 0.03); }
  respond(v: Variant): { label: Label; rt: number } {
    const noisy = this.x(v).map((xi) => xi + (this.rng() - 0.5) * 1.2);
    const p = this.m.p(noisy);
    const label: Label = this.rng() < 0.08 ? (this.rng() < 0.5 ? 0 : 1) : this.rng() < p ? 1 : 0;
    return { label, rt: 2500 + 6000 * this.rng() * (1 - Math.abs(p - 0.5)) };
  }
  learn(v: Variant) { this.m.update(this.x(v), v.label); }
}

export function simulateSession(config: Config, data: Dataset, seed?: number, opts: { exclude?: Set<number>; prior?: PriorExperience } = {}): Session {
  const start = new Date();
  const core = new SessionCore(config, data, { seed, simulated: true, startTime: start, ...opts });
  const player = new SimPlayer(core.meta.seed ^ 0x9e37, data.variants);
  let t = 0, perf = 1000, reason: string | null = null;
  while (!(reason = core.endReason(t))) {
    const ph = core.phase!;
    const s = core.nextStimulus();
    if (!s) { reason = 'pool_exhausted'; break; }
    const { label, rt } = player.respond(s.v);
    core.record({ v: s.v, block: s.block, pressedKey: config.keys[label], rtMs: rt, onsetPerf: perf, responsePerf: perf + rt, wallOnset: new Date(start.getTime() + t), elapsedMs: t });
    if (ph.feedback !== 'none') player.learn(s.v);
    const step = rt + 2500;
    t += step; perf += step;
  }
  return core.finish(reason, t, 0, new Date(start.getTime() + t));
}
