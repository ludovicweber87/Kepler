#!/usr/bin/env bash
# Kepler installer — clones a dedicated copy to ~/.kepler/repo, builds it, and
# puts a stable `kepler` command on your PATH. Re-runnable (updates in place).
#
#   bash install.sh              # repo URL detected from the current git remote
#   bash install.sh <git-url>    # explicit repo URL
set -euo pipefail

KEPLER_HOME="${KEPLER_HOME:-$HOME/.kepler}"
REPO_DIR="$KEPLER_HOME/repo"
BIN_DIR="$KEPLER_HOME/bin"
CLI_NAME="kepler"

# Resolve the repo URL: explicit arg > origin of the *Kepler* checkout we're in > default.
#
#    La détection du remote local ne vaut que si le répertoire courant est bien
#    un clone de Kepler (cas d'un fork). Sans ce garde-fou, un `curl | bash`
#    lancé depuis n'importe quel projet clonait ce projet-là dans ~/.kepler/repo
#    et échouait sur son build, sans que le message d'erreur ne dise pourquoi.
REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
	repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
	if [ -n "$repo_root" ] && [ -x "$repo_root/cli/$CLI_NAME" ]; then
		REPO_URL="$(git -C "$repo_root" config --get remote.origin.url || true)"
	fi
fi
REPO_URL="${REPO_URL:-https://github.com/ludovicweber87/Kepler.git}"

echo "→ Installing Kepler into $KEPLER_HOME"
mkdir -p "$KEPLER_HOME" "$BIN_DIR"

# 1. Clone or update the dedicated repo (tracks main).
#
#    Un ~/.kepler/repo pointant sur un autre remote (installation partie sur le
#    mauvais repo) est remplacé plutôt que « pull »é : sinon chaque relance
#    rejoue le build du mauvais projet.
if [ -d "$REPO_DIR/.git" ] && [ "$(git -C "$REPO_DIR" config --get remote.origin.url || true)" != "$REPO_URL" ]; then
	echo "⚠ $REPO_DIR points at a different repository — re-cloning $REPO_URL"
	rm -rf "$REPO_DIR"
fi
if [ -d "$REPO_DIR/.git" ]; then
	echo "→ Repo present, pulling latest main..."
	git -C "$REPO_DIR" pull --rebase origin main || git -C "$REPO_DIR" pull origin main
else
	echo "→ Cloning $REPO_URL ..."
	git clone "$REPO_URL" "$REPO_DIR"
fi

# 2. Prerequisite checks (non-blocking warnings — Kepler needs these at runtime).
if ! command -v node >/dev/null 2>&1; then
	echo "⚠ Node.js not found — install Node 20–25 (native modules don't support Node 26 yet)."
else
	node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
	if [ "$node_major" -lt 20 ] || [ "$node_major" -gt 25 ]; then
		echo "⚠ Node $(node -v) detected — Kepler targets Node 20–25 (better-sqlite3 / node-pty)."
	fi
fi
command -v tmux  >/dev/null 2>&1 || echo "⚠ tmux not found — required for agent terminal sessions. Install it (e.g. brew install tmux)."
command -v claude >/dev/null 2>&1 || echo "⚠ Claude CLI (claude) not found — required for the Agent SDK. See https://docs.anthropic.com/en/docs/claude-code"

# GitHub auth comes from the local `gh` CLI — no secrets to configure.
if ! command -v gh >/dev/null 2>&1; then
	echo "⚠ GitHub CLI (gh) not found. Install it: https://cli.github.com"
	echo "  Kepler uses your gh session for GitHub access."
elif ! gh auth status >/dev/null 2>&1; then
	echo "⚠ gh is installed but not logged in — run: gh auth login"
fi

# 3. Install deps and build (app + agent).
echo "→ Installing dependencies..."
( cd "$REPO_DIR" && npm install )
echo "→ Building (app + agent)..."
( cd "$REPO_DIR" && npm run build && npm run build -w packages/agent )

# 4. Stable symlink on PATH.
chmod +x "$REPO_DIR/cli/$CLI_NAME"
ln -sf "$REPO_DIR/cli/$CLI_NAME" "$BIN_DIR/$CLI_NAME"

# 5. Add ~/.kepler/bin to PATH (idempotent).
#
#    `rc_file` est le fichier à recharger, qu'on vienne de l'écrire ou qu'il
#    contienne déjà la ligne : c'est lui qu'on affiche à la fin. Sans cette
#    distinction, une réinstallation n'ajoutait rien, n'affichait rien, et
#    laissait croire que `kepler` était déjà dans le PATH du shell courant.
PATH_LINE='export PATH="$HOME/.kepler/bin:$PATH"'
rc_file=""
added=""

case "${SHELL:-}" in
	*/fish) shell_rcs="$HOME/.config/fish/config.fish" ;;
	*/bash) shell_rcs="$HOME/.bashrc $HOME/.bash_profile" ;;
	*) shell_rcs="$HOME/.zshrc" ;;
esac

for rc in $shell_rcs; do
	if [ -f "$rc" ] && grep -qF '.kepler/bin' "$rc"; then
		rc_file="$rc"
		break
	fi
done

if [ -z "$rc_file" ]; then
	# Rien de configuré : on écrit dans le premier candidat du shell courant, en
	#    le créant s'il n'existe pas. Sur un macOS neuf `~/.zshrc` est absent, et
	#    la version précédente sautait silencieusement l'écriture — l'utilisateur
	#    se retrouvait avec un `kepler: command not found` même après redémarrage.
	rc_file="${shell_rcs%% *}"
	mkdir -p "$(dirname "$rc_file")"
	case "$rc_file" in
		*config.fish) printf '\n# Kepler CLI\nset -gx PATH $HOME/.kepler/bin $PATH\n' >> "$rc_file" ;;
		*)            printf '\n# Kepler CLI\n%s\n' "$PATH_LINE" >> "$rc_file" ;;
	esac
	added="$rc_file"
fi


echo ""
echo "✓ Kepler installed."
if [ -n "$added" ]; then
	echo "  PATH line added to $rc_file."
else
	echo "  PATH already configured in $rc_file."
fi
echo ""
echo "  ~/.kepler/bin is not in this shell's PATH yet. Load it, then start:"
echo ""
echo "      source $rc_file && kepler start"
echo ""
echo "  (a new terminal works too — the PATH line is picked up on startup)"
