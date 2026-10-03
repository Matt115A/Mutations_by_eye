import type { Dataset, Features, Label, ModelInfo, Protein, Variant } from './types';

interface RawDataset {
  version: string; source: string; aa: string; models: ModelInfo[]; model_order: string[]; proteins: Protein[];
  variants: { id: number; p: string; pos: number; wt: string; mt: string; y: Label; pct: number; f: Features; c: string }[];
}

export async function loadDataset(base = `${import.meta.env.BASE_URL}data/`): Promise<Dataset> {
  const raw = (await fetch(base + 'dataset.json').then((r) => r.json())) as RawDataset;
  return parseDataset(raw);
}

export function parseDataset(raw: RawDataset): Dataset {
  const byId = new Map(raw.proteins.map((p) => [p.id, p]));
  const variants: Variant[] = raw.variants.map((v) => ({
    id: v.id, protein: byId.get(v.p)!, pos: v.pos, wt: v.wt, mt: v.mt, label: v.y, pct: v.pct, f: v.f,
    calls: Object.fromEntries(raw.model_order.map((m, i) => [m, Number(v.c[i]) as Label])),
  }));
  return { version: raw.version, source: raw.source, aa: raw.aa, models: raw.models, proteins: raw.proteins, variants };
}

const pdbCache = new Map<string, Promise<string>>();
export function loadStructure(key: string, base = `${import.meta.env.BASE_URL}data/structures/`): Promise<string> {
  if (!pdbCache.has(key)) pdbCache.set(key, fetch(`${base}${key}.pdb`).then((r) => r.text()));
  return pdbCache.get(key)!;
}

export const mutationName = (v: Pick<Variant, 'wt' | 'pos' | 'mt'>) => `${v.wt}${v.pos}${v.mt}`;
