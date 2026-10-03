import { FEATURE_NAMES, OnlineLogReg, fitLogReg, standardiser } from './features';
import type { Dataset, Session, TrialRecord, Variant } from './types';

export interface Pt { x: number; y: number }
export const acc = (ts: { correct: boolean }[]) => (ts.length ? ts.filter((t) => t.correct).length / ts.length : null);
export function median(xs: number[]): number | null { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Rolling mean over w trials (numbers), restarting at each part. */
export function rolling(trials: TrialRecord[], v: number[], w: number): Pt[] {
  const out: Pt[] = []; let buf: number[] = []; let phase = trials[0]?.phase;
  trials.forEach((t, i) => {
    if (t.phase !== phase) { buf = []; phase = t.phase; }
    buf.push(v[i]); if (buf.length > w) buf.shift();
    if (buf.length >= Math.min(8, w)) out.push({ x: t.trial, y: buf.reduce((a, b) => a + b, 0) / buf.length });
  });
  return out;
}

export function phaseList(s: Session) {
  const out: { name: string; label: string; start: number; trials: TrialRecord[] }[] = [];
  for (const t of s.trials) {
    let cur = out[out.length - 1];
    if (!cur || cur.name !== t.phase) { cur = { name: t.phase, label: s.meta.config.phases.find((p) => p.name === t.phase)?.label ?? t.phase, start: t.trial, trials: [] }; out.push(cur); }
    cur.trials.push(t);
  }
  return out;
}

export function phaseStats(s: Session) {
  return phaseList(s).map((p) => {
    const k = p.trials.filter((t) => t.correct).length, n = p.trials.length;
    const del = p.trials.filter((t) => t.label === 0), fit = p.trials.filter((t) => t.label === 1);
    return { ...p, n, acc: n ? k / n : null, ci: wilson(k, n), hitDel: acc(del), hitFit: acc(fit), saidDel: n ? p.trials.filter((t) => t.response === 0).length / n : null, rt: median(p.trials.map((t) => t.rt_ms)) };
  });
}

export function modelAccuracy(trials: TrialRecord[], byId: Map<number, Variant>, model: string): number | null {
  if (!trials.length) return null;
  return trials.filter((t) => byId.get(t.variant_id)!.calls[model] === t.label).length / trials.length;
}

export interface Subset { key: string; label: string; trials: TrialRecord[] }
export function subsets(s: Session): Subset[] {
  return [{ key: 'all', label: 'All trials', trials: s.trials }, ...phaseList(s).map((p) => ({ key: p.name, label: p.label, trials: p.trials }))];
}

/** Learners that see exactly your stream (predict each trial before its feedback; learn nothing from no-feedback trials). */
export function streamLearners(s: Session, data: Dataset, byId: Map<number, Variant>, priorIds: number[] = []) {
  const X = standardiser(data.variants);
  const stream = [...priorIds.map((id) => ({ v: byId.get(id), fb: true, prior: true })), ...s.trials.map((t) => ({ v: byId.get(t.variant_id), fb: t.feedback !== 'none', prior: false }))]
    .filter((e): e is { v: Variant; fb: boolean; prior: boolean } => !!e.v);
  const d = FEATURE_NAMES.length;
  const lr = new OnlineLogReg(d, 0.05);
  const nb = [0, 1].map(() => ({ n: 0, s: Array(d).fill(0), ss: Array(d).fill(0) }));
  const mem: { x: number[]; y: number }[] = [];
  const out = { lr: [] as number[], nb: [] as number[], knn: [] as number[] };
  for (const e of stream) {
    const x = X(e.v), y = e.v.label;
    if (!e.prior) {
      out.lr.push(+((lr.p(x) >= 0.5 ? 1 : 0) === y));
      const ll = nb.map((c) => (c.n < 3 ? -Infinity : x.reduce((a, xi, j) => { const m = c.s[j] / c.n, v = Math.max(0.05, c.ss[j] / c.n - m * m); return a - 0.5 * Math.log(v) - (xi - m) ** 2 / (2 * v); }, Math.log(c.n))));
      out.nb.push(Number.isFinite(ll[0]) && Number.isFinite(ll[1]) ? +((ll[1] > ll[0] ? 1 : 0) === y) : 0.5);
      if (mem.length >= 5) {
        const k = mem.map((m) => [m.x.reduce((a, xi, j) => a + (xi - x[j]) ** 2, 0), m.y]).sort((a, b) => a[0] - b[0]).slice(0, 15);
        out.knn.push(+((k.filter((q) => q[1] === 1).length * 2 > k.length ? 1 : 0) === y));
      } else out.knn.push(0.5);
    }
    if (!e.fb) continue;
    lr.update(x, y);
    nb[y].n++; x.forEach((xi, j) => { nb[y].s[j] += xi; nb[y].ss[j] += xi * xi; });
    mem.push({ x, y });
  }
  return [
    { key: 'lr', label: 'Logistic regression on the cues', correct: out.lr },
    { key: 'nb', label: 'Naive Bayes on the cues', correct: out.nb },
    { key: 'knn', label: '15-nearest-neighbour on the cues', correct: out.knn },
  ];
}

/** Which cues drive your answers vs the truth vs a SOTA model (standardised logistic coefficients). */
export function cueWeights(s: Session, data: Dataset, byId: Map<number, Variant>, model = 'VenusREM') {
  const X = standardiser(data.variants);
  const ts = s.trials.filter((t) => byId.has(t.variant_id));
  if (ts.length < 30) return null;
  const xs = ts.map((t) => X(byId.get(t.variant_id)!));
  return {
    names: FEATURE_NAMES.map((f) => f.label),
    you: fitLogReg(xs, ts.map((t) => t.response)),
    truth: fitLogReg(xs, ts.map((t) => t.label)),
    model: fitLogReg(xs, ts.map((t) => byId.get(t.variant_id)!.calls[model])),
  };
}

/** Accuracy split by a cue: you vs chosen models. */
export function byCue(s: Session, byId: Map<number, Variant>, models: string[]) {
  const splits: { label: string; groups: [string, (v: Variant) => boolean][] }[] = [
    { label: 'Burial', groups: [['buried (RSA < 20%)', (v) => v.f.rsa < 0.2], ['exposed', (v) => v.f.rsa >= 0.2]] },
    { label: 'Conservation', groups: [['conserved column', (v) => v.f.cons >= 0.5], ['variable column', (v) => v.f.cons < 0.5]] },
    { label: 'Chemistry', groups: [['unusual swap (BLOSUM < 0)', (v) => v.f.blosum < 0], ['common swap', (v) => v.f.blosum >= 0]] },
  ];
  return splits.map((sp) => ({
    label: sp.label,
    rows: sp.groups.map(([name, pred]) => {
      const ts = s.trials.filter((t) => pred(byId.get(t.variant_id)!));
      return { name, n: ts.length, you: acc(ts), models: Object.fromEntries(models.map((m) => [m, modelAccuracy(ts, byId, m)])) };
    }),
  }));
}
