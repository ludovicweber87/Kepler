#!/usr/bin/env bash
# rename-to-kepler.sh — migre l'état machine de Devora vers Kepler.
#
# Le renommage dans le code est une chose ; l'état déjà posé sur le disque en est
# une autre. Ce script s'occupe du second : dossier runtime, base SQLite, dossier
# de checkout, worktrees, remotes, dépôt GitHub, profil Electron, PATH.
#
#   bash scripts/rename-to-kepler.sh            # dry-run : affiche, ne fait rien
#   bash scripts/rename-to-kepler.sh --apply    # exécute
#
# Idempotent : chaque étape vérifie l'état avant d'agir, une seconde exécution ne
# casse rien. À lancer app arrêtée.
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

OLD_HOME="$HOME/.devora"
NEW_HOME="$HOME/.kepler"
OLD_PROJECT="${OLD_PROJECT:-$HOME/Documents/Lab/Perso/Devora}"
NEW_PROJECT="${NEW_PROJECT:-$HOME/Documents/Lab/Perso/Kepler}"
GH_REPO_OLD="${GH_REPO_OLD:-ludovicweber87/Devora}"
GH_REPO_NEW="${GH_REPO_NEW:-Kepler}"
APP_SUPPORT="$HOME/Library/Application Support"

# Le script vit dans le dossier qu'il va déplacer : bash lit un script au fur et à
# mesure, un `mv` en cours de route le couperait en deux. On se recopie donc hors
# de la zone avant de commencer.
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
case "$SELF" in
	"$OLD_PROJECT"/*)
		SAFE="$(mktemp -d)/rename-to-kepler.sh"
		cp "$SELF" "$SAFE"
		echo "→ Script relocalisé hors de $OLD_PROJECT ($SAFE)"
		exec bash "$SAFE" "$@"
		;;
esac

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
run() {
	if [ "$APPLY" = 1 ]; then printf '   $ %s\n' "$*"; "$@"; else printf '   (dry) %s\n' "$*"; fi
}
sql() {
	if [ "$APPLY" = 1 ]; then printf '   $ sqlite3 … %s\n' "$1"; sqlite3 "$DB" "$1";
	else printf '   (dry) sqlite3 … %s\n' "$1"; fi
}
skip() { printf '   • %s\n' "$1"; }

if [ "$APPLY" != 1 ]; then
	echo "MODE DRY-RUN — rien ne sera modifié. Relance avec --apply pour exécuter."
	echo "  NB : les étapes qui dépendent d'un déplacement précédent (base, remotes,"
	echo "  symlink) rapporteront « absent » — normal, le mv n'a pas eu lieu."
fi

# ── 1. L'app doit être arrêtée : SQLite se déplace à froid ────────────────────
step "1. Arrêt des services"
if pgrep -f 'packages/agent/dist/index.js|packages/desktop' >/dev/null 2>&1; then
	if command -v kepler >/dev/null 2>&1; then run kepler stop
	elif [ -x "$OLD_HOME/bin/devora" ]; then run "$OLD_HOME/bin/devora" stop
	else
		echo "   ✗ Services actifs et aucune CLI trouvée pour les arrêter proprement."
		echo "     Arrête l'app puis relance ce script."
		[ "$APPLY" = 1 ] && exit 1
	fi
else
	skip "Aucun service actif."
fi

# ── 2. Dossier runtime + base SQLite ─────────────────────────────────────────
step "2. Dossier runtime ~/.devora → ~/.kepler"
if [ -d "$OLD_HOME" ] && [ ! -d "$NEW_HOME" ]; then
	# Checkpoint avant déplacement : le -wal fait 68 Mo, on le replie dans le .db
	# plutôt que de déplacer trois fichiers qui doivent rester cohérents entre eux.
	if [ -f "$OLD_HOME/devora.db" ]; then
		run cp "$OLD_HOME/devora.db" "$OLD_HOME/devora.db.pre-kepler.bak"
		if [ "$APPLY" = 1 ]; then
			printf '   $ wal_checkpoint(TRUNCATE)\n'
			sqlite3 "$OLD_HOME/devora.db" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
		else
			printf '   (dry) wal_checkpoint(TRUNCATE)\n'
		fi
	fi
	run mv "$OLD_HOME" "$NEW_HOME"
	for suffix in '' '-wal' '-shm'; do
		[ -e "$NEW_HOME/devora.db$suffix" ] && run mv "$NEW_HOME/devora.db$suffix" "$NEW_HOME/kepler.db$suffix"
	done
	skip "Le .env (tokens), attachments/ et .logs/ suivent le dossier."
elif [ -d "$NEW_HOME" ]; then
	skip "$NEW_HOME existe déjà — rien à faire."
else
	skip "$OLD_HOME absent — rien à faire."
fi
DB="$NEW_HOME/kepler.db"

# Les dossiers de attachments/ sont nommés d'après le sessionId, et on garde les
# sessionId `devora-*` en base (compat en lecture) : ne PAS les renommer, sinon
# les pièces jointes des 121 sessions existantes deviennent introuvables.
skip "attachments/devora-* volontairement conservés (clés = sessionId legacy)."

# ── 3. Dépôt GitHub ──────────────────────────────────────────────────────────
step "3. Dépôt GitHub"
if command -v gh >/dev/null 2>&1; then
	if gh repo view "$GH_REPO_OLD" >/dev/null 2>&1; then
		run gh repo rename "$GH_REPO_NEW" --repo "$GH_REPO_OLD" --yes
		skip "GitHub redirige l'ancienne URL, les clones existants continuent de fonctionner."
	else
		skip "$GH_REPO_OLD introuvable — probablement déjà renommé."
	fi
else
	skip "gh absent — renomme le dépôt à la main dans les settings GitHub."
fi

# ── 4. Dossier de checkout + 95 worktrees ────────────────────────────────────
step "4. Checkout $OLD_PROJECT → $NEW_PROJECT"
if [ -d "$OLD_PROJECT" ] && [ ! -d "$NEW_PROJECT" ]; then
	run mv "$OLD_PROJECT" "$NEW_PROJECT"

	# Chaque worktree pointe vers le dépôt principal par chemin absolu, dans les
	# deux sens (.git du worktree ↔ .git/worktrees/<nom>/gitdir). `repair` recolle
	# les deux côtés d'un coup.
	if [ "$APPLY" = 1 ]; then
		printf '   $ git worktree repair (dépôt principal + .worktrees/*)\n'
		git -C "$NEW_PROJECT" worktree repair "$NEW_PROJECT"/.worktrees/* 2>&1 | sed 's/^/     /' || true
	else
		printf '   (dry) git worktree repair %s/.worktrees/*\n' "$NEW_PROJECT"
	fi

	# node_modules de chaque worktree est un symlink absolu vers celui du dépôt
	# principal : après le mv il pend dans le vide.
	for wt in "$NEW_PROJECT"/.worktrees/*; do
		[ -L "$wt/node_modules" ] || continue
		case "$(readlink "$wt/node_modules")" in
			"$OLD_PROJECT"/*)
				run ln -sfn "$NEW_PROJECT/node_modules" "$wt/node_modules"
				;;
		esac
	done
elif [ -d "$NEW_PROJECT" ]; then
	skip "$NEW_PROJECT existe déjà — rien à faire."
else
	skip "$OLD_PROJECT absent — rien à faire."
fi

# ── 5. Chemins absolus en base ───────────────────────────────────────────────
step "5. Chemins en base"
if [ -f "$DB" ]; then
	for stmt in \
		"UPDATE repo_paths SET local_path = replace(local_path, '$OLD_PROJECT', '$NEW_PROJECT') WHERE local_path LIKE '$OLD_PROJECT%';" \
		"UPDATE agent_sessions SET project_path = replace(project_path, '$OLD_PROJECT', '$NEW_PROJECT') WHERE project_path LIKE '$OLD_PROJECT%';" \
		"UPDATE agent_sessions SET worktree_path = replace(worktree_path, '$OLD_PROJECT', '$NEW_PROJECT') WHERE worktree_path LIKE '$OLD_PROJECT%';"
	do
		sql "$stmt"
	done
	# agent_chat_messages.content (12 592), agent_activity_logs.content (4 032) et
	# daily_recaps.items (11) mentionnent aussi l'ancien chemin — mais ce sont des
	# archives : transcripts, logs, comptes rendus. On ne réécrit pas l'historique,
	# et on évite de toucher 16 000 blobs JSON pour un chemin d'affichage.
	skip "Transcripts / logs / recaps laissés tels quels (archives, 16 635 lignes)."
else
	skip "$DB absent — rien à faire."
fi

# ── 6. Remotes git ───────────────────────────────────────────────────────────
step "6. Remotes"
NEW_URL="git@github.com:${GH_REPO_OLD%%/*}/$GH_REPO_NEW.git"
for repo in "$NEW_PROJECT" "$NEW_HOME/repo"; do
	[ -d "$repo/.git" ] || { skip "$repo : pas un dépôt git."; continue; }
	current="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
	case "$current" in
		*[Dd]evora*) run git -C "$repo" remote set-url origin "$NEW_URL" ;;
		*) skip "$repo : remote déjà à jour ($current)." ;;
	esac
done

# ── 7. CLI sur le PATH ───────────────────────────────────────────────────────
step "7. CLI et PATH"
[ -L "$NEW_HOME/bin/devora" ] && run rm -f "$NEW_HOME/bin/devora" || skip "Pas d'ancien symlink devora."
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.config/fish/config.fish"; do
	[ -f "$rc" ] || continue
	if grep -qF '.devora/bin' "$rc"; then
		run cp "$rc" "$rc.pre-kepler.bak"
		run sed -i '' -e 's|\.devora/bin|.kepler/bin|g' -e 's|# Devora CLI|# Kepler CLI|' "$rc"
	else
		skip "$rc : pas de ligne PATH .devora/bin."
	fi
done

# ── 8. Profil Electron ───────────────────────────────────────────────────────
step "8. Profil Electron"
if [ -d "$APP_SUPPORT/Devora" ] && [ ! -d "$APP_SUPPORT/Kepler" ]; then
	# `app.setName('Kepler')` fait chercher le profil ailleurs : on déplace le
	# dossier pour garder la session GitHub et le localStorage (thème, brouillons).
	run mv "$APP_SUPPORT/Devora" "$APP_SUPPORT/Kepler"
else
	skip "Profil déjà migré ou absent."
fi
[ -d "$APP_SUPPORT/devora-desktop" ] && run rm -rf "$APP_SUPPORT/devora-desktop" \
	|| skip "Pas de profil orphelin devora-desktop."

# ── Reste à faire à la main ──────────────────────────────────────────────────
step "Suite"
cat <<'EOS'
   1. Merger la PR de renommage sur main.
   2. Relancer l'installeur pour reconstruire ~/.kepler/repo et poser la commande
      `kepler` sur le PATH :   bash install.sh
   3. Ouvrir un nouveau terminal (le PATH a changé), puis : kepler start
   4. Les sessions tmux `devora-*` encore vivantes ont un cwd qui n'existe plus :
      elles restent reconnues par l'app, mais il faut les relancer pour qu'elles
      repartent du bon dossier —  tmux kill-server  si tu préfères repartir net.
   5. Renommer le projet Vercel (devora-kappa-nine) si tu veux aligner l'URL ;
      l'allowlist CORS de l'agent accepte déjà les deux préfixes.
EOS
[ "$APPLY" = 1 ] || printf '\nDRY-RUN terminé — relance avec --apply pour exécuter.\n'
