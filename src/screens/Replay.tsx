import { useEffect, useState } from 'react';
import { ChemistryPanel, MsaPanel, MutationHeader, StructurePanel } from '../components/TrialPanels';
import type { Dataset, Session, Variant } from '../lib/types';

export function Replay({ session, data, byId }: { session: Session; data: Dataset; byId: Map<number, Variant> }) {
  const [idx, setIdx] = useState(0);
  const n = session.trials.length, t = session.trials[idx], v = t ? byId.get(t.variant_id) : undefined;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, i + 1)); else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1)); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [n]);
  if (!t || !v) return <div className="empty">No trials.</div>;
  return (
    <div>
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="scrub"><button className="btn btn-sm btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
          <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} />
          <button className="btn btn-sm btn-ghost" onClick={() => setIdx((i) => Math.min(n - 1, i + 1))}>›</button>
          <span className="muted">{t.trial} / {n} · ← →</span></div>
      </div>
      <MutationHeader v={v} />
      <div className="panels"><ChemistryPanel v={v} /><MsaPanel v={v} aa={data.aa} /><StructurePanel v={v} height={300} /></div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3 className="card-title">Measured: <span className={v.label === 0 ? 'bad' : 'good'}>{v.label === 0 ? 'deleterious' : 'neutral or better'}</span> <span className="muted" style={{ fontSize: 14 }}>(better than {Math.round(v.pct * 100)}% of mutations in this assay)</span></h3>
        <div className="model-grid">
          <span className={`badge ${t.correct ? 'badge-good' : 'badge-bad'}`}>You: {t.response === 0 ? 'deleterious' : 'fine'} {t.correct ? '✓' : '✗'}</span>
          {data.models.map((m) => { const ok = v.calls[m.name] === v.label; return <span key={m.name} className={`badge ${ok ? 'badge-good' : 'badge-bad'}`}>{m.label.replace(' (sees what you see)', '')}: {v.calls[m.name] === 0 ? 'del.' : 'fine'} {ok ? '✓' : '✗'}</span>; })}
        </div>
      </div>
    </div>
  );
}
