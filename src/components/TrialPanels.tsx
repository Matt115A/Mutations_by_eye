import { AA_INFO, CLASS_COLOR, type Variant } from '../lib/types';
import type { HelpKey } from '../lib/help';
import { AaIcon } from './AaIcon';
import { Help } from './Help';
import { StructureViewer } from './StructureViewer';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const SELECTION_TEXT: Record<string, string> = {
  OrganismalFitness: 'organism survival / growth', Activity: 'enzyme / protein activity', Stability: 'folding stability', Binding: 'binding', Expression: 'how much protein is made (abundance)',
};

export function MutationHeader({ v }: { v: Variant }) {
  const p = v.protein, w = AA_INFO[v.wt], m = AA_INFO[v.mt];
  return (
    <div className="mut-header" data-tour="mutation">
      <div>
        <div className="mut-protein">{p.name} <span className="muted">· {p.organism}</span></div>
        <div className="mut-assay"><Help k="measured">Measured:</Help> <b>{SELECTION_TEXT[p.selection] ?? p.selection}</b> <span className="muted">· {p.assay}</span></div>
      </div>
      <Help k="mutation" block className="mut-name">
        <span style={{ color: CLASS_COLOR[w.cls] }}>{v.wt}</span><span className="mut-pos">{v.pos}</span><span style={{ color: CLASS_COLOR[m.cls] }}>{v.mt}</span>
        <div className="mut-sub">{w.three} → {m.three}</div>
      </Help>
    </div>
  );
}

function PropRow({ label, help, lo, hi, wt, mt, fmt, note }: { label: string; help: HelpKey; lo: number; hi: number; wt: number; mt: number; fmt: (x: number) => string; note?: string }) {
  const X = (x: number) => `${((Math.min(hi, Math.max(lo, x)) - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="prop-row">
      <div className="prop-label"><Help k={help}>{label}<span className="muted">{note}</span></Help></div>
      <div className="prop-track">
        <div className="prop-axis" />
        <div className="prop-span" style={{ left: X(Math.min(wt, mt)), width: `calc(${X(Math.max(wt, mt))} - ${X(Math.min(wt, mt))})` }} />
        <div className="prop-dot wt" style={{ left: X(wt) }} title={`wild type ${fmt(wt)}`} />
        <div className="prop-dot mt" style={{ left: X(mt) }} title={`mutant ${fmt(mt)}`} />
      </div>
      <div className="prop-val">{fmt(wt)} → <b>{fmt(mt)}</b></div>
    </div>
  );
}

export function ChemistryPanel({ v }: { v: Variant }) {
  const w = AA_INFO[v.wt], m = AA_INFO[v.mt];
  const flags: string[] = [];
  if (v.mt === 'P') flags.push('→ Proline: rigid, breaks helices');
  if (v.wt === 'P') flags.push('Proline removed');
  if (v.wt === 'G') flags.push('Glycine removed: loses flexibility');
  if (v.mt === 'G') flags.push('→ Glycine: very flexible');
  if (v.wt === 'C' || v.mt === 'C') flags.push('Cysteine: possible disulfide');
  if (w.charge * m.charge < 0) flags.push('Charge reversed');
  const b = v.f.blosum;
  return (
    <section className="panel">
      <h4><Help k="chemistry">Chemistry</Help></h4>
      <Help k="tiles" block><div data-tour="tiles" className="aa-tiles">
        {[['wild type', v.wt, w], ['mutant', v.mt, m]].map(([lab, aa, info]) => {
          const i = info as typeof w;
          return (
            <div key={lab as string} className="aa-tile" style={{ borderColor: CLASS_COLOR[i.cls] }}>
              <div className="aa-tile-lab">{lab as string}</div>
              <div className="aa-tile-main"><div className="aa-tile-letter" style={{ color: CLASS_COLOR[i.cls] }}>{aa as string}</div><AaIcon aa={aa as string} /></div>
              <div className="aa-tile-name">{i.name}</div>
              <div className="aa-tile-cls" style={{ background: CLASS_COLOR[i.cls] }}>{i.cls}</div>
            </div>
          );
        })}
      </div></Help>
      <div data-tour="props">
      <PropRow label="Hydrophobicity" help="hydrophobicity" note=" (Kyte–Doolittle)" lo={-4.5} hi={4.5} wt={w.hyd} mt={m.hyd} fmt={(x) => x.toFixed(1)} />
      <PropRow label="Size" help="size" note=" (Å³)" lo={55} hi={235} wt={w.vol} mt={m.vol} fmt={(x) => x.toFixed(0)} />
      <PropRow label="Charge" help="charge" lo={-1} hi={1} wt={w.charge} mt={m.charge} fmt={(x) => (x > 0 ? '+' : x < 0 ? '−' : '0')} />
      </div>
      <div className="blosum" data-tour="blosum">
        <div><Help k="blosum"><span className="muted">BLOSUM62</span></Help> <b className={b < 0 ? 'bad' : 'good'}>{b > 0 ? '+' : ''}{b}</b></div>
        <div className="muted">{b >= 1 ? 'common swap in evolution' : b === 0 ? 'neutral swap' : b >= -2 ? 'uncommon swap' : 'rare swap in evolution'}</div>
      </div>
      {flags.length > 0 && <div className="flags"><Help k="flags"><span className="muted flags-lab">Note</span></Help>{flags.map((f) => <span key={f} className="flag">{f}</span>)}</div>}
    </section>
  );
}

const ROW_H = 15, CELL_W = 19, HALF = 8, SHOW_ROWS = 14;
export function MsaPanel({ v, aa }: { v: Variant; aa: string }) {
  const p = v.protein, info = p.positions[String(v.pos)];
  const freq = info.freq.map((f, i) => ({ a: aa[i], f: f / 1000 })).sort((x, y) => y.f - x.f);
  const max = Math.max(...freq.map((x) => x.f), 0.01);
  const lo = Math.max(1, v.pos - HALF), hi = Math.min(p.seq.length, v.pos + HALF);
  const cols = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  // a spread of relatives from most to least similar (evenly spaced through the 24 stored)
  const pick = p.msa_rows.length <= SHOW_ROWS ? p.msa_rows : Array.from({ length: SHOW_ROWS }, (_, i) => p.msa_rows[Math.round((i * (p.msa_rows.length - 1)) / (SHOW_ROWS - 1))]);
  const rows = [{ seq: p.seq, id: 1, query: true }, ...pick.map((r) => ({ ...r, query: false }))];
  const wtf = info.freq[aa.indexOf(v.wt)] / 1000, mtf = info.freq[aa.indexOf(v.mt)] / 1000;
  return (
    <section className="panel">
      <h4><Help k="msa">Evolution (MSA)</Help></h4>
      <div data-tour="msa-bars">
      <div className="msa-stats">
        <div><Help k="conservation"><span className="muted">Conservation</span></Help><b>{pct(info.cons)}</b></div>
        <div><Help k="wtFreq"><span className="muted">Wild type {v.wt}</span></Help><b style={{ color: '#3ccf7e' }}>{pct(wtf)}</b></div>
        <div><Help k="mtFreq"><span className="muted">Mutant {v.mt}</span></Help><b style={{ color: '#f08a5d' }}>{mtf < 0.005 && mtf > 0 ? '<1%' : pct(mtf)}</b></div>
        <div><Help k="gaps"><span className="muted">Gaps</span></Help><b>{pct(info.gap)}</b></div>
        <div><Help k="relatives"><span className="muted">Relatives</span></Help><b>{p.nseq.toLocaleString()}</b></div>
      </div>
      <Help k="columnBars" block><div className="col-dist">
        {freq.map(({ a, f }) => (
          <div key={a} className={`col-bar ${a === v.wt ? 'is-wt' : ''} ${a === v.mt ? 'is-mt' : ''}`} title={`${a}: ${(f * 100).toFixed(1)}%`}>
            <div className="col-fill" style={{ height: `${Math.max(1.5, (f / max) * 100)}%`, background: CLASS_COLOR[AA_INFO[a].cls] }} />
            <div className="col-lab">{a}</div>
          </div>
        ))}
      </div></Help>
      <div className="col-caption muted">Which amino acids relatives have at position {v.pos} (weighted)</div>
      </div>
      <Help k="alignment" block><div data-tour="alignment" className="mini-msa" style={{ width: cols.length * CELL_W + 4 }}>
        {rows.map((r, ri) => (
          <div key={ri} className={`msa-row ${r.query ? 'query' : ''}`} style={{ height: ROW_H }}>
            {cols.map((c) => {
              const ch = r.seq[c - 1] ?? '-';
              const cls = AA_INFO[ch]?.cls;
              return (
                <span key={c} className={`msa-cell ${c === v.pos ? 'centre' : ''}`} style={{ width: CELL_W, background: cls ? `${CLASS_COLOR[cls]}${r.query ? '66' : '38'}` : 'transparent', color: cls ? '#eee' : '#555' }}>
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div></Help>
      <div className="col-caption muted">Top row: this protein (positions {lo}–{hi}). Below: {rows.length - 1} relatives, most to least similar.</div>
    </section>
  );
}

export function StructurePanel({ v, onReady, height }: { v: Variant; onReady?: () => void; height?: number }) {
  const info = v.protein.positions[String(v.pos)];
  const exposure = info.rsa < 0.2 ? 'buried' : info.rsa < 0.5 ? 'partly buried' : 'exposed';
  return (
    <section className="panel">
      <h4><Help k="structure">Structure (AlphaFold)</Help></h4>
      <div data-tour="structure"><StructureViewer structureKey={v.protein.key} pos={v.pos} label={`${v.wt}${v.pos}`} onReady={onReady} height={height} /></div>
      <div className="msa-stats" style={{ marginTop: 8 }} data-tour="structure-stats">
        <div><Help k="exposure"><span className="muted">Surface exposure</span></Help><b>{pct(info.rsa)}</b><span className="muted"> {exposure}</span></div>
        <div><Help k="neighbours"><span className="muted">Packed neighbours</span></Help><b>{info.nbr}</b></div>
        <div><Help k="plddt"><span className="muted">AlphaFold confidence</span></Help><b>{Math.round(info.plddt)}</b></div>
      </div>
      <Help k="position" block><div className="seq-track">
        <div className="seq-marker" style={{ left: `${((v.pos - 0.5) / v.protein.seq.length) * 100}%` }} />
        <span className="muted">1</span><span className="muted" style={{ marginLeft: 'auto' }}>{v.protein.seq.length}</span>
      </div></Help>
    </section>
  );
}
