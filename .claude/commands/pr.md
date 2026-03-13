---
description: Commit, push et créer une PR en une seule commande
allowed-tools: Bash, Read, Glob, Grep
---

Tu dois effectuer les étapes suivantes dans l'ordre. Arrête-toi si une étape échoue.

## 1. Analyser les changements

- Lance `git status` (jamais `-uall`) et `git diff --staged` et `git diff` pour comprendre les changements
- Lance `git log --oneline -5` pour voir le style des commits récents
- Lance `git rev-parse --abbrev-ref HEAD` pour récupérer la branche courante
- Lance `git log --oneline main..HEAD` pour voir tous les commits de la branche

## 2. Stager les fichiers

- Stage les fichiers modifiés pertinents avec `git add` (fichiers spécifiques, jamais `git add .` ou `git add -A`)
- Ne jamais stager de fichiers sensibles (.env, credentials, secrets)
- Si aucun changement n'est détecté, informe l'utilisateur et arrête

## 3. Commit avec message Karma

Le message de commit DOIT suivre la convention Karma :

```
<type>(<scope>): <description courte>

<corps optionnel>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Types autorisés :** `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `perf`

**Scope :** le module/composant principal touché (ex: `agents`, `issues`, `dashboard`, `api`, `layout`)

**Exemples :**
- `feat(agents): add terminal resize support`
- `fix(issues): correct checkbox toggle in markdown`
- `refactor(layout): simplify sidebar state management`

Utilise un HEREDOC pour le message :
```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## 4. Push

- Push la branche avec `git push -u origin <branch>`
- Si le push échoue, informe l'utilisateur

## 5. Créer la PR

- Utilise `gh pr create` avec le format suivant :

```bash
gh pr create --title "<type>(<scope>): <description courte>" --body "$(cat <<'EOF'
## Summary
- <bullet points décrivant les changements>

## Test plan
- [ ] <checklist de tests>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- Le titre de la PR doit reprendre le message de commit (karma style)
- Le body doit résumer TOUS les commits de la branche (pas juste le dernier)
- Si une PR existe déjà pour cette branche, informe l'utilisateur au lieu d'en créer une nouvelle

## 6. Résultat

- Affiche l'URL de la PR créée
- Résume ce qui a été fait (fichiers commités, message, PR)
