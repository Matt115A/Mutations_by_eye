# Mutation effects by eye

**Can a person learn to tell which mutations break a protein — and how do they compare with state-of-the-art AI?**

Each trial is one measured amino-acid substitution from ProteinGym. At a glance you see the chemistry of the swap,
what evolution tolerates at that position (alignment column + relatives), and an interactive AlphaFold structure centred on
the residue. Press **F** (damaging) or **J** (tolerated), and learn from the measured result.

**Session 1:** learn on 6 proteins (144 mutations) → 2 proteins you've never seen (48) → 2 proteins with very few known relatives (48),
where alignment-based cues and protein language models get much weaker.

Benchmarks on exactly the same mutations: BLOSUM62, MSA conservation, a feature model that sees what you see, and
Site-independent, EVmutation, GEMME, EVE, TranceptEVE, ESM-1v, ESM2, SaProt, ProSST, S3F and VenusREM — plus learners that
see the same cues, in your order, with your feedback. Everything runs in the browser; nothing is uploaded.

```bash
npm install && npm run dev        # http://localhost:5173  (?debug adds a simulate button)
npm test
VITE_PUBLIC=true npm run build    # static site in dist/
```

Rebuild the data: `python pipeline/build_dataset.py` (from the parent folder; needs the ProteinGym files in `data/raw/`). See [DATA.md](DATA.md).
