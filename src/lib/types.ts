/**
 * ProteinGym's DMS_score_bin: 1 = tolerated ("fit"), 0 = damaging. The line is set per experiment — the median
 * mutation for most assays, or a threshold chosen by the original authors — so it is not "as good as wild type".
 */
export type Label = 0 | 1;
export type Group = 'learn' | 'new' | 'shallow';
export type FeedbackMode = 'none' | 'correctness' | 'reveal';

export interface PhaseSpec {
  name: string;
  label: string;
  trials: number;
  group: Group;
  /** reveal = right/wrong + the measured effect (percentile within the assay). */
  feedback: FeedbackMode;
  intro: string;
}

export interface Config {
  protocol: string;
  /** Keys for [damaging, tolerated]. */
  keys: [string, string];
  phases: PhaseSpec[];
  maxDurationMin: number;
  hudWindow: number;
  excludeSeen: boolean;
}

export const PRESETS: Record<string, { title: string; description: string; phases: PhaseSpec[] }> = {
  session1: {
    title: 'Session 1 — learn, then new proteins',
    description: 'Learn on six proteins with feedback, then predict mutations in two proteins you have never seen, then in two proteins with very few known relatives.',
    phases: [
      { name: 'learn', label: 'Learning (6 proteins)', trials: 144, group: 'learn', feedback: 'reveal',
        intro: 'Part 1 of 3 — learning.\nEach trial is one mutation in a real protein. Decide: is it damaging (worse than most mutations in this experiment), or tolerated?\nAfter each answer you\'ll see what the experiment measured. Press Space to move on.' },
      { name: 'new', label: 'New proteins', trials: 48, group: 'new', feedback: 'reveal',
        intro: 'Part 2 of 3 — two proteins you haven\'t seen.\nSame task. Use what you learned.' },
      { name: 'shallow', label: 'Proteins with few relatives', trials: 48, group: 'shallow', feedback: 'reveal',
        intro: 'Part 3 of 3 — two more proteins.\nSame task.' },
    ],
  },
};

export const DEFAULT_CONFIG: Config = {
  protocol: 'session1',
  keys: ['F', 'J'],
  phases: PRESETS.session1.phases,
  maxDurationMin: 60,
  hudWindow: 20,
  excludeSeen: true,
};

export interface PositionInfo {
  /** Weighted amino-acid frequencies in the alignment column (‰, order = Dataset.aa). */
  freq: number[];
  gap: number;
  /** 1 − normalised entropy of the column (0 = anything goes, 1 = invariant). */
  cons: number;
  /** Relative solvent accessibility (0 buried … 1 exposed). */
  rsa: number;
  plddt: number;
  /** Residues with Cβ within 10 Å. */
  nbr: number;
}

export interface Protein {
  id: string;
  group: Group;
  key: string;
  name: string;
  organism: string;
  uniprot: string;
  seq: string;
  selection: string;
  assay: string;
  phenotype: string;
  year: number;
  author: string;
  msa_depth: string;
  neff: number;
  nseq: number;
  frac_del: number;
  /** How ProteinGym drew the damaging/tolerated line: 'median' of the assay, or 'manual' (set by the authors). */
  cutoff: 'median' | 'manual';
  msa_rows: { seq: string; id: number }[];
  positions: Record<string, PositionInfo>;
}

export interface Features {
  cons: number; gap: number; wtf: number; mtf: number; blosum: number; dhyd: number; dvol: number; dchg: number;
  rsa: number; plddt: number; nbr: number; lneff: number; topro: number; fromgly: number; cys: number;
}

export interface Variant {
  id: number;
  protein: Protein;
  pos: number;
  wt: string;
  mt: string;
  label: Label;
  /** Percentile of the measured score within the assay (0 = worst). */
  pct: number;
  f: Features;
  /** Each benchmark's call (1 = fit, 0 = deleterious), keyed by model name. */
  calls: Record<string, Label>;
}

export interface ModelInfo { name: string; label: string; kind: 'simple' | 'classic' | 'msa' | 'plm' | 'structure' }

export interface Dataset { version: string; source: string; aa: string; models: ModelInfo[]; proteins: Protein[]; variants: Variant[] }

export interface TrialRecord {
  trial: number;
  timestamp: string;
  elapsed_ms: number;
  phase: string;
  feedback: FeedbackMode;
  block: number;
  variant_id: number;
  protein: string;
  group: Group;
  mutation: string;
  label: Label;
  response: Label;
  pressed_key: string;
  correct: boolean;
  rt_ms: number;
  rolling_accuracy: number | null;
  onset_perf_ms: number;
  response_perf_ms: number;
}

export interface PriorExperience { sessions: number; trials: number; session_ids: string[]; excluded_windows: number }

export interface SessionMeta {
  app: string;
  app_version: string;
  session_id: string;
  seed: number;
  simulated: boolean;
  config: Config;
  dataset_version: string;
  phase_starts?: Record<string, number>;
  prior?: PriorExperience;
  start_time: string;
  end_time: string | null;
  end_reason: string | null;
  total_trials: number;
  active_duration_ms: number;
  paused_ms: number;
  environment: { user_agent: string; estimated_frame_ms: number | null; screen: string };
  timing_notes: string;
}

export interface Session { meta: SessionMeta; trials: TrialRecord[] }

/** Amino-acid reference shown in the chemistry panel. */
export const AA_INFO: Record<string, { name: string; three: string; hyd: number; vol: number; charge: number; cls: 'hydrophobic' | 'aromatic' | 'polar' | 'positive' | 'negative' | 'special' }> = {
  A: { name: 'Alanine', three: 'Ala', hyd: 1.8, vol: 88.6, charge: 0, cls: 'hydrophobic' },
  R: { name: 'Arginine', three: 'Arg', hyd: -4.5, vol: 173.4, charge: 1, cls: 'positive' },
  N: { name: 'Asparagine', three: 'Asn', hyd: -3.5, vol: 114.1, charge: 0, cls: 'polar' },
  D: { name: 'Aspartate', three: 'Asp', hyd: -3.5, vol: 111.1, charge: -1, cls: 'negative' },
  C: { name: 'Cysteine', three: 'Cys', hyd: 2.5, vol: 108.5, charge: 0, cls: 'special' },
  Q: { name: 'Glutamine', three: 'Gln', hyd: -3.5, vol: 143.8, charge: 0, cls: 'polar' },
  E: { name: 'Glutamate', three: 'Glu', hyd: -3.5, vol: 138.4, charge: -1, cls: 'negative' },
  G: { name: 'Glycine', three: 'Gly', hyd: -0.4, vol: 60.1, charge: 0, cls: 'special' },
  H: { name: 'Histidine', three: 'His', hyd: -3.2, vol: 153.2, charge: 0, cls: 'positive' },
  I: { name: 'Isoleucine', three: 'Ile', hyd: 4.5, vol: 166.7, charge: 0, cls: 'hydrophobic' },
  L: { name: 'Leucine', three: 'Leu', hyd: 3.8, vol: 166.7, charge: 0, cls: 'hydrophobic' },
  K: { name: 'Lysine', three: 'Lys', hyd: -3.9, vol: 168.6, charge: 1, cls: 'positive' },
  M: { name: 'Methionine', three: 'Met', hyd: 1.9, vol: 162.9, charge: 0, cls: 'hydrophobic' },
  F: { name: 'Phenylalanine', three: 'Phe', hyd: 2.8, vol: 189.9, charge: 0, cls: 'aromatic' },
  P: { name: 'Proline', three: 'Pro', hyd: -1.6, vol: 112.7, charge: 0, cls: 'special' },
  S: { name: 'Serine', three: 'Ser', hyd: -0.8, vol: 89.0, charge: 0, cls: 'polar' },
  T: { name: 'Threonine', three: 'Thr', hyd: -0.7, vol: 116.1, charge: 0, cls: 'polar' },
  W: { name: 'Tryptophan', three: 'Trp', hyd: -0.9, vol: 227.8, charge: 0, cls: 'aromatic' },
  Y: { name: 'Tyrosine', three: 'Tyr', hyd: -1.3, vol: 193.6, charge: 0, cls: 'aromatic' },
  V: { name: 'Valine', three: 'Val', hyd: 4.2, vol: 140.0, charge: 0, cls: 'hydrophobic' },
};

export const CLASS_COLOR: Record<string, string> = {
  hydrophobic: '#c98500', aromatic: '#e87ba4', polar: '#199e70', positive: '#3987e5', negative: '#ef5350', special: '#9a9a90',
};
