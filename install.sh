#!/usr/bin/env bash
# Devora installer — clones a dedicated copy to ~/.devora/repo, builds it, and
# puts a stable `devora` command on your PATH. Re-runnable (updates in place).
#
#   bash install.sh              # repo URL detected from the current git remote
#   bash install.sh <git-url>    # explicit repo URL
set -euo pipefail

DEVORA_HOME="${DEVORA_HOME:-$HOME/.devora}"
REPO_DIR="$DEVORA_HOME/repo"
BIN_DIR="$DEVORA_HOME/bin"
CLI_NAME="devora"

# Resolve the repo URL: explicit arg > current repo's origin > default.
REPO_URL="${1:-}"
if [ -z "$REPO_URL" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	REPO_URL="$(git config --get remote.origin.url || true)"
fi
REPO_URL="${REPO_URL:-https://github.com/ludovicweber87/Devora.git}"

echo "→ Installing Devora into $DEVORA_HOME"
mkdir -p "$DEVORA_HOME" "$BIN_DIR"

# 1. Clone or update the dedicated repo (tracks main).
if [ -d "$REPO_DIR/.git" ]; then
	echo "→ Repo present, pulling latest main..."
	git -C "$REPO_DIR" pull --rebase origin main || git -C "$REPO_DIR" pull origin main
else
	echo "→ Cloning $REPO_URL ..."
	git clone "$REPO_URL" "$REPO_DIR"
fi

# 2. GitHub auth comes from the local `gh` CLI — no secrets to configure.
if ! command -v gh >/dev/null 2>&1; then
	echo "⚠ GitHub CLI (gh) not found. Install it: https://cli.github.com"
	echo "  Devora uses your gh session for GitHub access."
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

# 5. Add ~/.devora/bin to PATH (idempotent).
PATH_LINE='export PATH="$HOME/.devora/bin:$PATH"'
added=""
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
	if [ -f "$rc" ] && ! grep -qF '.devora/bin' "$rc"; then
		printf '\n# Devora CLI\n%s\n' "$PATH_LINE" >> "$rc"
		added="$rc"
	fi
done
if [ -n "${FISH_VERSION:-}" ] || [ -f "$HOME/.config/fish/config.fish" ]; then
	fish_rc="$HOME/.config/fish/config.fish"
	if [ -f "$fish_rc" ] && ! grep -qF '.devora/bin' "$fish_rc"; then
		printf '\nset -gx PATH $HOME/.devora/bin $PATH\n' >> "$fish_rc"
		added="$fish_rc"
	fi
fi

echo ""
echo "✓ Devora installed."
[ -n "$added" ] && echo "  PATH updated in $added — open a new terminal (or source it)."
echo "  Then run:  devora start"
