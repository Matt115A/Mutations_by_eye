import { freshSeed, makeRng, type Rng, shuffle } from './rng';
import type { Config, Dataset, Label, PhaseSpec, PriorExperience, Session, SessionMeta, TrialRecord, Variant } from './types';
import { mutationName } from './dataset';

export const APP_VERSION = '1.0.0';

export interface ResponseInput { v: Variant; block: number; pressedKey: string; rtMs: number; onsetPerf: number; responsePerf: number; wallOnset: Date; elapsedMs: number }

/**
 * Experiment rules, no DOM. Parts run in order; each draws from its protein group in blocks of 8
 * (4 deleterious + 4 fit, rotating through the group's proteins), without replacement, never the same
 * position twice in a row, and never a variant seen in an earlier session.
 */
export class SessionCore {
  readonly config: Config;
  readonly meta: SessionMeta;
  readonly trials: TrialRecord[] = [];
  phaseIdx = 0;
  private inPhase = 0;
  private rng: Rng;
  private block = 0;
  private queue: { protein: string; label: Label }[] = [];
  private pools = new Map<string, Variant[]>();      // `${protein}|${label}` → shuffled remaining variants
  private proteinsByGroup = new Map<string, string[]>();
  private rot = new Map<string, number>();
  private last: Variant | null = null;

  constructor(config: Config, data: Dataset, opts: { seed?: number; simulated?: boolean; startTime?: Date; exclude?: Set<number>; prior?: PriorExperience } = {}) {
    this.config = structuredClone(config);
    const seed = opts.seed ?? freshSeed();
    this.rng = makeRng(seed);
    const ex = config.excludeSeen ? opts.exclude ?? new Set<number>() : new Set<number>();
    for (const v of shuffle(data.variants.filter((x) => !ex.has(x.id)), this.rng)) {
      const k = `${v.protein.id}|${v.label}`;
      if (!this.pools.has(k)) this.pools.set(k, []);
      this.pools.get(k)!.push(v);
    }
    for (const p of data.proteins) {
      if (!this.proteinsByGroup.has(p.group)) this.proteinsByGroup.set(p.group, []);
      this.proteinsByGroup.get(p.group)!.push(p.id);
    }
    const start = opts.startTime ?? new Date();
    this.meta = {
      app: 'protein-effects', app_version: APP_VERSION, session_id: `${start.toISOString().replace(/[:.]/g, '-')}_${seed.toString(16)}`,
      seed, simulated: !!opts.simulated, config: this.config, dataset_version: data.version,
      phase_starts: { [config.phases[0].name]: 1 }, prior: opts.prior ?? { sessions: 0, trials: 0, session_ids: [], excluded_windows: 0 },
      start_time: start.toISOString(), end_time: null, end_reason: null, total_trials: 0, active_duration_ms: 0, paused_ms: 0,
      environment: { user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node', estimated_frame_ms: null, screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'n/a' },
      timing_notes: 'Onset = first animation frame after the trial panels rendered; response = keydown timeStamp. Trials are self-paced and long, so RT is a rough measure here.',
    };
  }

  get phase(): PhaseSpec | null { return this.config.phases[this.phaseIdx] ?? null; }
  get done() { return this.phaseIdx >= this.config.phases.length; }

  keyToLabel(key: string): Label | null {
    const i = this.config.keys.indexOf(key.toUpperCase() as never);
    return i === 0 ? 0 : i === 1 ? 1 : null;
  }

  private makeBlock(): { protein: string; label: Label }[] {
    const prots = this.proteinsByGroup.get(this.phase!.group) ?? [];
    const g = this.phase!.group;
    const out: { protein: string; label: Label }[] = [];
    const labels = shuffle([0, 0, 0, 0, 1, 1, 1, 1] as Label[], this.rng);
    for (const label of labels) {
      const r = this.rot.get(g) ?? Math.floor(this.rng() * prots.length);
      this.rot.set(g, r + 1);
      out.push({ protein: prots[r % prots.length], label });
    }
    return out;
  }

  nextStimulus(): { v: Variant; block: number } | null {
    if (!this.phase) return null;
    for (let tries = 0; tries < 50; tries++) {
      if (!this.queue.length) { this.queue = this.makeBlock(); this.block++; }
      const want = this.queue.shift()!;
      const pool = this.pools.get(`${want.protein}|${want.label}`) ?? [];
      const i = pool.findIndex((v) => !(this.last && v.protein.id === this.last.protein.id && v.pos === this.last.pos));
      if (i < 0) continue;
      const [v] = pool.splice(i, 1);
      this.last = v;
      return { v, block: this.block };
    }
    return null;
  }

  pushBack(v: Variant) {
    this.pools.get(`${v.protein.id}|${v.label}`)!.unshift(v);
    this.queue.unshift({ protein: v.protein.id, label: v.label });
  }

  liveAccuracy(window: number): number | null {
    if (!this.phase || this.phase.feedback === 'none' || !this.inPhase) return null;
    const w = Math.min(window, this.inPhase);
    let c = 0;
    for (let i = this.trials.length - w; i < this.trials.length; i++) if (this.trials[i].correct) c++;
    return c / w;
  }

  record(r: ResponseInput): { trial: TrialRecord; next: PhaseSpec | null; finished: boolean } {
    const ph = this.phase!;
    const response = this.keyToLabel(r.pressedKey)!;
    const trial: TrialRecord = {
      trial: this.trials.length + 1, timestamp: r.wallOnset.toISOString(), elapsed_ms: Math.round(r.elapsedMs), phase: ph.name, feedback: ph.feedback,
      block: r.block, variant_id: r.v.id, protein: r.v.protein.id, group: r.v.protein.group, mutation: mutationName(r.v), label: r.v.label, response,
      pressed_key: r.pressedKey.toUpperCase(), correct: response === r.v.label, rt_ms: Math.round(r.rtMs), rolling_accuracy: null,
      onset_perf_ms: Math.round(r.onsetPerf * 100) / 100, response_perf_ms: Math.round(r.responsePerf * 100) / 100,
    };
    this.trials.push(trial);
    this.inPhase++;
    const w = Math.min(30, this.inPhase);
    trial.rolling_accuracy = this.trials.slice(-w).filter((t) => t.correct).length / w;
    this.meta.total_trials = this.trials.length;
    if (this.inPhase >= ph.trials) {
      this.phaseIdx++; this.inPhase = 0; this.queue = []; this.last = null;
      const next = this.phase;
      if (next) this.meta.phase_starts![next.name] = trial.trial + 1;
      return { trial, next, finished: !next };
    }
    return { trial, next: null, finished: false };
  }

  endReason(activeMs: number): string | null {
    if (this.done) return 'protocol_complete';
    if (activeMs >= this.config.maxDurationMin * 60_000) return 'max_duration';
    return null;
  }

  finish(reason: string, activeMs: number, pausedMs: number, endTime = new Date()): Session {
    Object.assign(this.meta, { end_time: endTime.toISOString(), end_reason: reason, active_duration_ms: Math.round(activeMs), paused_ms: Math.round(pausedMs) });
    return this.snapshot();
  }
  snapshot(): Session { return { meta: structuredClone(this.meta), trials: this.trials.map((t) => ({ ...t })) }; }
}
