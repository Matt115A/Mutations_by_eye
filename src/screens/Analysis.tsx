import { useMemo, useRef } from 'react';
import { Bars, C, Card, Legend, LineChart } from '../components/charts';
import { ModelProfile } from '../components/ModelProfile';
import { acc, byCue, cueWeights, modelAccuracy, phaseStats, rolling, streamLearners, subsets } from '../lib/analysis';
import type { Dataset, Session, Variant } from '../lib/types';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const KIND_COLOR: Record<string, string> = { simple: '#9cc3e6', classic: '#199e70', msa: '#c98500', plm: '#3987e5', structure: '#e87ba4' };
const KIND_LABEL: Record<string, string> = { simple: 'simple', classic: 'classic MSA', msa: 'deep MSA', plm: 'language model', structure: 'structure-aware' };
const W = 30;

export function Analysis({ session, data, byId, priorIds }: { session: Session; data: Dataset; byId: Map<number, Variant>; priorIds: number[] }) {
  const r = useMemo(() => ({
    phases: phaseStats(session),
    subs: subsets(session),
    stream: streamLearners(session, data, byId, priorIds),
    cues: cueWeights(session, data, byId),
    split: byCue(session, byId, ['feature_model', 'ESM1v_ensemble', 'VenusREM']),
  }), [session, data, byId, priorIds]);
  const refs = { curve: useRef<SVGSVGElement>(null), bench: useRef<SVGSVGElement>(null), cues: useRef<SVGSVGElement>(null) };
  const n = session.trials.length;
  const markers = r.phases.slice(1).map((p) => ({ x: p.start - 0.5, label: p.label.split(' (')[0] }));
  const you = rolling(session.trials, session.trials.map((t) => +t.correct), W);
  const models = data.models;
  return (
    <div>
      <div className="kpis">
        {r.phases.map((p) => <div key={p.name} className="kpi"><div className="kpi-label">{p.label}</div><div className="kpi-value">{pct(p.acc)}</div><div className="kpi-sub">n={p.n} · chance 50%</div></div>)}
        <div className="kpi"><div className="kpi-label">VenusREM on the same mutations</div><div className="kpi-value">{pct(modelAccuracy(session.trials, byId, 'VenusREM'))}</div><div className="kpi-sub">state of the art</div></div>
      </div>

      <h2 className="section-title">Your model profile</h2>
      <ModelProfile session={session} data={data} byId={byId} />

      <h2 className="section-title">Performance</h2>
      <Card title="By part" sub="Accuracy (95% interval). Trials are balanced, half deleterious and half fine, so 50% is chance. 'Caught deleterious' = share of truly deleterious mutations you called deleterious.">
        <table className="data">
          <thead><tr><th>Part</th><th className="num">n</th><th className="num">Accuracy</th><th className="num">95% CI</th><th className="num">Caught deleterious</th><th className="num">Caught fine</th><th className="num">You said deleterious</th><th className="num">Median time</th></tr></thead>
          <tbody>{r.phases.map((p) => <tr key={p.name}><td><b>{p.label}</b></td><td className="num">{p.n}</td><td className="num"><b>{pct(p.acc)}</b></td><td className="num muted">{pct(p.ci[0])}–{pct(p.ci[1])}</td><td className="num">{pct(p.hitDel)}</td><td className="num">{pct(p.hitFit)}</td><td className="num">{pct(p.saidDel)}</td><td className="num">{p.rt ? `${(p.rt / 1000).toFixed(1)} s` : '—'}</td></tr>)}</tbody>
        </table>
      </Card>

      <Card title="Learning curve: you vs learners that saw the same mutations" svgRef={refs.curve} exportName="same_experience"
        sub={`Rolling accuracy over ${W} trials. The learners see the same cues you see (as numbers), in your order, with your feedback${priorIds.length ? `, after first learning from your ${priorIds.length} earlier trials` : ''}.`}>
        <Legend items={[{ name: 'You', color: C.yellow }, ...r.stream.map((s, i) => ({ name: s.label, color: ['#9cc3e6', '#199e70', '#3987e5'][i] }))]} />
        <LineChart svgRef={refs.curve} height={320} xDomain={[1, Math.max(2, n)]} yDomain={[0, 1]} yTicks={[0, 0.25, 0.5, 0.75, 1]} yFormat={pct} xLabel="Trial" yLabel="Accuracy" markers={markers}
          series={[...r.stream.map((s, i) => ({ name: s.label, color: ['#9cc3e6', '#199e70', '#3987e5'][i], points: rolling(session.trials, s.correct, W), width: 1.8 })), { name: 'You', color: C.yellow, points: you, width: 3.2 }]}
          refLines={[{ y: 0.5, label: 'chance' }]} />
      </Card>

      <Card title="Benchmark on identical mutations" svgRef={refs.bench} exportName="benchmark"
        sub="Every model's call on exactly the mutations you saw. Model scores are turned into calls per protein at the protein's true share of deleterious mutations.">
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Who</th>{r.subs.map((s) => <th key={s.key} className="num">{s.label} <span className="muted">({s.trials.length})</span></th>)}</tr></thead>
            <tbody>
              <tr><td><b style={{ color: C.yellow }}>You</b></td>{r.subs.map((s) => <td key={s.key} className="num"><b>{pct(acc(s.trials))}</b></td>)}</tr>
              {models.map((m) => <tr key={m.name}><td><span style={{ color: KIND_COLOR[m.kind] }}>●</span> {m.label} <span className="tag">{KIND_LABEL[m.kind]}</span></td>{r.subs.map((s) => <td key={s.key} className="num">{pct(modelAccuracy(s.trials, byId, m.name))}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <Bars svgRef={refs.bench} label={`All ${n} mutations`} domain={[0, 1]} format={pct} height={250}
          bars={[{ label: 'You', value: acc(session.trials), color: C.yellow }, ...models.filter((m) => m.kind !== 'simple' || m.name === 'feature_model').map((m) => ({ label: m.label.replace(' (sees what you see)', '').replace(/ \(MSA\)/, ''), value: modelAccuracy(session.trials, byId, m.name), color: KIND_COLOR[m.kind] }))]} />
      </Card>

      <div className="grid2">
        <Card title="What drives your answers?" svgRef={refs.cues} exportName="cue_weights"
          sub="How strongly each cue pushes towards 'neutral or better' (standardised weights). Compare what you relied on with what actually predicted the outcome, and with VenusREM.">
          {!r.cues ? <div className="empty">Needs at least 30 trials.</div> : (
            <table className="data">
              <thead><tr><th>Cue</th><th className="num">You</th><th className="num">Truth</th><th className="num">VenusREM</th></tr></thead>
              <tbody>{r.cues.names.map((nm, i) => {
                const cell = (x: number) => <td className="num" style={{ color: x > 0.15 ? '#3ccf7e' : x < -0.15 ? '#ef5350' : 'var(--muted)' }}>{x > 0 ? '+' : ''}{x.toFixed(2)}</td>;
                return <tr key={nm}><td>{nm}</td>{cell(r.cues!.you[i])}{cell(r.cues!.truth[i])}{cell(r.cues!.model[i])}</tr>;
              })}</tbody>
            </table>
          )}
        </Card>
        <Card title="Where you do well" sub="Accuracy split by cue: you vs the feature model (sees what you see), ESM-1v and VenusREM.">
          {r.split.map((sp) => (
            <table key={sp.label} className="data" style={{ marginBottom: 14 }}>
              <thead><tr><th>{sp.label}</th><th className="num">n</th><th className="num">You</th><th className="num">Feature model</th><th className="num">ESM-1v</th><th className="num">VenusREM</th></tr></thead>
              <tbody>{sp.rows.map((row) => <tr key={row.name}><td>{row.name}</td><td className="num muted">{row.n}</td><td className="num"><b>{pct(row.you)}</b></td><td className="num">{pct(row.models.feature_model)}</td><td className="num">{pct(row.models.ESM1v_ensemble)}</td><td className="num">{pct(row.models.VenusREM)}</td></tr>)}</tbody>
            </table>
          ))}
        </Card>
      </div>
    </div>
  );
}
