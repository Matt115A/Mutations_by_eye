import { useState } from 'react';
import { loadLocal } from '../lib/export';
import { LevelToggle, useLevel } from '../lib/level';
import { clearAllAttempts, type HistoryEntry, loadArchived, removeFromHistory } from '../lib/history';
import { type Config, type Dataset, type Session } from '../lib/types';

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);

export function Setup({ data, initial, history, debug, onStart, onSimulate, onOpenSession, onHistoryChange }: {
  data: Dataset; initial: Config; history: HistoryEntry[]; debug: boolean; onStart: (c: Config) => void; onSimulate: (c: Config) => void; onOpenSession: (s: Session) => void; onHistoryChange: (h: HistoryEntry[]) => void;
}) {
  const [c] = useState<Config>(initial);
  const [level, setLevel] = useLevel();
  const [keysText, setKeysText] = useState(initial.keys.join(''));
  const [last, setLast] = useState(() => loadLocal());
  const keys = keysText.toUpperCase().replace(/\s+/g, '').split('');
  const cfg: Config = { ...c, keys: [keys[0] ?? 'F', keys[1] ?? 'J'] };
  const valid = keys.length === 2 && keys[0] !== keys[1];
  return (
    <div className="screen">
      <div className="setup" style={{ width: 'min(960px, 100%)' }}>
        <div className="setup-top"><a className="bioai-link" href="https://matt115a.github.io/BioAI_by_eye/">PART OF BIOAI BY EYE →</a><LevelToggle level={level} onChange={setLevel} /></div>
        <h1 className="title">Mutation effects by eye</h1>
        <p className="subtitle">{level === 'learner' ? 'Learn to tell which mutations break a protein, while racing the AI.'
          : 'ProteinGym deep mutational scans; are single substitutions in proteins damaging or tolerated? Scored against zero-shot predictors and simple baselines.'}</p>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onStart(cfg)} style={{ padding: '12px 34px', fontSize: 16, margin: '2px 0 22px' }}>Start</button>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="card-title">What is this?</h3>
          {level === 'learner' ? (
            <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Each question is one amino-acid change in a real protein, measured in the lab. You get three kinds of clue: the <b>chemistry</b> of the swap,
              how often <b>evolution</b> allows it (by comparing related proteins), and <b>where it sits in the protein's 3D shape</b>. Decide whether it is
              <b> damaging</b> or <b>tolerated</b>, and learn from the feedback. AI can predict this without running an experiment, but even the best AI can make mistakes!
              At the end you're compared, on exactly the same mutations, with simple rules and with state-of-the-art AI models. A live leaderboard lets you race
              a model as you go. Works with a keyboard or by tapping on a phone. You can reload the game in the same browser to pick up where you left off if you save your progress each time you stop.
            </p>
          ) : (
            <p className="card-sub" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Single substitutions were pulled from 10 ProteinGym v1.3 deep mutational scanning (DMS) assays. Your job is to guess whether the mutation is
              deleterious, or neutral/beneficial. I put neutral/beneficial as a single bin because often these assays are 'topped out' of their dynamic range at
              approximately wild-type. Each question shows plenty of computed information on the substitution, for your gaming pleasure. Labels are ProteinGym's
              DMS_score_bin: the median for most assays, author-defined for a few (see the table). Your answers are compared on identical variants with simple rules
              (BLOSUM62, MSA conservation, mutant frequency in the MSA), a gradient-boosted model trained on the computed information you have seen up to each
              point, and zero-shot scores from Site-independent, EVmutation, GEMME, EVE, TranceptEVE L, ESM-1v, ESM2 650M, SaProt, ProSST, S3F-MSA and VenusREM.
            </p>
          )}
        </div>
        <Attempts history={history} last={last} total={data.variants.length} onOpen={onOpenSession}
          onChange={(h) => { onHistoryChange(h); setLast(loadLocal()); }} />
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><div><h3 className="card-title">Proteins tested</h3><p className="card-sub">{data.variants.length.toLocaleString()} measured mutations across {data.proteins.length} proteins.</p></div></div>
          <div className="table-scroll"><table className="data">
            <thead><tr><th>Protein</th><th>Organism</th><th>Measured</th><th>Damaging/tolerated line</th><th className="num">Relatives in MSA</th></tr></thead>
            <tbody>{data.proteins.map((p) => <tr key={p.id}><td>{p.name}</td><td className="muted">{p.organism}</td><td className="muted">{p.selection}</td><td className="muted">{p.cutoff === 'median' ? 'median mutation' : `set by authors (${Math.round(p.frac_del * 100)}% damaging)`}</td><td className="num">{p.nseq.toLocaleString()}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="setup-grid keys-field" style={{ gridTemplateColumns: 'minmax(220px, 280px)', justifyContent: 'center' }}>
          <div className="field"><label>Keys: damaging · tolerated</label><input type="text" value={keysText} maxLength={2} onChange={(e) => setKeysText(e.target.value.toUpperCase())} /></div>
        </div>
        {debug && <div className="debug-panel"><h4>DEBUG</h4><button className="btn btn-sm" onClick={() => onSimulate(cfg)}>Simulate full session</button></div>}
        <p className="save-note" style={{ margin: '14px auto 0' }}>
          <b>You don't have to finish in one sitting.</b> Pause at any point (<kbd>Esc</kbd>, or the Pause button on a phone) and choose <b>Stop &amp; save</b>, or just close the tab;
          your answers are saved in this browser every few mutations. When you come back they're listed under <b>Your attempts</b>, and your next run carries on with mutations you haven't seen yet.
        </p>
        {last && !history.some((h) => h.session_id === last.meta.session_id) && <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn btn-sm" onClick={() => onOpenSession(last)}>Open last session ({last.trials.length} trials)</button></div>}
        <button className="btn btn-primary" disabled={!valid} onClick={() => onStart(cfg)} style={{ display: 'block', width: '100%', padding: '14px 26px', fontSize: 17, marginTop: 22 }}>Start</button>
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
  if (!history.length) return cleared ? <p className="note attempts-cleared">✓ Cleared. Every mutation is available again. Press Start for a fresh run.</p> : null;
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
