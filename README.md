# chemlabel_findings — ECHA CHEM findings for chemlabel webapp

> Peuplé le 2026-09-21 par Noa (Asus G834JY `w1:p1`, `100.94.123.117`) + Mika (GMKtec `w2:p1`, `100.028.874`) via `herdr --machine GMKtec` et **Jev 1.13** (`typesafe/jev-1.13` via OpenRouter) + **Playwright 1.63.0** (`chromium-1243`).

Ce dossier sert de **zone tampon** avant intégration dans l'app web **chemlabel** (`gmktec:~/workspace-work/web/labo-vdg-web2/` — backend FastAPI `app/services/chemlabel/`, frontend SvelteKit).

## Structure

```
chemlabel_findings/
├── README.md
├── findings/
│   ├── potassium_permanganate_echa.json  # rmlId 100.028.874, cid 65677, SCL []
│   └── sodium_hydroxide_echa.json        # rmlId 100.013.805, pattern harmonised 357489
├── raw_api/
│   ├── permanganate_fiche_actuelle.json  # copie de labo-vdg-web2/backend/.../permanganate_de_potassium.json
│   ├── echa_classifier.py                # copie du classifier CLP
│   └── echa_raw_*.json                   # dumps API ECHA si besoin
├── scripts/
│   ├── jev-decide.ps1                    # wrapper OpenRouter Decisions API (Asus)
│   ├── jev-agent.md                      # sub-agent @jev (mode subagent)
│   └── echa_*.js                         # 15 scripts Playwright+Jev pour naviguer ECHA CHEM
├── docs/
│   ├── identites.md                      # Noa + Mika
│   └── discussion.md                     # herdr --machine GMKtec guide (PO-ASUSJ834-omarchy)
└── findings/route_jev_playwright.md      # récit de la route Jev
```

## Findings clés (2026-09-21)

### Potassium permanganate — pas de SCL harmonisé

- **Substance** : `Potassium permanganate` — `EC 231-760-3` — `CAS 7722-64-7` — `rmlId 100.028.874` — `Index 025-002-00-9` — `ATP13`
- **Route Jev** :
  1. `https://chem.echa.europa.eu` → `GET /api-substance/v1/substance?searchText=potassium%20permanganate&pageIndex=1&pageSize=10` → `rmlId 100.028.874` (Jev `search_via_event 0.97`)
  2. `GET /api-substance/v1/substance/100.028.874` → substance detail
  3. `GET /api-cnl-inventory/prominent/overview/info/100.028.874` → `classificationId 65677`
  4. `GET /api-cnl-inventory/prominent/overview/classifications/harmonised/65677` → 5 classes
  5. `GET /api-cnl-inventory/harmonized/specific-concentration-limits/65677` → `{"items":[]}` (Jev `hasSCL noul 0.04` → confirmé vide)
- **Harmonised** : `https://chem.echa.europa.eu/100.028.874/harmonised/65677` (pattern calqué sur `100.013.805/harmonised/357489?searchText=sodium+hydroxyde`)
  - `Ox. Sol. 2 H272`, `Repr.2 H361d`, `Acute Tox.4 H302`, `Aquatic Acute1 H400`, `Aquatic Chronic1 H410`
  - `M-factors []`, `ATE []`, `notes []`, `SCL []` → **aucune limite spécifique**, limites génériques CLP seules
- **Conclusion** : conforme à la fiche actuelle `backend/app/services/chemlabel/data/fiches/permanganate_de_potassium.json` qui a déjà `echa_classification.specific_concentration_limits: []`. Pas de mise à jour de fiche nécessaire, mais on a la preuve API datée et la route reproductible pour d'autres substances.

### Sodium hydroxide — pattern de référence

- `rmlId 100.013.805` — `EC 215-185-5` — `CAS 1310-73-2`
- URL exemple : `https://chem.echa.europa.eu/100.013.805/harmonised/357489?searchText=sodium+hydroxyde`
- SCL : `C ≥5% → Skin Corr.1A`, `2%≤C<5% → 1B`, `0.5%≤C<2% → Skin Irrit.2 / Eye Irrit.2` (déjà dans `hydroxyde_de_sodium.json`)

## Scripts Jev + Playwright

- `scripts/jev-decide.ps1` — wrapper `POST https://openrouter.ai/api/alpha/decisions` avec `model=typesafe/jev-1.13`, lit `auth.json` (`sk-or-v1-...`), gère `state`/`questions` (`noul`/`choice`/`score`).
- `scripts/jev-agent.md` — sub-agent opencode `mode: subagent`, `model: openrouter/deepseek/deepseek-flash`, `temperature 0.0`, à invoquer via `@jev` dans le TUI.
- `scripts/echa_*.js` — 15 itérations pour dompter ECHA CHEM (Angular, cookies `Accept all cookies` + `I Accept the terms`, `input disabled` → `evaluate` + `dispatchEvent`, `searchStateChanged`, chunk `web-components-YEXNEAN2.js` → `X.substanceApiUrl+"/api-substance/v1/substance"`).

Le plus abouti : `echa_final_jev.js` (Jev à chaque décision) + `echa_scl.js` (extraction SCL) + `echa_correct_search.js` (search API correcte avec `pageIndex=1&pageSize=10`).

## Lien avec chemlabel (sans écrire)

- **Référence lue** (lecture seule) : `gmktec:~/workspace-work/web/labo-vdg-web2/backend/app/services/chemlabel/` (`echa_classifier.py`, `data/fiches/*.json`) — copiée en `raw_api/` à titre d'archive, **aucune écriture** vers ce dépôt.
- **Ce dossier `chemlabel_findings` est autonome** : staging local `C:\Users\hcteu\Documents\opencode\chemlabel_findings` uniquement. L'intégration vers `labo-vdg-web2` reste à faire par son owner, hors de ce projet.

## Reproductibilité

```powershell
# Asus G834JY (Noa)
powershell -File .\scripts\jev-decide.ps1 -StateFile state.json -QuestionsFile questions.json
node .\scripts\echa_correct_search.js
node .\scripts\echa_final_jev.js
```

Tous les dumps API sont rejouables sans browser via `curl -H "Accept: application/json" https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874`.

## Crédits

- Jérôme — demande initiale + projet chemlabel
- Noa (Asus G834JY) — Playwright + Jev wrapper
- Mika (GMKtec) — miroir `docs/discussion.md`, `identites.md`, validation `permanganate_de_potassium.json`
