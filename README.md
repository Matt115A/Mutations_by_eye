# Mutation effects by eye

**Try it: https://matt115a.github.io/Mutations_by_eye/**

**Can a person learn to tell which mutations damage a protein — and how do they compare with state-of-the-art AI?**

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

The damaging/tolerated labels are ProteinGym's `DMS_score_bin`: the line is the median mutation for most assays and an
author-chosen threshold for a few, so "tolerated" means better than that line, not necessarily as good as wild type.

Rebuild the data: the scripts in `pipeline/` expect a project layout of `data/raw/` (ProteinGym files) next to `app/`
and write `app/public/data/`. See [DATA.md](DATA.md) for sources and licences.

Deploy: `npm run deploy` builds the public version and pushes it to the `gh-pages` branch.
