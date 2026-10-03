"""Build the game dataset from ProteinGym v1.3: variants, at-a-glance features, structures, benchmarks.

Outputs app/public/data/dataset.json (+ structures/*.pdb).
Labels: ProteinGym's DMS_score_bin (1 = fit: neutral or better than wild type, 0 = deleterious),
binarised by ProteinGym with an assay-specific cutoff. Single mutants only.
"""
import io
import json
import math
import os
import zipfile

import numpy as np
import pandas as pd
from Bio.Align import substitution_matrices
from Bio.PDB import PDBParser
from Bio.PDB.SASA import ShrakeRupley
from sklearn.ensemble import HistGradientBoostingClassifier

RNG = np.random.default_rng(1)
OUT = 'app/public/data'
AA = 'ACDEFGHIKLMNPQRSTVWY'
GROUPS = {
    'learn': ['BLAT_ECOLX_Stiffler_2015', 'RASH_HUMAN_Bandaru_2017', 'CALM1_HUMAN_Weile_2017', 'MK01_HUMAN_Brenan_2016', 'AMIE_PSEAE_Wrenbeck_2017', 'ESTA_BACSU_Nutschel_2020'],
    'new': ['KKA2_KLEPN_Melnikov_2014', 'NUD15_HUMAN_Suiter_2020'],
    'shallow': ['A0A247D711_LISMN_Stadelmann_2021', 'Q6WV12_9MAXI_Somermeyer_2022'],
}
MAX_PER_PROTEIN = 1200          # balanced pool per protein (half deleterious, half fit)
MSA_SUBSAMPLE = 6000            # sequences used for weighted column statistics
DISPLAY_ROWS = 24               # homologs shown in the mini alignment
MODELS = [  # (column, label, kind)
    ('Site_Independent', 'Site-independent (MSA)', 'classic'), ('EVmutation', 'EVmutation', 'classic'),
    ('GEMME', 'GEMME', 'msa'), ('EVE_ensemble', 'EVE', 'msa'), ('TranceptEVE_L', 'TranceptEVE L', 'msa'),
    ('ESM1v_ensemble', 'ESM-1v', 'plm'), ('ESM2_650M', 'ESM2 650M', 'plm'),
    ('SaProt_650M_AF2', 'SaProt 650M', 'structure'), ('ProSST-2048', 'ProSST', 'structure'), ('S3F_MSA', 'S3F-MSA', 'structure'), ('VenusREM', 'VenusREM', 'structure'),
]
# amino-acid chemistry (Kyte–Doolittle hydropathy, side-chain volume Å³ (Zamyatnin), charge at pH 7)
HYDRO = dict(A=1.8, R=-4.5, N=-3.5, D=-3.5, C=2.5, Q=-3.5, E=-3.5, G=-0.4, H=-3.2, I=4.5, L=3.8, K=-3.9, M=1.9, F=2.8, P=-1.6, S=-0.8, T=-0.7, W=-0.9, Y=-1.3, V=4.2)
VOLUME = dict(A=88.6, R=173.4, N=114.1, D=111.1, C=108.5, Q=143.8, E=138.4, G=60.1, H=153.2, I=166.7, L=166.7, K=168.6, M=162.9, F=189.9, P=112.7, S=89.0, T=116.1, W=227.8, Y=193.6, V=140.0)
CHARGE = dict(D=-1, E=-1, K=1, R=1, H=0.1)
MAX_ASA = dict(A=129, R=274, N=195, D=193, C=167, Q=225, E=223, G=104, H=224, I=197, L=201, K=236, M=224, F=240, P=159, S=155, T=172, W=285, Y=263, V=174)  # Tien et al. 2013
BLOSUM = substitution_matrices.load('BLOSUM62')
THREE = {'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C', 'GLN': 'Q', 'GLU': 'E', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I', 'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P', 'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V'}

ref = pd.read_csv('data/raw/DMS_substitutions.csv').set_index('DMS_id')
txt = lambda x: '' if pd.isna(x) else str(x)   # some reference fields are empty
dmsz, afz = zipfile.ZipFile('data/raw/DMS.zip'), zipfile.ZipFile('data/raw/AF2.zip')
pdb_names = {n.split('/')[-1][:-4]: n for n in afz.namelist() if n.endswith('.pdb')}
os.makedirs(f'{OUT}/structures', exist_ok=True)

def read_a2m(path):
    seqs, cur = [], []
    for line in open(path):
        if line.startswith('>'):
            if cur: seqs.append(''.join(cur))
            cur = []
        else: cur.append(line.strip())
    if cur: seqs.append(''.join(cur))
    # ProteinGym a2m: every row spans all query columns; lowercase marks low-coverage ("non-focus")
    # columns — still real alignment columns, so keep them (upper-cased), with '.' as a gap
    assert len({len(x) for x in seqs}) == 1, 'rows of unequal length'
    return [x.upper().replace('.', '-') for x in seqs]

def msa_stats(path, L, start):
    seqs = read_a2m(path)
    q = seqs[0]
    idx = {a: i for i, a in enumerate(AA)}
    enc = lambda s: np.array([idx.get(c, 20) for c in s], dtype=np.int8)
    rest = seqs[1:]
    if len(rest) > MSA_SUBSAMPLE: rest = [rest[i] for i in RNG.choice(len(rest), MSA_SUBSAMPLE, replace=False)]
    M = np.stack([enc(q)] + [enc(s) for s in rest])                     # N × Lmsa (20 = gap/other)
    N, Lm = M.shape
    onehot = np.zeros((N, Lm * 21), np.float32); onehot[np.arange(N)[:, None], np.arange(Lm) * 21 + M] = 1
    nongap = (M != 20).astype(np.float32)
    ident = onehot @ onehot.T - (nongap @ nongap.T) * 0 - ((M == 20).astype(np.float32) @ (M == 20).astype(np.float32).T)
    ident /= np.maximum(1, nongap.sum(1))[:, None]
    w = 1.0 / (ident >= 0.8).sum(1)                                        # 80%-identity reweighting
    neff = float(w.sum())
    freq = np.zeros((Lm, 21))
    for a in range(21): freq[:, a] = ((M == a) * w[:, None]).sum(0)
    freq /= w.sum()
    # per-position stats in target-sequence coordinates (MSA covers start..start+Lm-1)
    pos = {}
    for j in range(Lm):
        p = freq[j, :20]; ng = p.sum()
        pn = p / ng if ng > 0 else np.full(20, 0.05)
        ent = -(pn[pn > 0] * np.log(pn[pn > 0])).sum()
        pos[start + j] = dict(freq=pn, gap=float(freq[j, 20]), cons=float(1 - ent / math.log(20)))
    # display rows: diverse homologs, spread across identity to the query, good coverage
    idq = ident[0, 1:]; cov = nongap[1:].mean(1)
    cand = np.flatnonzero((cov > 0.5) & (idq < 0.98))
    order = cand[np.argsort(-idq[cand])]
    pick = order[np.linspace(0, len(order) - 1, min(DISPLAY_ROWS, len(order))).astype(int)] if len(order) else []
    rows = [(rest[i], float(idq[i])) for i in pick]
    return pos, neff, len(seqs) - 1, rows, q

def structure_stats(pdb_text, seq):
    s = PDBParser(QUIET=True).get_structure('x', io.StringIO(pdb_text))
    ShrakeRupley().compute(s[0], level='R')
    res = [r for r in s[0].get_residues() if r.id[0] == ' ' and r.get_resname() in THREE]
    sseq = ''.join(THREE[r.get_resname()] for r in res)
    assert sseq == seq, 'structure sequence differs from target sequence'
    coords = np.array([(r['CB'] if 'CB' in r else r['CA']).coord for r in res])
    dist = np.linalg.norm(coords[:, None] - coords[None], axis=2)
    out = {}
    for i, r in enumerate(res):
        out[i + 1] = dict(rsa=min(1.0, r.sasa / MAX_ASA[THREE[r.get_resname()]]), plddt=float(r['CA'].get_bfactor()), nbr=int((dist[i] < 10).sum() - 1))
    return out

proteins, variants, rows_for_model = [], [], []
for group, ids in GROUPS.items():
    for d in ids:
        r = ref.loc[d]
        seq = r.target_seq; L = len(seq)
        dms = pd.read_csv(io.BytesIO(dmsz.read(f'DMS_ProteinGym_substitutions/{r.DMS_filename}')))
        dms = dms[~dms.mutant.str.contains(':')].copy()
        sc = pd.read_csv(f'data/raw/scores/{d}.csv')
        sc = sc[~sc.mutant.str.contains(':')].set_index('mutant')
        pos, neff, nseq, disp, query = msa_stats(f'data/raw/msa/{r.MSA_filename}', L, int(r.MSA_start))
        assert query == seq[int(r.MSA_start) - 1:int(r.MSA_start) - 1 + len(query)], f'MSA query does not match target sequence for {d}'
        key = next(k for k in pdb_names if d.startswith(k))
        pdb_text = afz.read(pdb_names[key]).decode()
        pdb_text = '\n'.join(l for l in pdb_text.splitlines() if l.startswith(('ATOM', 'TER', 'END'))) + '\n'
        open(f'{OUT}/structures/{key}.pdb', 'w').write(pdb_text)
        st = structure_stats(pdb_text, seq)
        dms['pos'] = dms.mutant.str[1:-1].astype(int); dms['wt'] = dms.mutant.str[0]; dms['mt'] = dms.mutant.str[-1]
        assert (dms.apply(lambda x: seq[x.pos - 1] == x.wt, axis=1)).all()
        dms['pct'] = dms.DMS_score.rank(pct=True)
        frac_del = 1 - dms.DMS_score_bin.mean()
        # model calls: threshold each model so it calls the assay's true share deleterious (higher score = fitter)
        calls = {}
        for col, _, _ in MODELS:
            s = sc.loc[dms.mutant, col].to_numpy()
            thr = np.nanquantile(s, frac_del)
            calls[col] = (s >= thr).astype(int)
        for i, x in enumerate(dms.itertuples()):
            p, sp = pos.get(x.pos), st[x.pos]
            if p is None: continue
            f = dict(cons=p['cons'], gap=p['gap'], wtf=float(p['freq'][AA.index(x.wt)]), mtf=float(p['freq'][AA.index(x.mt)]), blosum=float(BLOSUM[x.wt][x.mt]),
                     dhyd=HYDRO[x.mt] - HYDRO[x.wt], dvol=VOLUME[x.mt] - VOLUME[x.wt], dchg=CHARGE.get(x.mt, 0) - CHARGE.get(x.wt, 0),
                     rsa=sp['rsa'], plddt=sp['plddt'], nbr=sp['nbr'], lneff=math.log10(max(neff, 1)),
                     topro=int(x.mt == 'P'), fromgly=int(x.wt == 'G'), cys=int('C' in (x.wt, x.mt)))
            rows_for_model.append(dict(protein=d, group=group, label=int(x.DMS_score_bin), **f))
            variants.append(dict(protein=d, group=group, pos=x.pos, wt=x.wt, mt=x.mt, label=int(x.DMS_score_bin), pct=round(float(x.pct), 3), f=f,
                                 calls={c: int(calls[c][i]) for c, _, _ in MODELS}, row=len(rows_for_model) - 1))
        # per-position display data
        positions = {str(k): dict(freq=[round(float(v) * 1000) for v in pos[k]['freq']], gap=round(pos[k]['gap'], 3), cons=round(pos[k]['cons'], 3),
                                  rsa=round(st[k]['rsa'], 3), plddt=round(st[k]['plddt'], 1), nbr=st[k]['nbr']) for k in pos if k in st}
        proteins.append(dict(id=d, group=group, key=key, name=r.molecule_name, organism=r.source_organism, uniprot=r.UniProt_ID, seq=seq,
                             selection=r.coarse_selection_type, assay=txt(r.selection_assay) or txt(r.selection_type), phenotype=txt(r.raw_DMS_phenotype_name), year=int(r.year), author=r.first_author,
                             msa_depth=r.MSA_Neff_L_category, neff=round(neff, 1), nseq=int(nseq), frac_del=round(float(frac_del), 3), cutoff=r.DMS_binarization_method,
                             msa_rows=[dict(seq=s, id=round(i, 3)) for s, i in disp], positions=positions))
        print(f'{d:36s} {group:7s} L={L:4d} singles={len(dms):5d} del={frac_del:.2f} MSA seqs={nseq:6d} Neff={neff:8.1f}', flush=True)

# feature model ("sees what you see"): trained on the learning proteins; leave-one-protein-out for those
F = pd.DataFrame(rows_for_model)
FEATS = ['cons', 'gap', 'wtf', 'mtf', 'blosum', 'dhyd', 'dvol', 'dchg', 'rsa', 'plddt', 'nbr', 'lneff', 'topro', 'fromgly', 'cys']
pred = np.zeros(len(F), int)
learn = F.group == 'learn'
for prot in GROUPS['learn']:
    tr = learn & (F.protein != prot); te = F.protein == prot
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05).fit(F.loc[tr, FEATS], F.loc[tr, 'label'])
    pred[te] = m.predict(F.loc[te, FEATS])
m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05).fit(F.loc[learn, FEATS], F.loc[learn, 'label'])
other = ~learn
pred[other] = m.predict(F.loc[other, FEATS])
for v in variants: v['calls']['feature_model'] = int(pred[v['row']])

# simple single-cue baselines, thresholded like the models (per protein, at the true deleterious share)
for name, fn in [('blosum62', lambda f: f['blosum']), ('conservation', lambda f: -f['cons']), ('mut_frequency', lambda f: f['mtf'])]:
    for prot in {v['protein'] for v in variants}:
        vs = [v for v in variants if v['protein'] == prot]
        s = np.array([fn(v['f']) for v in vs]); fd = next(p['frac_del'] for p in proteins if p['id'] == prot)
        thr = np.quantile(s, fd)
        for v, x in zip(vs, s): v['calls'][name] = int(x >= thr)

# balanced pool per protein
pool = []
for prot in {v['protein'] for v in variants}:
    vs = [v for v in variants if v['protein'] == prot]
    d_, f_ = [v for v in vs if v['label'] == 0], [v for v in vs if v['label'] == 1]
    k = min(len(d_), len(f_), MAX_PER_PROTEIN // 2)
    pool += [d_[i] for i in RNG.choice(len(d_), k, replace=False)] + [f_[i] for i in RNG.choice(len(f_), k, replace=False)]
pool.sort(key=lambda v: (v['protein'], v['pos'], v['mt']))
ALL_MODELS = [dict(name='blosum62', label='BLOSUM62', kind='simple'), dict(name='conservation', label='MSA conservation', kind='simple'),
              dict(name='mut_frequency', label='Mutant seen in MSA', kind='simple'), dict(name='feature_model', label='Feature model (sees what you see)', kind='simple')] + \
             [dict(name=c, label=l, kind=k) for c, l, k in MODELS]
order = [m['name'] for m in ALL_MODELS]
out = dict(version=pd.Timestamp.now().strftime('%Y%m%d-%H%M'), source='ProteinGym v1.3 (Notin et al., 2023) — DMS substitutions, MSAs, AlphaFold2 structures, zero-shot model scores',
           models=ALL_MODELS, model_order=order, aa=AA, proteins=proteins,
           variants=[dict(id=i, p=v['protein'], pos=v['pos'], wt=v['wt'], mt=v['mt'], y=v['label'], pct=v['pct'], f={k: round(x, 3) if isinstance(x, float) else x for k, x in v['f'].items()},
                          c=''.join(str(v['calls'][m]) for m in order)) for i, v in enumerate(pool)])
json.dump(out, open(f'{OUT}/dataset.json', 'w'), separators=(',', ':'), allow_nan=False)   # NaN is not valid JSON
print(f'\n{len(pool)} variants in the pool → {OUT}/dataset.json ({os.path.getsize(f"{OUT}/dataset.json") / 1e6:.1f} MB)')
for group in GROUPS:
    vs = [v for v in pool if v['group'] == group]
    acc = {m: np.mean([int(v['calls'][m]) == v['label'] for v in vs]) for m in order}
    print(f'  {group:7s} n={len(vs):5d}  ' + '  '.join(f'{m.split("_")[0][:10]}={acc[m]*100:.0f}%' for m in order))
