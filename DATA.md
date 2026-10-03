# Data sources and attribution

All data come from **ProteinGym v1.3** (https://proteingym.org, https://github.com/OATML-Markslab/ProteinGym):

> Notin, P. et al. *ProteinGym: Large-Scale Benchmarks for Protein Fitness Prediction and Design.* NeurIPS 2023 Datasets and Benchmarks.

Used here, for 10 assays (single mutants only):
- **DMS substitutions** — measured fitness scores and ProteinGym's binary labels (`DMS_score_bin`: 1 = neutral or better, 0 = deleterious, cutoff chosen per assay by ProteinGym). Each assay comes from its original publication (listed in the app's protein table: first author and year).
- **Multiple sequence alignments** — used to compute weighted column frequencies (80%-identity reweighting) and to show 14 representative relatives.
- **AlphaFold2 structures** of the assayed sequences — used for the 3D view, relative solvent accessibility (Shrake–Rupley), packing and pLDDT.
- **Zero-shot model scores** for Site-independent, EVmutation, GEMME, EVE, TranceptEVE L, ESM-1v, ESM2 650M, SaProt 650M, ProSST, S3F-MSA and VenusREM (each model's original authors). Scores are converted to deleterious/fit calls per assay at the assay's true deleterious fraction.

| Role | Assays |
|---|---|
| Learning | BLAT_ECOLX_Stiffler_2015, RASH_HUMAN_Bandaru_2017, CALM1_HUMAN_Weile_2017, MK01_HUMAN_Brenan_2016, AMIE_PSEAE_Wrenbeck_2017, ESTA_BACSU_Nutschel_2020 |
| New proteins | KKA2_KLEPN_Melnikov_2014, NUD15_HUMAN_Suiter_2020 |
| Few relatives (shallow MSA) | A0A247D711_LISMN_Stadelmann_2021, Q6WV12_9MAXI_Somermeyer_2022 |
