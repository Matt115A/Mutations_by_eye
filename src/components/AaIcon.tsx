import { useEffect, useState } from 'react';

/**
 * Side-chain skeletal drawings (RDKit; shared with Protein sequence by eye), cropped to one shared scale:
 * every icon gets a viewBox of the same size centred on its own drawing, so glycine still looks tiny next to tryptophan.
 */
function cropIcons(raw: Record<string, string>): Record<string, string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(host);
  try {
    const boxes: Record<string, DOMRect> = {};
    for (const [a, svg] of Object.entries(raw)) {
      host.innerHTML = svg;
      const el = host.querySelector('svg');
      if (el) boxes[a] = el.getBBox();
    }
    const w = Math.max(...Object.values(boxes).map((b) => b.width)) + 6, h = Math.max(...Object.values(boxes).map((b) => b.height)) + 6;
    return Object.fromEntries(Object.entries(raw).map(([a, svg]) => {
      const b = boxes[a];
      if (!b) return [a, svg];
      const vb = `${(b.x + b.width / 2 - w / 2).toFixed(1)} ${(b.y + b.height / 2 - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
      return [a, svg.replace(/viewBox='[^']*'/, `viewBox='${vb}' preserveAspectRatio='xMidYMid meet'`)];
    }));
  } finally { host.remove(); }
}

let cropped: Promise<Record<string, string>> | null = null;
function useIcons() {
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let on = true;
    cropped ??= fetch(`${import.meta.env.BASE_URL}data/aa_icons.json`).then((r) => r.json()).then(cropIcons);
    cropped.then((x) => on && setIcons(x)).catch(() => on && setIcons({}));
    return () => { on = false; };
  }, []);
  return icons;
}

/** The amino acid's side chain (R group), hanging from its backbone Cα. */
export function AaIcon({ aa, className }: { aa: string; className?: string }) {
  const icons = useIcons();
  return <span className={`aa-icon ${className ?? ''}`} aria-label={`side chain of ${aa}`} dangerouslySetInnerHTML={{ __html: icons?.[aa] ?? '' }} />;
}
