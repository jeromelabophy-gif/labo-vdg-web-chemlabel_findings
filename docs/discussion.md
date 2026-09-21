# Discussion inter-agents via Herdr

Guide pour que les superviseurs discutent entre eux via `herdr`. Permet d'ajouter un autre pote à la discussion.

> Créé 2026-09-21 par Noa (Asus G834JY) et Mika (GMKtec) à la demande de Jérôme.

## Machines actuelles

| Prénom | Machine | Tailscale IP | Hostname Herdr | Pane | Agent | Session |
|---|---|---|---|---|---|---|
| **Noa** | `po-asus-g834jy-windows` | `100.94.123.117` | `po-asus-g834jy-windows.tail783a8c.ts.net` | `w1:p1` | `opencode` (Muse Spark) | `default` |
| **Mika** | `gmktec` | `100.65.139.1` | `gmktec.tail783a8c.ts.net` | `w2:p1` | `opencode` | `default` |
| *(à venir)* | `PO-ASUSJ834-omarchy` | `TBD (Tailscale)` | `TBD` | `TBD` | `TBD` | `default` |

Fichier miroir : `gmktec:/home/jerome/.supervisor_gmktec/identites.md` ↔ `asus:C:\Users\hcteu\.supervisor-asusG834JY-windows\identites.md`

## Prérequis

- `herdr` 0.9.1+ installé des deux côtés (`herdr --help` → authority)
- `tailscale status` → nœuds `active; direct`
- SSH config `~/.ssh/config` avec les Hosts (voir `C:\Users\hcteu\.ssh\config:1` côté Asus, `~/.ssh/config` côté GMKtec)
  - `Host gmktec-tail` → `HostName 100.65.139.1` / `User jerome` / `IdentityFile ~/.ssh/gmktec`
  - `Host po-asus-g834jy-windows` → à créer côté GMKtec quand SSH Windows sera appairé

## 1. Ajouter une machine (1x par paire)

Sur la machine qui veut parler à l'autre :

```bash
# Depuis Asus vers GMKtec (fait le 2026-09-21)
herdr machine add --label GMKtec gmktec-tail
# → Saved SSH machine f03db722... Remote server is ready

# Depuis GMKtec vers Asus (à faire quand SSH Windows OK)
herdr machine add --label Asus po-asus-g834jy-windows
# ou direct IP si pas de Host:
herdr machine add --label Asus 100.94.123.117

# Ajouter un 3e pote — PO-ASUSJ834-omarchy (exemple générique)
herdr machine add --label PO-ASUSJ834-omarchy po-asusj834-omarchy
# ou avec IP Tailscale si Host non défini:
# herdr machine add --label PO-ASUSJ834-omarchy 100.x.x.x
# Exemple générique pour tout autre pote:
# herdr machine add --label <Label> <SSH_TARGET>
# Vérifier:
herdr machine list
herdr machine list --json
```

> `herdr machine list` liste les profils SSH sauvés, pas les panes. Le label est case-sensitive.

## 2. Découvrir l'autre

```bash
# Lister les panes distants
herdr --machine GMKtec pane list
# → w2:p1 = Mika (opencode idle) + w2:p2 = terminal

herdr --machine GMKtec agent list
# → opencode w2:p1

# Snapshot complet (debug)
herdr --machine GMKtec api snapshot | python3 -m json.tool | head -n 100
# Local (sans --machine):
herdr pane list
herdr agent list
herdr api snapshot
```

## 3. Envoyer un message (live)

### Méthode recommandée : `agent prompt` (suit le nom, survit au compactage des pane_id)

```bash
# Asus → GMKtec (Mika)
herdr --machine GMKtec agent prompt w2:p1 "Salut Mika c'est Noa depuis Asus — $(date)"

# GMKtec → Asus (quand Asus sera en machine)
herdr --machine Asus agent prompt w1:p1 "Salut Noa c'est Mika depuis GMKtec — $(date)"

# Vers un 3e pote (PO-ASUSJ834-omarchy)
herdr --machine PO-ASUSJ834-omarchy agent prompt <pane|agent> "Hello depuis GMKtec/Asus"
# Générique:
# herdr --machine <Label> agent prompt <pane|agent> "Hello depuis GMKtec/Asus"
```

> Note 2026-09-21 : `agent prompt opencode` via `--machine` a renvoyé `agent_not_found` depuis Asus. Workaround = viser le `pane_id` (`w2:p1`). Le nom `opencode` marche en local, mais via `--machine` préférer `w2:p1` jusqu'à fix.

### Fallback bas niveau : `pane send-text` + `send-keys` (toujours OK, lit direct dans le viewport)

```bash
herdr --machine GMKtec pane send-text w2:p1 "Salut Mika c'est Noa"
herdr --machine GMKtec pane send-keys w2:p1 Enter

# Lire la réponse
herdr --machine GMKtec pane read w2:p1 --source recent-unwrapped --lines 60
```

### Sans `machine add` (ad-hoc SSH)

```bash
ssh gmktec-tail "herdr pane send-text w2:p1 'hello depuis Asus'"
ssh gmktec-tail "herdr agent prompt w2:p1 'hello'"

# Depuis GMKtec sans machine add:
ssh jerome@100.94.123.117 "herdr pane list"
```

## 4. Vérifier la réception

```bash
# Après avoir envoyé, lire le pane distant
herdr --machine GMKtec pane read w2:p1 --source recent-unwrapped --lines 60
herdr --machine GMKtec pane read w2:p1 --source visible --lines 30

# Vérifier le statut de l'agent distant
herdr --machine GMKtec agent get w2:p1
```

Canal testé le 2026-09-21 21:27:09 et 21:27:20 : `Noa → Mika` OK via `herdr --machine GMKtec pane send-text w2:p1` et `agent prompt w2:p1`. Retour `Mika → Noa` bloqué `Too many authentication failures` côté OpenSSH Windows — à débloquer en ajoutant la clé `~/.ssh/gmktec.pub` dans `C:\Users\hcteu\.ssh\authorized_keys` côté Windows et `Host po-asus...` côté GMKtec.

## 5. Ajouter un autre pote à la discussion

1. Il installe `herdr` + `tailscale`, note son IP et hostname
2. Échange des clés SSH (`ssh-copy-id` ou ajout manuel `authorized_keys`)
3. Chacun fait `herdr machine add --label <Nouveau> <SSH_TARGET>`
4. Il choisit un prénom (comme Noa/Mika) → on met à jour `identites.md` + ce fichier `docs/discussion.md` (table Machines)
5. Tout le monde peut alors `herdr --machine <Label> agent prompt <pane> "message"` en broadcast :
   ```bash
   for m in GMKtec Asus PO-ASUSJ834-omarchy; do herdr --machine $m agent prompt w1:p1 "Hello à tous depuis $(hostname)"; done
   # Générique:
   # for m in GMKtec Asus <AutreLabel>; do herdr --machine $m agent prompt <pane> "Hello"; done
   ```
6. Option async si SSH coupé : dépôt `agent-mail` git (`/srv/ai-hub/agent-mail/` sur GMKtec) — déposer `to-<prenom>/` et `git push` via Forgejo, l'autre lit au démarrage (voir `archive/CONTEXTE.md`).

## Troubleshooting

- `error: unknown machine 'GMKtec'` → `herdr machine list` vide → refaire `herdr machine add --label GMKtec gmktec-tail`
- `agent_not_found` via `--machine` → essayer `w2:p1` au lieu de `opencode`
- `Too many authentication failures` → clé SSH non appairée, vérifier `ssh -v <host>` et `authorized_keys`
- `herdr --skill` → affiche la doc agent si besoin (`HERDR_ENV=1` requis pour certains contrôles)
- Pane compacté → ancien `w2:p1` devient invalide, relister via `herdr --machine <label> pane list` et viser le nouveau `pane_id` ou le nom d'agent

## Références

- `herdr --help`, `herdr agent --help`, `herdr pane --help`, `herdr machine --help`
- `~/.ssh/config` (Asus `C:\Users\hcteu\.ssh\config`, GMKtec `~/.ssh/config`)
- `tailscale status`
- `identites.md` (prénoms) et ce fichier `docs/discussion.md` (commandes)
