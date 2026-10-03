import type { Features, Variant } from './types';

/** Displayed information as a numeric vector (the same cues a person sees), for learners and cue analysis. */
export const FEATURE_NAMES: { key: string; label: string; get: (f: Features) => number }[] = [
  { key: 'cons', label: 'Column conservation', get: (f) => f.cons },
  { key: 'wtf', label: 'Wild type common in MSA', get: (f) => f.wtf },
  { key: 'mtf', label: 'Mutant seen in MSA', get: (f) => f.mtf },
  { key: 'gap', label: 'Gaps in column', get: (f) => f.gap },
  { key: 'blosum', label: 'BLOSUM62 score', get: (f) => f.blosum },
  { key: 'adhyd', label: '|Δ hydrophobicity|', get: (f) => Math.abs(f.dhyd) },
  { key: 'advol', label: '|Δ volume|', get: (f) => Math.abs(f.dvol) },
  { key: 'adchg', label: '|Δ charge|', get: (f) => Math.abs(f.dchg) },
  { key: 'rsa', label: 'Exposed (RSA)', get: (f) => f.rsa },
  { key: 'nbr', label: 'Neighbours (packing)', get: (f) => f.nbr },
  { key: 'plddt', label: 'AlphaFold confidence', get: (f) => f.plddt },
  { key: 'topro', label: 'Mutation to proline', get: (f) => f.topro },
  { key: 'fromgly', label: 'Mutation from glycine', get: (f) => f.fromgly },
  { key: 'lneff', label: 'MSA depth (log Neff)', get: (f) => f.lneff },
];

export function standardiser(all: Variant[]) {
  const X = all.map((v) => FEATURE_NAMES.map((n) => n.get(v.f)));
  const d = FEATURE_NAMES.length;
  const mean = Array(d).fill(0), sd = Array(d).fill(0);
  X.forEach((r) => r.forEach((x, j) => (mean[j] += x / X.length)));
  X.forEach((r) => r.forEach((x, j) => (sd[j] += (x - mean[j]) ** 2 / X.length)));
  sd.forEach((s, j) => (sd[j] = Math.sqrt(s) || 1));
  return (v: Variant) => FEATURE_NAMES.map((n, j) => (n.get(v.f) - mean[j]) / sd[j]);
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Online logistic regression (SGD) — used by the simulated player and the same-experience learners. */
export class OnlineLogReg {
  w: number[]; b = 0;
  constructor(d: number, private lr = 0.05, private l2 = 1e-3) { this.w = Array(d).fill(0); }
  p(x: number[]) { return sigmoid(this.b + x.reduce((a, xi, j) => a + xi * this.w[j], 0)); }
  update(x: number[], y: number) {
    const g = this.p(x) - y;
    this.w = this.w.map((wj, j) => wj - this.lr * (g * x[j] + this.l2 * wj));
    this.b -= this.lr * g;
  }
}

/** Batch logistic regression (L2) — for "what drives your choices" coefficients. */
export function fitLogReg(X: number[][], y: number[], iters = 600, lr = 0.3, l2 = 0.01): number[] {
  const d = X[0]?.length ?? 0;
  let w = Array(d).fill(0), b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = Array(d).fill(0); let gb = 0;
    X.forEach((x, i) => { const g = sigmoid(b + x.reduce((a, xi, j) => a + xi * w[j], 0)) - y[i]; x.forEach((xi, j) => (gw[j] += g * xi)); gb += g; });
    w = w.map((wj, j) => wj - lr * (gw[j] / X.length + l2 * wj));
    b -= lr * gb / X.length;
  }
  return w;
}
