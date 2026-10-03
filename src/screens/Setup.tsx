import { useMemo, useRef, useState } from 'react';
import { loadLocal } from '../lib/export';
import type { HistoryEntry } from '../lib/history';
import { type Config, type Dataset, PRESETS, type Session } from '../lib/types';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const GROUP_TEXT: Record<string, string> = { learn: 'learning', new: 'new proteins', shallow: 'few relatives' };

export function Setup({ data, initial, history, debug, onStart, onSimulate, onOpenSession }: {
  data: Dataset; initial: Config; history: HistoryEntry[]; debug: boolean; onStart: (c: Config) => void; onSimulate: (c: Config) => void; onOpenSession: (s: Session) => void;
}) {
  const [c, setC] = useState<Config>(initial);
  const [keysText, setKeysText] = useState(initial.keys.join(''));
  const fileRef = useRef<HTMLInputElement>(null);
  const last = useMemo(() => loadLocal(), []);
  const keys = keysText.toUpperCase().replace(/\s+/g, '').split('');
  const cfg: Config = { ...c, keys: [keys[0] ?? 'F', keys[1] ?? 'J'] };
  const valid = keys.length === 2 && keys[0] !== keys[1];
  const total = c.phases.reduce((a, p) => a + p.trials, 0);
  const loadFile = async (f: File) => { try { const s = JSON.parse(await f.text()) as Session; if (!s.meta || !Array.isArray(s.trials)) throw 0; onOpenSession(s); } catch { alert('Not a session JSON.'); } };
  return (
    <div className="screen">
      <div className="setup" style={{ width: 'min(960px, 100%)' }}>
        <h1 className="title">Mutation effects by eye</h1>
        <p className="subtitle">Real protein experiments (ProteinGym deep mutational scans) · learn to tell which mutations damage a protein.</p>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">What is this?</h3>
          <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Each trial is one amino-acid change in a real protein, measured in a lab experiment. You see three things at a glance: the <b>chemistry</b> of the swap,
            how often <b>evolution</b> tolerates it (the alignment of related proteins), and <b>where it sits in the 3D structure</b>. Decide whether it is
            <b> damaging</b> or <b>tolerated</b>, and learn from the feedback. The line between the two is drawn per experiment: for most proteins it is the
            median mutation (so half of all mutations count as damaging), for a few it is a threshold chosen by the scientists who ran it — see the table. At the end you're compared, on exactly the same mutations, with simple
            rules and with state-of-the-art AI models (ESM, EVE, SaProt, VenusREM…). Results stay in this browser. Press <kbd>Esc</kbd> to pause.
          </p>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">Proteins</h3><p className="card-sub">{data.variants.length.toLocaleString()} measured mutations across {data.proteins.length} proteins.</p></div></div>
          <table className="data">
            <thead><tr><th>Protein</th><th>Organism</th><th>Measured</th><th>Damaging/tolerated line</th><th>Used for</th><th className="num">Relatives in MSA</th></tr></thead>
            <tbody>{data.proteins.map((p) => <tr key={p.id}><td>{p.name}</td><td className="muted">{p.organism}</td><td className="muted">{p.selection}</td><td className="muted">{p.cutoff === 'median' ? 'median mutation' : `set by authors (${Math.round(p.frac_del * 100)}% damaging)`}</td><td>{GROUP_TEXT[p.group]}</td><td className="num">{p.nseq.toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">{PRESETS[c.protocol].title}</h3><p className="card-sub">{PRESETS[c.protocol].description}</p></div></div>
          <table className="data"><thead><tr><th>Part</th><th className="num">Trials</th><th>Feedback</th></tr></thead>
            <tbody>{c.phases.map((p, i) => <tr key={p.name}><td>{i + 1}. {p.label}</td><td className="num">{debug ? <input type="number" style={{ width: 70 }} value={p.trials} onChange={(e) => setC({ ...c, phases: c.phases.map((q, j) => (j === i ? { ...q, trials: Number(e.target.value) } : q)) })} /> : p.trials}</td><td className="muted">{p.feedback === 'reveal' ? 'right / wrong + measured effect' : p.feedback}</td></tr>)}</tbody></table>
          <p className="note" style={{ marginTop: 8 }}>{total} mutations · self-paced (roughly 30–50 min). {history.length ? `You've done ${history.reduce((a, e) => a + e.n_trials, 0)} before — those won't be repeated.` : ''}</p>
        </div>
        <div className="setup-grid">
          <div className="field"><label>Keys: damaging · tolerated</label><input type="text" value={keysText} maxLength={2} onChange={(e) => setKeysText(e.target.value.toUpperCase())} /></div>
        </div>
        {history.length > 0 && <p className="note">Previous sessions: {history.map((h) => `${new Date(h.start_time).toLocaleDateString()} (${h.n_trials} trials, ${pct(h.final.acc)})`).join(' · ')}</p>}
        {debug && <div className="debug-panel"><h4>DEBUG</h4><button className="btn btn-sm" onClick={() => onSimulate(cfg)}>Simulate full session</button></div>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onStart(cfg)} style={{ padding: '12px 26px', fontSize: 16 }}>Start</button>
          <div className="row">
            {last && <button className="btn btn-sm" onClick={() => onOpenSession(last)}>Open last session ({last.trials.length} trials)</button>}
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Open session file…</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </div>
        </div>
      </div>
    </div>
  );
}
