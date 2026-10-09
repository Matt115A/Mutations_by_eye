import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveBoard } from '../components/LiveBoard';
import { ChemistryPanel, MsaPanel, MutationHeader, StructurePanel } from '../components/TrialPanels';
import { saveLocal } from '../lib/export';
import type { SessionCore } from '../lib/session';
import type { Label, ModelInfo, PhaseSpec, Session, TrialRecord, Variant } from '../lib/types';

type State = 'intro' | 'trial' | 'feedback' | 'paused';
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const isNarrow = () => typeof innerWidth !== 'undefined' && innerWidth <= 760;
/** Buttons must never keep focus: Space would then re-click them on the next trial. */
const noFocus = { tabIndex: -1, onMouseDown: (e: React.MouseEvent) => e.preventDefault() };
const fmtClock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Experiment({ core, aa, models, onEnd }: { core: SessionCore; aa: string; models: ModelInfo[]; onEnd: (s: Session) => void }) {
  const [state, setState] = useState<State>(core.phase?.intro ? 'intro' : 'trial');
  const [stim, setStim] = useState<{ v: Variant; block: number } | null>(() => core.nextStimulus());
  const [last, setLast] = useState<TrialRecord | null>(null);
  const [phase, setPhase] = useState<PhaseSpec | null>(core.phase);
  const [clock, setClock] = useState(0);
  const onset = useRef<{ perf: number; wall: Date; elapsed: number } | null>(null);
  const active = useRef({ accum: 0, since: performance.now(), pausedAccum: 0, pauseSince: 0 });
  const prevState = useRef<State>('trial');
  const ended = useRef(false);
  const seen = useRef<Variant[]>([]);   // variants answered so far, parallel to core.trials (for the live leaderboard)
  const [touch] = useState(isTouch);
  const [narrow, setNarrow] = useState(isNarrow);
  useEffect(() => { const h = () => setNarrow(isNarrow()); addEventListener('resize', h); return () => removeEventListener('resize', h); }, []);

  const stateRef = useRef(state); stateRef.current = state;
  const activeMs = () => active.current.accum + (stateRef.current === 'paused' ? 0 : performance.now() - active.current.since);

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

  useEffect(() => { const id = setInterval(() => setClock(activeMs()), 500); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    const reason = core.endReason(activeMs());
    if (reason) return end(reason);
    const s = core.nextStimulus();
    if (!s) return end('pool_exhausted');
    setStim(s);
    if (narrow) scrollTo({ top: 0 });
    const ph = core.phase;
    if (ph && ph !== phase) { setPhase(ph); setState(ph.intro ? 'intro' : 'trial'); }
    else setState('trial');
  }, [core, phase, end, narrow]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePause = useCallback(() => {
    if (state === 'paused') { active.current.pausedAccum += performance.now() - active.current.pauseSince; active.current.since = performance.now(); setState(prevState.current); }
    else { active.current.accum += performance.now() - active.current.since; active.current.pauseSince = performance.now(); prevState.current = state; setState('paused'); }
  }, [state]);

  /** One answer, from a key press or a tap/click. `stamp` is the event's timeStamp (same clock as performance.now()). */
  const respond = useCallback((label: Label, pressedKey: string, stamp: number) => {
    if (state !== 'trial' || !stim || !onset.current) return;
    const now = performance.now(), on = onset.current;
    const resp = stamp > on.perf && stamp <= now + 1 ? stamp : now;
    const { trial, next, finished } = core.record({ v: stim.v, block: stim.block, pressedKey, label, rtMs: resp - on.perf, onsetPerf: on.perf, responsePerf: resp, wallOnset: on.wall, elapsedMs: on.elapsed });
    seen.current.push(stim.v);
    setLast(trial);
    if (next || trial.trial % 5 === 0) saveLocal(core.snapshot());
    if (finished) { setState('feedback'); if (phase?.feedback === 'none') end('protocol_complete'); return; }
    if (phase?.feedback === 'none') advance();
    else setState('feedback');
  }, [state, stim, core, phase, advance, end]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
      if (state === 'intro' && e.code === 'Space') { e.preventDefault(); setState('trial'); return; }
      if (state === 'feedback' && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); advance(); return; }
      if (state !== 'trial' || !stim || e.repeat || e.metaKey || e.ctrlKey) return;
      const label = core.keyToLabel(e.key);
      if (label === null || !onset.current) return;
      e.preventDefault();
      respond(label, e.key, e.timeStamp);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state, stim, core, advance, togglePause, respond]);

  const keys = core.config.keys;
  const v = stim?.v;
  return (
    <div className="exp-p">
      <div className="hud-p">
        <span><span className="muted">Part</span> <b>{phase?.label ?? '—'}</b></span>
        <span><span className="muted">Trial</span> <b>{core.trials.length + (state === 'feedback' ? 0 : 1)}</b></span>
        <span><span className="muted">Time</span> <b>{fmtClock(clock)}</b></span>
        {touch ? <button className="btn btn-sm hud-pause" {...noFocus} onClick={togglePause}>Pause</button> : <span className="muted hud-esc">Esc to pause or stop · progress is saved</span>}
        <LiveBoard seen={seen.current} correct={core.trials.map((t) => t.correct)} models={models} window={20} />
      </div>
      {v && (
        <>
          <MutationHeader v={v} />
          <div className="panels">
            <ChemistryPanel v={v} />
            <MsaPanel v={v} aa={aa} />
            <StructurePanel v={v} height={narrow ? 300 : undefined} />
          </div>
          <div className="answer-bar">
            {state === 'feedback' && last ? <Feedback t={last} v={v} touch={touch} onNext={advance} /> : (
              <div className="answer-keys">
                <button className="answer-key del" {...noFocus} onClick={(e) => respond(0, 'TAP', e.timeStamp)}>{!touch && <kbd>{keys[0]}</kbd>} Damaging</button>
                <div className="answer-q muted">Damaging or tolerated?</div>
                <button className="answer-key fit" {...noFocus} onClick={(e) => respond(1, 'TAP', e.timeStamp)}>{!touch && <kbd>{keys[1]}</kbd>} Tolerated</button>
              </div>
            )}
          </div>
        </>
      )}
      {state === 'intro' && phase && (
        <div className="overlay"><div className="intro">{phase.intro.split('\n').map((l, i) => (i ? <p key={i}>{l}</p> : <h2 key={i}>{l}</h2>))}<p className="hint">{touch ? null : <span className="pulse">Press <kbd>Space</kbd> or </span>}<button className="btn btn-primary" {...noFocus} onClick={() => setState('trial')}>Begin</button></p></div></div>
      )}
      {state === 'paused' && (
        <div className="overlay"><div className="intro"><h2>Paused</h2><p>The timer is stopped.</p>
          <p className="save-note"><b>Need to go?</b> Stop &amp; save keeps your {core.trials.length} answer{core.trials.length === 1 ? '' : 's'} in this browser and shows your results so far. They stay under <b>Your attempts</b>, and next time you start a new run with mutations you haven't seen.</p>
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" {...noFocus} onClick={togglePause}>Resume{touch ? '' : ' (Esc)'}</button><button className="btn" onClick={() => end('ended_by_user')}>Stop &amp; save · see results</button></div></div></div>
      )}
    </div>
  );
}

function Feedback({ t, v, touch, onNext }: { t: TrialRecord; v: Variant; touch: boolean; onNext: () => void }) {
  const said: Label = t.response;
  const cutoff = v.protein.frac_del;
  return (
    <div className={`feedback ${t.correct ? 'ok' : 'no'}`}>
      <div className="fb-verdict">{t.correct ? '✓ Correct' : '✗ Wrong'} <span className="muted">— you said {said === 0 ? 'damaging' : 'tolerated'}</span></div>
      <div className="fb-measured">
        Measured: <b className={v.label === 0 ? 'bad' : 'good'}>{v.label === 0 ? 'damaging' : 'tolerated'}</b>
        <span className="muted"> · better than {Math.round(v.pct * 100)}% of mutations in this experiment · line = {v.protein.cutoff === 'median' ? 'the median mutation' : 'threshold set by the authors'}</span>
      </div>
      <div className="fb-track" title="all mutations in this assay, worst → best">
        <div className="fb-del" style={{ width: `${cutoff * 100}%` }} />
        <div className="fb-cut" style={{ left: `${cutoff * 100}%` }}><span>{v.protein.cutoff === 'median' ? 'median' : 'cutoff'}</span></div>
        <div className="fb-mark" style={{ left: `${v.pct * 100}%` }} />
      </div>
      <div className="fb-foot">
        <span className="fb-next muted">{touch ? 'Rotate the structure to see why' : <>Press <kbd>Space</kbd> for the next mutation · rotate the structure to see why</>}</span>
        <button className="btn btn-primary fb-btn" {...noFocus} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
