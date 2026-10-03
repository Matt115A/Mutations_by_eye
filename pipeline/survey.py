"""Score every ProteinGym substitution assay as a candidate for the game."""
import io, zipfile
import numpy as np, pandas as pd
ref = pd.read_csv('data/raw/DMS_substitutions.csv')
dz, az = zipfile.ZipFile('data/raw/DMS.zip'), zipfile.ZipFile('data/raw/AF2.zip')
pdbs = {n.split('/')[-1][:-4]: n for n in az.namelist() if n.endswith('.pdb')}
rows = []
for _, r in ref.iterrows():
    d = pd.read_csv(io.BytesIO(dz.read(f"DMS_ProteinGym_substitutions/{r.DMS_filename}")))
    s = d[~d.mutant.str.contains(':')]
    pdb_key = next((k for k in pdbs if r.DMS_id.startswith(k)), None)
    plddt = None
    if pdb_key:
        b = [float(l[60:66]) for l in az.read(pdbs[pdb_key]).decode().splitlines() if l.startswith('ATOM') and l[12:16].strip() == 'CA']
        plddt = float(np.mean(b)) if b else None
    rows.append(dict(DMS_id=r.DMS_id, uniprot=r.UniProt_ID, name=r.molecule_name, sel=r.coarse_selection_type, msa=r.MSA_Neff_L_category, neff_l=r.MSA_Neff_L, taxon=r.taxon, L=r.seq_len,
                     singles=len(s), frac_del=1 - s.DMS_score_bin.mean(), pdb=pdb_key, plddt=plddt, year=r.year))
t = pd.DataFrame(rows)
t.to_csv('data/survey.csv', index=False)
ok = t[(t.singles >= 1000) & (t.L.between(80, 650)) & t.frac_del.between(0.25, 0.75) & t.pdb.notna() & (t.plddt >= 80)]
print(f'{len(t)} assays; {len(ok)} pass (≥1000 singles, length 80–650, 25–75% deleterious, AF2 structure with mean pLDDT ≥ 80)')
pd.set_option('display.width', 220); pd.set_option('display.max_rows', 200)
for cat in ('High', 'Medium', 'Low'):
    sub = ok[ok.msa == cat].sort_values('singles', ascending=False)
    print(f'\n== MSA depth {cat}: {len(sub)}')
    print(sub[['DMS_id', 'name', 'sel', 'taxon', 'L', 'singles', 'frac_del', 'plddt', 'neff_l']].head(25).to_string(index=False))
