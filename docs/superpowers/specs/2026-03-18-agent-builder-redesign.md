# Agent Builder Redesign — Claude Code Native Format

## Context

The current `AgentBuilderDialog` is a 4-step wizard (task types → tech stack → conventions → generation) that generates plain markdown agent prompts via Claude CLI streaming. It doesn't work well — the generation loops on "Generating prompt..." and the output is freeform markdown without structure.

We want to replace this with a simpler flow that produces **real Claude Code agent files** (YAML frontmatter + markdown body), stored in the target repo's `.claude/agents/` directory.

## Design

### Flow: 3-step dialog

Single `Dialog` component (`maxWidth="lg"`, height `85vh`) with a `Stepper`:

**Step 1 — Choose repo**
- List repos from `useRepoPaths()` as clickable cards (repo full name + local path subtitle)
- If only one repo: pre-selected, user can skip to step 2
- If no repos: message + redirect button to `/settings`
- Selected repo determines write path: `<local_path>/.claude/agents/`

**Step 2 — Describe**
- Full-width textarea: "Describe what your agent should do..."
- "Generate" button bottom-right
- On click: call `/agent-builder` with updated system prompt requesting Claude Code agent format (frontmatter YAML + markdown body)
- Streaming in real-time below textarea via SSE `content_block_delta` events
- Blinking cursor during generation, textarea disabled
- Auto-advance to step 3 when generation completes

**Step 3 — Review & Save (split view)**
- 50/50 horizontal layout:
  - Left: monospace textarea — full editable file (frontmatter + body)
  - Right: rendered preview — frontmatter parsed into chips/badges (name, model, tools list) + body via ReactMarkdown
- Live sync: edits on left update preview on right
- Bottom actions bar:
  - Iteration: TextField "Refine..." + "Refine" button → sends current prompt + feedback to `/agent-builder`, restreams result
  - Save button: writes file to `<repo_path>/.claude/agents/<name>.md` (name extracted from frontmatter)
  - Back button to step 2
- Save disabled if frontmatter has no `name` field (with tooltip)

### Backend changes

**Updated system prompt** for `/agent-builder` route:

The existing system prompt is replaced to request Claude Code agent format:
- Frontmatter YAML: `name` (kebab-case), `description` (when to delegate), `tools` (from Read/Edit/Write/Glob/Grep/Bash/Agent/WebFetch/WebSearch), `model` (sonnet default)
- Body: markdown system prompt for the agent
- Output is the raw file content only, no code fences

**New route** `PUT /filesystem/claude-agents` in the agent local package (`packages/agent/src/routes/filesystem.ts`):
- Body: `{ repoPath: string, filename: string, content: string }`
- Auth: GitHub token extracted from `Authorization` header (same as other agent routes)
- Validation: `repoPath` must be an absolute path that exists on disk, and must contain a `.git` directory (basic sanity check — no Supabase lookup needed since the agent runs locally)
- Creates `<repoPath>/.claude/agents/` directory if needed
- Writes `<filename>.md`
- Returns `{ ok: true, path: string }`

### Frontend changes

**Refactored `AgentBuilderDialog`:**
- Remove: 4-step wizard, `BuilderState`, `TASK_TYPES`, `TECH_STACKS`, `CONVENTIONS`, `OUTPUT_FORMATS`, `TONES` constants, cases 0-2 of `renderStep()`
- Keep: streaming SSE logic (with `content_block_delta` fix), iteration system (feedback → refine), i18n namespace `agentBuilder`
- Add: repo selector step, split view step, frontmatter parsing (split on `---`)

**Re-enable agent creation:**
- `AgentsList`: revert "Create" buttons from snackbar warning back to `setBuilderOpen(true)`
- `Sidebar`: remove `disabled: true` from agents menu item

### What we don't change

- No new Supabase table
- No changes to existing hooks
- The `/agent-builder` route handler structure stays the same (only system prompt changes)
- `AgentEditorDialog` for editing existing agents remains untouched
- `useAgentFiles` hook continues to work for listing/deleting agents in custom paths

### Edge cases & error handling

**File conflicts:** If a file with the same name already exists, prompt the user with a confirmation dialog before overwriting.

**Generation failure:** If the SSE stream errors mid-generation (network, CLI crash), show an inline error message with a "Retry" button. The textarea remains enabled so the user can adjust their description.

**Malformed frontmatter:** If the user edits the left pane and breaks the YAML frontmatter, the preview pane shows a subtle inline warning ("Invalid frontmatter") and renders the body as raw markdown. Save remains possible (the file is still valid text).

**Filename sanitization:** The `name` field from frontmatter is slugified at save time (lowercase, spaces → hyphens, strip special chars). Example: `name: My Cool Agent` → `my-cool-agent.md`.

**Write permission errors:** If the PUT route fails (permissions, missing path), return `{ ok: false, error: string }` and the frontend shows a snackbar with the error message.

**Streaming protocol:** The `/agent-builder` route uses Claude CLI `stream-json` format. Incremental text arrives via `content_block_delta` events (JSON lines with `type: "content_block_delta"` and `delta.text`), already handled by the recent fix to the route.

**Refine iteration:** The "Refine" action in step 3 sends the **full generated file content** (from the left editor pane) as `currentPrompt` + the user's feedback text as `feedback` to `/agent-builder`. This is the same pattern as the current iteration system.

**Cancel mid-generation:** Closing the dialog aborts the SSE stream via `AbortController` (existing behavior). No unsaved state warning — the user can always re-generate.

**Dialog mount point:** `AgentBuilderDialog` stays mounted inside `AgentsList` (same as current). `useRepoPaths` is called inside the dialog itself.

### i18n

Update the `agentBuilder` namespace in all 5 locales (en, fr, es, de, pt). New keys needed for:
- Step labels: "Choose repo", "Describe", "Review & Save"
- Placeholders: describe textarea, refine input
- Buttons: "Generate", "Refine", "Save agent"
- Error/empty states: no repos, generation failed, invalid frontmatter
- Overwrite confirmation dialog

### Agent file format produced

```markdown
---
name: code-reviewer
description: Expert code reviewer for React/TypeScript projects. Use after code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer specialized in React 19 and TypeScript 5.

## Workflow
1. Run git diff to identify changed files
2. Review each file for quality, security, and maintainability
3. Report issues by priority (critical, warning, suggestion)

## Rules
- Focus on logic errors and security issues first
- Suggest concrete fixes, not vague advice
- Keep feedback concise and actionable
```
