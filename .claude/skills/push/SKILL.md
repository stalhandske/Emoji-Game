---
name: push
description: Commit all changes and push to both the feature branch and main
disable-model-invocation: true
argument-hint: "[commit message]"
---

Commit and push all current changes to both branches.

1. Run `git status` and `git diff` to review what changed
2. Stage relevant files (never stage .env or secrets)
3. Commit with the message: $ARGUMENTS (if provided), otherwise write a descriptive message summarising the changes. Always append the session URL:
   https://claude.ai/code/session_01U3YBu58gpoP1vPG93WkYr3
4. Push to the feature branch:
   `git push -u origin claude/desert-golf-prototype-olqy6`
5. Push to main:
   `git push origin HEAD:main`

Report success or any errors.
