import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import { loadStructure } from '../lib/dataset';

/**
 * AlphaFold2 structure, centred on the wild-type residue (yellow sticks) with its neighbours within 6 Å
 * (thin grey sticks). Fully interactive: drag to rotate, scroll to zoom, right-drag to move.
 */
export function StructureViewer({ structureKey, pos, label, height = 360, onReady }: { structureKey: string; pos: number; label: string; height?: number; onReady?: () => void }) {
  const div = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof $3Dmol.createViewer> | null>(null);
  const loaded = useRef<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const home = useRef<unknown>(null);   // the starting camera for this residue, for Reset view
  const ready = useRef(onReady); ready.current = onReady;

  useEffect(() => {
    if (!div.current || viewer.current) return;
    // WebGL can be unavailable (disabled, blocklisted GPU, too many contexts). Never let that take the app down.
    try {
      const probe = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
      if (!probe) throw new Error('WebGL unavailable');
      viewer.current = $3Dmol.createViewer(div.current, { backgroundColor: '#141413', antialias: true } as never);
      if (!viewer.current) throw new Error('could not create the 3D viewer');
    } catch (e) {
      viewer.current = null;
      setErr(`3D view unavailable in this browser (${e instanceof Error ? e.message : e}). Everything else works; the burial and packing numbers below still describe the structure.`);
      setLoading(false);
    }
    return () => { try { viewer.current?.clear(); } catch { /* ignore */ } viewer.current = null; loaded.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = viewer.current;
        if (!v) { ready.current?.(); return; }
        if (loaded.current !== structureKey) {
          v.removeAllModels(); v.removeAllLabels(); v.render(); setLoading(true);   // never leave the previous protein on screen
          const pdb = await loadStructure(structureKey);
          if (cancelled) return;
          v.removeAllModels();
          v.addModel(pdb, 'pdb');
          loaded.current = structureKey;
        }
        v.resize();   // the container may have changed size since the viewer was created — re-measure so the residue is centred
        v.removeAllLabels();
        v.setStyle({}, { cartoon: { color: '#77776f', opacity: 0.9 } });
        v.addStyle({ byres: true, within: { distance: 6, sel: { resi: pos } } } as never, { stick: { colorscheme: 'whiteCarbon', radius: 0.16 } });
        v.setStyle({ resi: pos }, { cartoon: { color: '#f2c230' }, stick: { colorscheme: 'yellowCarbon', radius: 0.35 }, sphere: { colorscheme: 'yellowCarbon', scale: 0.3 } });
        v.addLabel(label, { fontSize: 13, fontColor: '#111', backgroundColor: '#f2c230', backgroundOpacity: 0.9, borderThickness: 0, inFront: true, alignment: 'bottomCenter' } as never, { resi: pos, atom: 'CA' });
        v.zoomTo({ byres: true, within: { distance: 12, sel: { resi: pos } } } as never);   // frame the residue and its ~12 Å surroundings
        home.current = v.getView();
        v.render();
        setLoading(false);
        ready.current?.();
      } catch (e) { if (!cancelled) { setErr(`Couldn't load this structure (${e instanceof Error ? e.message : e}). Check your connection; the burial and packing numbers below still describe it.`); setLoading(false); ready.current?.(); } }
    })();
    return () => { cancelled = true; };
  }, [structureKey, pos, label]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="structure-wrap">
      <div ref={div} style={{ width: '100%', height, position: 'relative' }} />
      {loading && !err && <div className="structure-loading"><span className="spinner" />Loading the 3D structure…</div>}
      {err && <div className="structure-error">{err}</div>}
      {!loading && !err && <button className="btn btn-sm structure-reset" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} title="Back to the starting view" aria-label="Reset view"
        onClick={() => { const v = viewer.current; if (v && home.current) { v.setView(home.current as never); v.render(); } }}>↺ Reset view</button>}
      <div className="structure-hint">drag to rotate · scroll to zoom</div>
    </div>
  );
}
