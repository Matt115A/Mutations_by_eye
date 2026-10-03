import { useCallback, useEffect, useRef, useState } from 'react';
import { ChemistryPanel, MsaPanel, MutationHeader, StructurePanel } from '../components/TrialPanels';
import { saveLocal } from '../lib/export';
import type { SessionCore } from '../lib/session';
import type { Label, PhaseSpec, Session, TrialRecord, Variant } from '../lib/types';

type State = 'intro' | 'trial' | 'feedback' | 'paused';
const fmtClock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Experiment({ core, aa, onEnd }: { core: SessionCore; aa: string; onEnd: (s: Session) => void }) {
  const [state, setState] = useState<State>(core.phase?.intro ? 'intro' : 'trial');
  const [stim, setStim] = useState<{ v: Variant; block: number } | null>(() => core.nextStimulus());
  const [last, setLast] = useState<TrialRecord | null>(null);
  const [phase, setPhase] = useState<PhaseSpec | null>(core.phase);
  const [clock, setClock] = useState(0);
  const onset = useRef<{ perf: number; wall: Date; elapsed: number } | null>(null);
  const active = useRef({ accum: 0, since: performance.now(), pausedAccum: 0, pauseSince: 0 });
  const prevState = useRef<State>('trial');
  const ended = useRef(false);

  const activeMs = () => active.current.accum + (state === 'paused' ? 0 : performance.now() - active.current.since);

  const end = useCallback((reason: string) => {
    if (ended.current) return;
    ended.current = true;
    const a = active.current;
    const s = core.finish(reason, a.accum + (state === 'paused' ? 0 : performance.now() - a.since), a.pausedAccum + (state === 'paused' ? performance.now() - a.pauseSince : 0));
    saveLocal(s); onEnd(s);
  }, [core, onEnd, state]);

  // stimulus onset = first frame after the trial panels have rendered
  useEffect(() => {
    if (state !== 'trial' || !stim) return;
    onset.current = null;
    const id = requestAnimationFrame(() => (onset.current = { perf: performance.now(), wall: new Date(), elapsed: activeMs() }));
    return () => cancelAnimationFrame(id);
  }, [state, stim]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const id = setInterval(() => setClock(activeMs()), 1000); return () => clearInterval(id); }); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    const reason = core.endReason(activeMs());
    if (reason) return end(reason);
    const s = core.nextStimulus();
    if (!s) return end('pool_exhausted');
    setStim(s);
    const ph = core.phase;
    if (ph && ph !== phase) { setPhase(ph); setState(ph.intro ? 'intro' : 'trial'); }
    else setState('trial');
  }, [core, phase, end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state === 'paused') { active.current.pausedAccum += performance.now() - active.current.pauseSince; active.current.since = performance.now(); setState(prevState.current); }
        else { active.current.accum += performance.now() - active.current.since; active.current.pauseSince = performance.now(); prevState.current = state === 'intro' ? 'intro' : state; setState('paused'); }
        return;
      }
      if (state === 'intro' && e.code === 'Space') { e.preventDefault(); setState('trial'); return; }
      if (state === 'feedback' && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); advance(); return; }
      if (state !== 'trial' || !stim || e.repeat || e.metaKey || e.ctrlKey) return;
      const label = core.keyToLabel(e.key);
      if (label === null || !onset.current) return;
      e.preventDefault();
      const now = performance.now(), on = onset.current;
      const resp = e.timeStamp > on.perf && e.timeStamp <= now + 1 ? e.timeStamp : now;
      const { trial, next, finished } = core.record({ v: stim.v, block: stim.block, pressedKey: e.key, rtMs: resp - on.perf, onsetPerf: on.perf, responsePerf: resp, wallOnset: on.wall, elapsedMs: on.elapsed });
      setLast(trial);
      if (next || trial.trial % 5 === 0) saveLocal(core.snapshot());
      if (finished) { setState('feedback'); if (phase?.feedback === 'none') end('protocol_complete'); return; }
      if (phase?.feedback === 'none') advance();
      else setState('feedback');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state, stim, core, phase, advance, end]);

  const acc = core.liveAccuracy(core.config.hudWindow);
  const keys = core.config.keys;
  const v = stim?.v;
  return (
    <div className="exp-p">
      <div className="hud-p">
        <span><span className="muted">Part</span> <b>{phase?.label ?? '—'}</b></span>
        <span><span className="muted">Trial</span> <b>{core.trials.length + (state === 'feedback' ? 0 : 1)}</b></span>
        <span><span className="muted">Time</span> <b>{fmtClock(clock)}</b></span>
        <span><span className="muted">Accuracy · last {core.config.hudWindow}</span> <b>{acc == null ? '—' : `${Math.round(acc * 100)}%`}</b></span>
        <span className="muted" style={{ marginLeft: 'auto' }}>Esc to pause</span>
      </div>
      {v && (
        <>
          <MutationHeader v={v} />
          <div className="panels">
            <ChemistryPanel v={v} />
            <MsaPanel v={v} aa={aa} />
            <StructurePanel v={v} />
          </div>
          <div className="answer-bar">
            {state === 'feedback' && last ? <Feedback t={last} v={v} /> : (
              <div className="answer-keys">
                <div className="answer-key del"><kbd>{keys[0]}</kbd> Deleterious <span className="muted">breaks it</span></div>
                <div className="answer-q muted">Does this mutation break the protein?</div>
                <div className="answer-key fit"><kbd>{keys[1]}</kbd> Neutral or better <span className="muted">fine</span></div>
              </div>
            )}
          </div>
        </>
      )}
      {state === 'intro' && phase && (
        <div className="overlay"><div className="intro">{phase.intro.split('\n').map((l, i) => (i ? <p key={i}>{l}</p> : <h2 key={i}>{l}</h2>))}<p className="hint pulse">Press <kbd>Space</kbd> to begin</p></div></div>
      )}
      {state === 'paused' && (
        <div className="overlay"><div className="intro"><h2>Paused</h2><p>The timer is stopped.</p>
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))}>Resume (Esc)</button><button className="btn" onClick={() => end('ended_by_user')}>End session &amp; analyse</button></div></div></div>
      )}
    </div>
  );
}

function Feedback({ t, v }: { t: TrialRecord; v: Variant }) {
  const said: Label = t.response;
  const cutoff = v.protein.frac_del;
  return (
    <div className={`feedback ${t.correct ? 'ok' : 'no'}`}>
      <div className="fb-verdict">{t.correct ? '✓ Correct' : '✗ Wrong'} <span className="muted">— you said {said === 0 ? 'deleterious' : 'neutral or better'}</span></div>
      <div className="fb-measured">
        Measured: <b className={v.label === 0 ? 'bad' : 'good'}>{v.label === 0 ? 'deleterious' : 'neutral or better'}</b>
        <span className="muted"> · better than {Math.round(v.pct * 100)}% of mutations in this assay</span>
      </div>
      <div className="fb-track" title="all mutations in this assay, worst → best">
        <div className="fb-del" style={{ width: `${cutoff * 100}%` }} />
        <div className="fb-cut" style={{ left: `${cutoff * 100}%` }}><span>cutoff</span></div>
        <div className="fb-mark" style={{ left: `${v.pct * 100}%` }} />
      </div>
      <div className="fb-next muted">Press <kbd>Space</kbd> for the next mutation · rotate the structure to see why</div>
    </div>
  );
}
