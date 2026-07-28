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

# Resolve the repo URL: explicit arg > current repo's origin > default.
REPO_URL="${1:-}"
if [ -z "$REPO_URL" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	REPO_URL="$(git config --get remote.origin.url || true)"
fi
REPO_URL="${REPO_URL:-https://github.com/ludovicweber87/Kepler.git}"

echo "→ Installing Kepler into $KEPLER_HOME"
mkdir -p "$KEPLER_HOME" "$BIN_DIR"

# 1. Clone or update the dedicated repo (tracks main).
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
PATH_LINE='export PATH="$HOME/.kepler/bin:$PATH"'
added=""
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
	if [ -f "$rc" ] && ! grep -qF '.kepler/bin' "$rc"; then
		printf '\n# Kepler CLI\n%s\n' "$PATH_LINE" >> "$rc"
		added="$rc"
	fi
done
if [ -n "${FISH_VERSION:-}" ] || [ -f "$HOME/.config/fish/config.fish" ]; then
	fish_rc="$HOME/.config/fish/config.fish"
	if [ -f "$fish_rc" ] && ! grep -qF '.kepler/bin' "$fish_rc"; then
		printf '\nset -gx PATH $HOME/.kepler/bin $PATH\n' >> "$fish_rc"
		added="$fish_rc"
	fi
fi

# 6. Clean up the previous install, when the project was named Devora. The old
#    `devora` symlink points at a path that no longer exists once cli/devora is
#    renamed, and the old PATH line keeps a dead directory in front of PATH.
#    Runtime state in ~/.devora is left alone — see scripts/rename-to-kepler.sh.
if [ -L "$HOME/.devora/bin/devora" ]; then
	rm -f "$HOME/.devora/bin/devora"
	echo "→ Removed the stale 'devora' symlink from the previous install."
fi
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.config/fish/config.fish"; do
	if [ -f "$rc" ] && grep -qF '.devora/bin' "$rc"; then
		echo "⚠ $rc still adds ~/.devora/bin to PATH — remove that line (the directory is gone)."
	fi
done

echo ""
echo "✓ Kepler installed."
[ -n "$added" ] && echo "  PATH updated in $added — open a new terminal (or source it)."
echo "  Then run:  kepler start"
