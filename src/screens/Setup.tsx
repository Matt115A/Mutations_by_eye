import { useRef, useState } from 'react';
import { loadLocal } from '../lib/export';
import { clearAllAttempts, type HistoryEntry, loadArchived, removeFromHistory } from '../lib/history';
import { type Config, type Dataset, PRESETS, type Session } from '../lib/types';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const GROUP_TEXT: Record<string, string> = { learn: 'learning', new: 'new proteins', shallow: 'few relatives' };

export function Setup({ data, initial, history, debug, onStart, onSimulate, onOpenSession, onHistoryChange }: {
  data: Dataset; initial: Config; history: HistoryEntry[]; debug: boolean; onStart: (c: Config) => void; onSimulate: (c: Config) => void; onOpenSession: (s: Session) => void; onHistoryChange: (h: HistoryEntry[]) => void;
}) {
  const [c, setC] = useState<Config>(initial);
  const [keysText, setKeysText] = useState(initial.keys.join(''));
  const fileRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState(() => loadLocal());
  const keys = keysText.toUpperCase().replace(/\s+/g, '').split('');
  const cfg: Config = { ...c, keys: [keys[0] ?? 'F', keys[1] ?? 'J'] };
  const valid = keys.length === 2 && keys[0] !== keys[1];
  const total = c.phases.reduce((a, p) => a + p.trials, 0);
  const loadFile = async (f: File) => { try { const s = JSON.parse(await f.text()) as Session; if (!s.meta || !Array.isArray(s.trials)) throw 0; onOpenSession(s); } catch { alert('Not a session JSON.'); } };
  return (
    <div className="screen">
      <div className="setup" style={{ width: 'min(960px, 100%)' }}>
        <a className="bioai-link" href="https://matt115a.github.io/BioAI_by_eye/">PART OF BIOAI BY EYE →</a>
        <h1 className="title">Mutation effects by eye</h1>
        <p className="subtitle">Real protein experiments (ProteinGym deep mutational scans) · learn to tell which mutations damage a protein.</p>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">What is this?</h3>
          <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Each trial is one amino-acid change in a real protein, measured in a lab experiment. You see three things at a glance: the <b>chemistry</b> of the swap,
            how often <b>evolution</b> tolerates it (the alignment of related proteins), and <b>where it sits in the 3D structure</b>. Decide whether it is
            <b> damaging</b> or <b>tolerated</b>, and learn from the feedback. The line between the two is drawn per experiment: for most proteins it is the
            median mutation (so half of all mutations count as damaging), for a few it is a threshold chosen by the scientists who ran it — see the table. At the end you're compared, on exactly the same mutations, with simple
            rules and with state-of-the-art AI models (ESM, EVE, SaProt, VenusREM…). A live leaderboard lets you race a model of your choice as you go. Works with a keyboard or by tapping on a phone. Results stay in this browser.
          </p>
        </div>
        <Attempts history={history} last={last} total={data.variants.length} onOpen={onOpenSession}
          onChange={(h) => { onHistoryChange(h); setLast(loadLocal()); }} />
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">Proteins</h3><p className="card-sub">{data.variants.length.toLocaleString()} measured mutations across {data.proteins.length} proteins.</p></div></div>
          <div className="table-scroll"><table className="data">
            <thead><tr><th>Protein</th><th>Organism</th><th>Measured</th><th>Damaging/tolerated line</th><th>Used for</th><th className="num">Relatives in MSA</th></tr></thead>
            <tbody>{data.proteins.map((p) => <tr key={p.id}><td>{p.name}</td><td className="muted">{p.organism}</td><td className="muted">{p.selection}</td><td className="muted">{p.cutoff === 'median' ? 'median mutation' : `set by authors (${Math.round(p.frac_del * 100)}% damaging)`}</td><td>{GROUP_TEXT[p.group]}</td><td className="num">{p.nseq.toLocaleString()}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">{PRESETS[c.protocol].title}</h3><p className="card-sub">{PRESETS[c.protocol].description}</p></div></div>
          <table className="data"><thead><tr><th>Part</th><th className="num">Trials</th><th>Feedback</th></tr></thead>
            <tbody>{c.phases.map((p, i) => <tr key={p.name}><td>{i + 1}. {p.label}</td><td className="num">{debug ? <input type="number" style={{ width: 70 }} value={p.trials} onChange={(e) => setC({ ...c, phases: c.phases.map((q, j) => (j === i ? { ...q, trials: Number(e.target.value) } : q)) })} /> : p.trials}</td><td className="muted">{p.feedback === 'reveal' ? 'right / wrong + measured effect' : p.feedback}</td></tr>)}</tbody></table>
          <p className="note" style={{ marginTop: 8 }}>{total} mutations · self-paced (roughly 30–50 min). {history.length ? `You've done ${history.reduce((a, e) => a + e.n_trials, 0)} before — those won't be repeated.` : ''}</p>
        </div>
        <div className="setup-grid keys-field">
          <div className="field"><label>Keys: damaging · tolerated</label><input type="text" value={keysText} maxLength={2} onChange={(e) => setKeysText(e.target.value.toUpperCase())} /></div>
        </div>
        {debug && <div className="debug-panel"><h4>DEBUG</h4><button className="btn btn-sm" onClick={() => onSimulate(cfg)}>Simulate full session</button></div>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onStart(cfg)} style={{ padding: '12px 26px', fontSize: 16 }}>Start</button>
          <div className="row">
            {last && !history.some((h) => h.session_id === last.meta.session_id) && <button className="btn btn-sm" onClick={() => onOpenSession(last)}>Open last session ({last.trials.length} trials)</button>}
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Open session file…</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </div>
        </div>
        <p className="note" style={{ marginTop: 22 }}>
          Data: <a href="https://proteingym.org" target="_blank" rel="noreferrer">ProteinGym</a> (Notin et al.) deep mutational scans, alignments and model scores;
          structures from the <a href="https://alphafold.ebi.ac.uk" target="_blank" rel="noreferrer">AlphaFold DB</a> (CC BY 4.0).
          Source, credits and method: <a href="https://github.com/Matt115A/Mutations_by_eye" target="_blank" rel="noreferrer">github.com/Matt115A/Mutations_by_eye</a>.
        </p>
      </div>
    </div>
  );
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Past attempts on this device: re-open, remove one, or clear everything and start fresh. Confirmations are inline (no browser dialogs). */
function Attempts({ history, last, total, onOpen, onChange }: { history: HistoryEntry[]; last: Session | null; total: number; onOpen: (s: Session) => void; onChange: (h: HistoryEntry[]) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);   // session id, or 'all'
  const [cleared, setCleared] = useState(false);
  const seen = new Set(history.flatMap((h) => h.window_ids)).size;
  if (!history.length) return cleared ? <p className="note attempts-cleared">✓ Cleared. Every mutation is available again — press Start for a fresh run.</p> : null;
  const sessionFor = (id: string) => loadArchived(id) ?? (last?.meta.session_id === id ? last : null);
  return (
    <div className="card attempts" style={{ marginBottom: 18 }}>
      <div className="card-head"><div>
        <h3 className="card-title">Your attempts</h3>
        <p className="card-sub">{history.length} on this device · {seen.toLocaleString()} of {total.toLocaleString()} mutations seen. New runs skip mutations you've already seen; clear your attempts to start from scratch.</p>
      </div></div>
      <div className="table-scroll"><table className="data">
        <thead><tr><th>#</th><th>When</th><th className="num">Mutations</th><th className="num">Accuracy</th><th /></tr></thead>
        <tbody>{history.slice().reverse().map((h, i) => {
          const s = sessionFor(h.session_id);
          return (
            <tr key={h.session_id}>
              <td className="muted">{history.length - i}</td><td>{fmtWhen(h.start_time)}</td><td className="num">{h.n_trials}</td><td className="num"><b>{pct(h.final.acc)}</b></td>
              <td className="attempt-actions">{confirm === h.session_id ? (
                <><span className="muted">Remove this attempt?</span><button className="btn btn-sm" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-sm btn-danger" onClick={() => { setConfirm(null); onChange(removeFromHistory(h.session_id)); }}>Remove</button></>
              ) : (
                <>{s && <button className="btn btn-sm" onClick={() => onOpen(s)}>Open</button>}<button className="btn btn-sm btn-ghost" onClick={() => setConfirm(h.session_id)}>Remove</button></>
              )}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="attempts-foot">
        {confirm === 'all' ? (
          <div className="confirm-all">
            <span>Delete {history.length === 1 ? 'your attempt' : `all ${history.length} attempts`} from this browser? Download any session you want to keep first (Open → Session JSON). This can't be undone.</span>
            <div className="row"><button className="btn btn-sm" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-sm btn-danger" onClick={() => { setConfirm(null); setCleared(true); onChange(clearAllAttempts()); }}>Clear all</button></div>
          </div>
        ) : <button className="btn btn-sm btn-ghost" onClick={() => setConfirm('all')}>Clear all &amp; start fresh</button>}
      </div>
    </div>
  );
}
