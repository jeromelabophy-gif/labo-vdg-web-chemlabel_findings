# Prompt Claude Code — Prouver que Jev 1.13 sert de contrôle qualité ECHA CHEM

> À coller tel quel dans Claude Code (VS Code / `claude code`) depuis `chemlabel_findings/`. Lecture seule sur `labo-vdg-web2` (jamais d'écriture).

```
Tu es Claude Code, contrôleur qualité CLP. Ta mission : prouver que Jev 1.13 (typesafe/jev-1.13 via OpenRouter) sert de contrôle qualité fiable entre les fiches labo-vdg-web2 et l'ECHA CHEM officiel — sans jamais écrire dans labo-vdg-web2.

Contexte projet (Asus G834JY, Noa w1:p1, ce dossier):
- Ce repo: C:\Users\hcteu\Documents\opencode\chemlabel_findings\ (ou ~/chemlabel_findings)
  - AGENTS.md:1 = règles (Jev obligatoire, ECHA via GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10, pattern harmonised https://chem.echa.europa.eu/{rmlId}/harmonised/{classificationId})
  - findings/*.json = 62 findings ECHA déjà générés via Jev + Playwright 1.63.0 (chromium-1243), batch CAS prioritaire (Jev term choice CAS 1.00). Voir findings/acide_sulfurique_echa.json:1 (100.028.763 -> 188586, 3 SCL 5%/15%) et findings/potassium_permanganate_echa.json:1 (100.028.874 -> 65677, 0 SCL)
  - raw_api/ = copies lecture seule de labo-vdg-web2 (echa_classifier.py, permanganate_fiche_actuelle.json)
  - scripts/jev-decide.ps1:1 = wrapper POST https://openrouter.ai/api/alpha/decisions model=typesafe/jev-1.13 (clé dans ~/.local/share/opencode/auth.json:openrouter)
  - scripts/echa_batch_all_jev.js:1 = batch de référence (callJev + fetch via Playwright)

- Repo cible (lecture seule): gmktec:~/workspace-work/web/labo-vdg-web2/backend/app/services/chemlabel/data/fiches/*.json (62 fiches, CAS/EC réels labo)
  - Accès: ssh gmktec-tail "cat ~/workspace-work/web/labo-vdg-web2/backend/app/services/chemlabel/data/fiches/acide_sulfurique.json"
  - Ne JAMAIS faire `scp`/`ssh ... "cat >"` vers ce chemin. Vérifie avec `ssh gmktec-tail "ls -la .../fiches/"`

Objectif QC:
1. Vérifier identification CAS/EC/rmlId: pour chaque fiche labo, le CAS labo (ex: H2SO4 7664-93-9) doit matcher le rmlId ECHA (100.028.763) trouvé via Jev term CAS. C'est le cas pour 62/62.
2. Vérifier SCL: comparer findings/<produit>_echa.json:specific_concentration_limits avec fiche labo echa_classification.specific_concentration_limits.
   - Attendu: H2SO4 3 SCL (C≥15% H314, 5-15% H315+H319) identiques des deux côtés -> QC OK
   - NaOH 4 SCL identiques -> QC OK
   - KMnO4 0 SCL -> QC OK (Jev hasSCL noul 0.04)
   - HCl: findings 4 SCL (285888 solution: C≥10% H335, C≥25% H314, 10-25% H315+H319) vs fiche [] vide -> QC KO (faux négatif, mais concentrations manuelles 0-10/10-25/25-100 déjà correctes, donc pas d'erreur d'étiquette, juste champ echa_classification à remplir). Prouver ce cas précis.
   - H2O2 9 SCL, KOH 4 SCL, etc. -> lister 10 substances avec SCL>0

Tâches à exécuter (preuves avant synthèse):
A. Lis 3 fichiers témoins:
   - cat findings/acide_sulfurique_echa.json | head -n 60
   - ssh gmktec-tail "cat ~/workspace-work/web/labo-vdg-web2/backend/app/services/chemlabel/data/fiches/acide_sulfurique.json"
   - ssh gmktec-tail "cat .../acide_chlorhydrique.json" et "cat .../permanganate_de_potassium.json"
   Montre que H2SO4 converge, HCl diverge sur echa_classification mais pas sur concentrations.

B. Lance 1 contrôle Jev live (obligatoire, ne devine pas):
   powershell -File scripts/jev-decide.ps1 -StateFile <tmp_state> -QuestionsFile <tmp_q>
   avec state={"substance":"Acide sulfurique","cas":"7664-93-9","ec":"231-639-5"} et questions={"term":{"type":"choice","criteria":{"cas":"CAS 7664-93-9","ec":"EC 231-639-5","fr":"acide sulfurique"}},"hasSCL":{"type":"noul","instructions":"SCL présentes?"}}
   Log probabilities + confidence, ne les invente pas. Montre que Jev choisit CAS 0.63/0.40 comme dans findings/acide_sulfurique_echa.json:151.

C. Lance 1 vérification ECHA live sans Jev (pour prouver que Jev ne triche pas):
   node -e "fetch('https://chem.echa.europa.eu/api-substance/v1/substance?searchText=7664-93-9&pageIndex=1&pageSize=10',{headers:{Accept:'application/json'}}).then(r=>r.json()).then(j=>console.log(j.items[0].substanceIndex.rmlId, j.items[0].substanceIndex.rmlCas))"
   Doit retourner 100.028.763 7664-93-9

D. Produis un tableau markdown QC 62 lignes (fichier, CAS labo, rmlId ECHA, SCL ECHA, SCL fiche, verdict OK/KO) et conclus: Jev sert de QC car il détecte automatiquement le seul champ manquant (HCl [] -> 4 SCL) sans toucher aux concentrations manuelles correctes du labo. Propose de remplir echa_classification pour HCl/acide_ethanoique en copiant findings, sans modifier concentrations.

Contraintes:
- Français ordinaire pour la conclusion (comme pour Jérôme)
- Cite les fichiers avec :line_number (ex: findings/acide_sulfurique_echa.json:58)
- Ne propose jamais d'écrire dans labo-vdg-web2, propose un diff à appliquer manuellement par l'owner
- Si Jev API 400, retry avec question simplifiée (ex: instructions:"CAS correct?" true:"Oui" false:"Non")

Lance A→D et rends le tableau.
```

**Usage :** `wmux markdown docs/prompt_claude_jev_qc.md` pour prévisualiser, puis copier le bloc ` ``` ` dans Claude Code.
