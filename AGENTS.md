# AGENTS.md — chemlabel_findings

Staging local pour **chemlabel** — findings ECHA CHEM reproductibles via **Jev 1.13** + **Playwright 1.63.0**. Aucune écriture vers `labo-vdg-web2` (lecture seule).

## Mission

Peupler `findings/*.json` avec, par substance :

- `rmlId` / `EC` / `CAS` / `indexNumber` / `classificationId` (via `GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10`)
- `harmonised` (`GET /api-cnl-inventory/prominent/overview/info/{rmlId}` → `classificationId`)
- `classifications` (`GET /api-cnl-inventory/prominent/overview/classifications/harmonised/{cid}` et `GET /api-cnl-inventory/harmonized/classification/{cid}`)
- `specific-concentration-limits` (`GET /api-cnl-inventory/harmonized/specific-concentration-limits/{cid}` → `[]` ou 4 SCL pour HCl)
- `labelling`, `m-factors`, `notes`, `pictograms`

Pattern de référence : `sodium_hydroxide_echa.json` (`100.013.805` → `357489`) → `potassium_permanganate` (`100.028.874` → `65677` → `[]`) → `acide_chlorhydrique` (`100.028.723` → `285888` → 4 SCL).

## Stack sur cette machine (Asus G834JY, `w1:p1`, Noa)

- **Jev** : `C:\Users\hcteu\.config\opencode\tools\jev-decide.ps1` (wrapper `POST https://openrouter.ai/api/alpha/decisions` `model=typesafe/jev-1.13`, clé `~\.local\share\opencode\auth.json:openrouter`), agent `C:\Users\hcteu\.config\opencode\agents\jev.md` (`@jev`, `mode: subagent`, `model: openrouter/deepseek/deepseek-flash`).
- **Playwright** : `playwright@1.63.0` global (`C:\Users\hcteu\AppData\Roaming\npm\node_modules\playwright`), browsers `C:\Users\hcteu\AppData\Local\ms-playwright\chromium-1243` (+ headless, ffmpeg, winldd). Test `node -e "require('…/playwright').chromium.launch()"` → `Example Domain`.
- **Herdr** : `herdr --machine GMKtec` (`gmktec-tail` `100.65.139.1`, `Mika w2:p1`) pour miroir `docs/` (`herdr machine add --label GMKtec gmktec-tail`). Ne pas notifier Mika pour Playwright, mais `docs/discussion.md` est synchro.

## Layout

```
chemlabel_findings/
├── AGENTS.md
├── README.md
├── findings/                  # JSON findings par substance (Jev + API)
│   ├── potassium_permanganate_echa.json
│   ├── acide_chlorhydrique_echa.json
│   └── sodium_hydroxide_echa.json
├── raw_api/                   # copies lecture seule depuis labo-vdg-web2 (ne jamais écrire là-bas)
│   ├── permanganate_fiche_actuelle.json
│   └── echa_classifier.py
├── scripts/                   # 15+ scripts ECHA + Jev
│   ├── jev-decide.ps1
│   ├── jev-agent.md
│   ├── echa_correct_search.js      # search correct avec pageIndex/pageSize
│   ├── echa_final_jev.js           # route complète Jev
│   └── echa_hcl_jev.js             # acide chlorhydrique
└── docs/
    ├── identites.md           # Noa (Asus) + Mika (GMKtec)
    └── discussion.md          # guide herdr + PO-ASUSJ834-omarchy
```

## Règles

1. **Ne jamais écrire dans `~/workspace-work/web/labo-vdg-web2/`** (sur gmktec). Lecture seule autorisée (`ssh gmktec-tail "cat ..."` → `raw_api/`).
2. **Jev obligatoire** pour chaque décision de navigation : `callJev(state, questions)` via `jev-decide.ps1` (types `noul`/`choice`/`score`), ne pas deviner. Log `probabilities` + `confidence`.
3. **ECHA CHEM** : toujours passer par `GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10` (pas de POST), puis `GET /api-substance/v1/substance/{rmlId}`, puis `GET /api-cnl-inventory/prominent/overview/info/{rmlId}`. Accepter `Accept all cookies` + `I Accept the terms` avant `p.goto` substance/harmonised (sinon page `Legal notice`).
4. **Harmonised** : pattern `https://chem.echa.europa.eu/{rmlId}/harmonised/{classificationId}` (ex: `100.028.874/harmonised/65677`). SCL via `GET /api-cnl-inventory/harmonized/specific-concentration-limits/{cid}` → `{"items":[]}` ou 4 entrées.
5. **Playwright** : headless `true` sauf debug, `waitUntil: networkidle`, `waitForTimeout 3000` + `acceptAll()` helper. Screenshot dans `C:\Users\hcteu\AppData\Local\Temp\echa_*.png` si besoin.

## Commandes

```powershell
# Jev direct
powershell -File .\scripts\jev-decide.ps1 -StateFile state.json -QuestionsFile questions.json
# ou
echo '{"state":{"message":"..."},"questions":{"is_urgent":{"type":"noul","instructions":"..."}}}' | powershell -File .\scripts\jev-decide.ps1

# ECHA search correct
node .\scripts\echa_correct_search.js
node .\scripts\echa_final_jev.js          # route potassium permanganate complète
node .\scripts\echa_hcl_jev.js            # acide chlorhydrique

# Vérif Playwright
node -e "const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright'); (async()=>{const b=await chromium.launch(); const p=await b.newPage(); await p.goto('https://example.com'); console.log(await p.title()); await b.close();})()"
```

## Ajouter une substance

1. Choisir terme (`fr`/`en`/`CAS`/`EC`) → Jev `term` choice.
2. `GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10` → `rmlId`.
3. `GET /api-substance/v1/substance/{rmlId}` → `indexNumber`.
4. `GET /api-cnl-inventory/prominent/overview/info/{rmlId}` → `classificationId`.
5. `GET .../classifications/harmonised/{cid}` + `GET .../specific-concentration-limits/{cid}` → SCL.
6. Écrire `findings/{substance}_echa.json` avec `route_jev`, `jev_decisions`, `conclusion` (comparer à `raw_api/*_fiche_actuelle.json` si existe).

## Références

- `C:\Users\hcteu\.config\opencode\tools\jev-decide.ps1:1`, `C:\Users\hcteu\.config\opencode\agents\jev.md:1`
- `C:\Users\hcteu\Documents\opencode\chemlabel_findings\docs\discussion.md:1` (herdr + PO-ASUSJ834-omarchy)
- `C:\Users\hcteu\Documents\opencode\chemlabel_findings\findings\potassium_permanganate_echa.json:1`
- `C:\Users\hcteu\Documents\opencode\chemlabel_findings\findings\acide_chlorhydrique_echa.json:1`
