import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { cueWeights, modelAccuracy, modelProfile, phaseList, streamLearners } from '../src/lib/analysis';
import { parseDataset } from '../src/lib/dataset';
import { CSV_COLUMNS, trialsToCsv } from '../src/lib/export';
import { SessionCore } from '../src/lib/session';
import { simulateSession } from '../src/lib/simulate';
import { DEFAULT_CONFIG, type Session } from '../src/lib/types';

const data = parseDataset(JSON.parse(readFileSync('public/data/dataset.json', 'utf8')));
const byId = new Map(data.variants.map((v) => [v.id, v]));
const answer = (core: SessionCore, n: number, correct: (i: number) => boolean) => {
  for (let i = 0; i < n && !core.done; i++) {
    const s = core.nextStimulus()!;
    const label = correct(i) ? s.v.label : (1 - s.v.label) as 0 | 1;
    core.record({ v: s.v, block: s.block, pressedKey: core.config.keys[label], rtMs: 4000, onsetPerf: i * 8000, responsePerf: i * 8000 + 4000, wallOnset: new Date(), elapsedMs: i * 8000 });
  }
};

describe('dataset', () => {
  it('has the expected proteins, groups and balanced labels', () => {
    expect(data.proteins).toHaveLength(10);
    expect(data.proteins.filter((p) => p.group === 'learn')).toHaveLength(6);
    for (const p of data.proteins) {
      const vs = data.variants.filter((v) => v.protein.id === p.id);
      expect(vs.filter((v) => v.label === 0).length).toBe(vs.filter((v) => v.label === 1).length);
      vs.slice(0, 50).forEach((v) => { expect(p.seq[v.pos - 1]).toBe(v.wt); expect(p.positions[String(v.pos)]).toBeTruthy(); });
    }
    expect(Object.keys(data.variants[0].calls)).toContain('VenusREM');
  });
});

describe('session', () => {
  it('runs all three parts from the right protein groups with balanced blocks', () => {
    const core = new SessionCore(DEFAULT_CONFIG, data, { seed: 1 });
    answer(core, 10_000, (i) => i % 2 === 0);
    expect(core.endReason(0)).toBe('protocol_complete');
    const parts = phaseList({ meta: core.meta, trials: core.trials } as Session);
    expect(parts.map((p) => [p.name, p.trials.length])).toEqual([['learn', 144], ['new', 48], ['shallow', 48]]);
    parts.forEach((p) => expect(p.trials.every((t) => t.group === p.name)).toBe(true));
    for (let b = 0; b < 144 / 8; b++) expect(parts[0].trials.slice(b * 8, b * 8 + 8).filter((t) => t.label === 0)).toHaveLength(4);
    expect(new Set(parts[0].trials.map((t) => t.protein)).size).toBe(6);
    expect(new Set(core.trials.map((t) => t.variant_id)).size).toBe(core.trials.length);
    for (let i = 1; i < core.trials.length; i++) {
      const a = byId.get(core.trials[i - 1].variant_id)!, b = byId.get(core.trials[i].variant_id)!;
      expect(a.protein.id === b.protein.id && a.pos === b.pos).toBe(false);
    }
  });
  it('maps keys to labels and never repeats variants from earlier sessions', () => {
    const exclude = new Set(data.variants.filter((v) => v.id % 2 === 0).map((v) => v.id));
    const core = new SessionCore({ ...DEFAULT_CONFIG, keys: ['D', 'N'] }, data, { seed: 2, exclude });
    answer(core, 60, () => true);
    core.trials.forEach((t) => { expect(exclude.has(t.variant_id)).toBe(false); expect(t.response).toBe(t.pressed_key === 'D' ? 0 : 1); expect(t.correct).toBe(t.response === t.label); });
  });
});

describe('analysis', () => {
  const s = simulateSession(DEFAULT_CONFIG, data, 5);
  it('simulation completes; CSV has every trial', () => {
    expect(s.meta.end_reason).toBe('protocol_complete');
    const lines = trialsToCsv(s).trim().split('\n');
    expect(lines).toHaveLength(s.trials.length + 1);
    expect(lines[0].split(',')).toEqual(['session_id', ...CSV_COLUMNS]);
  });
  it('benchmarks and same-experience learners score every trial', () => {
    expect(modelAccuracy(s.trials, byId, 'VenusREM')!).toBeGreaterThan(0.55);
    streamLearners(s, data, byId).forEach((l) => expect(l.correct).toHaveLength(s.trials.length));
    const lr = streamLearners(s, data, byId)[0].correct;
    expect(lr.slice(-100).reduce((a, b) => a + b, 0) / 100).toBeGreaterThan(0.55);
  });
  it('cue weights: truth weights exposure positively (exposed mutations are more often fine)', () => {
    const cw = cueWeights(s, data, byId)!;
    expect(cw.truth[cw.names.indexOf('Exposed (RSA)')]).toBeGreaterThan(0);
  });
});

describe('model profile', () => {
  it('ranks models by κ and maps you among them', () => {
    const s = simulateSession(DEFAULT_CONFIG, data, 7);
    const prof = modelProfile(s, byId, data.models);
    expect(prof).toHaveLength(data.models.length);
    for (let i = 1; i < prof.length; i++) expect(prof[i - 1].kappa).toBeGreaterThanOrEqual(prof[i].kappa);
    for (const p of prof) { expect(p.kappa).toBeLessThanOrEqual(1); expect(p.agree).toBeGreaterThanOrEqual(0); }
    // a "player" who copies VenusREM exactly must have VenusREM as its twin with κ = 1
    const copy = { ...s, trials: s.trials.map((t) => { const r = byId.get(t.variant_id)!.calls.VenusREM; return { ...t, response: r, correct: r === t.label }; }) };
    const p2 = modelProfile(copy, byId, data.models);
    expect(p2[0].kappa).toBeCloseTo(1, 6);
    expect(p2.find((p) => p.name === 'VenusREM')!.kappa).toBeCloseTo(1, 6);
  });
});

describe('live leaderboard', () => {
  it('scores you and every model on the same answered mutations', async () => {
    const { boardRows } = await import('../src/components/LiveBoard');
    const core = new SessionCore(DEFAULT_CONFIG, data, { seed: 3 });
    const seen: typeof data.variants = [];
    for (let i = 0; i < 30; i++) {
      const s = core.nextStimulus()!;
      core.record({ v: s.v, block: s.block, pressedKey: 'TAP', label: (i % 3 ? s.v.label : 1 - s.v.label) as 0 | 1, rtMs: 3000, onsetPerf: i * 5000, responsePerf: i * 5000 + 3000, wallOnset: new Date(), elapsedMs: i * 5000 });
      seen.push(s.v);
    }
    expect(core.trials[0].pressed_key).toBe('TAP');
    const rows = boardRows(seen, core.trials.map((t) => t.correct), data.models, 20);
    expect(rows[0].all).toBeCloseTo(20 / 30, 6);
    expect(rows[0].recent).toBeCloseTo(core.trials.slice(10).filter((t) => t.correct).length / 20, 6);
    const venus = rows.find((r) => r.name === 'VenusREM')!;
    expect(venus.all).toBeCloseTo(seen.filter((v) => v.calls.VenusREM === v.label).length / 30, 6);
    expect(rows).toHaveLength(data.models.length + 1);
  });
});

describe('attempts', () => {
  it('archives, removes one, and clears all', async () => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const { addToHistory, loadArchived, removeFromHistory, clearAllAttempts, loadHistory } = await import('../src/lib/history');
    const a = simulateSession(DEFAULT_CONFIG, data, 1), b = simulateSession(DEFAULT_CONFIG, data, 2);
    for (const s of [a, b]) s.meta.simulated = false;
    b.meta.session_id += '-b';
    addToHistory(a); addToHistory(b);
    store.set('prot.rival', 'GEMME');
    expect(loadHistory()).toHaveLength(2);
    expect(loadArchived(a.meta.session_id)?.trials.length).toBe(a.trials.length);
    expect(removeFromHistory(a.meta.session_id)).toHaveLength(1);
    expect(loadArchived(a.meta.session_id)).toBeNull();
    expect(clearAllAttempts()).toEqual([]);
    expect(loadHistory()).toEqual([]);
    expect(loadArchived(b.meta.session_id)).toBeNull();
    expect(store.get('prot.rival')).toBe('GEMME');   // preferences survive
  });
});
