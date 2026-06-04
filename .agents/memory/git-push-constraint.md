---
name: Git push / commit constraint (main agent)
description: Why main agent cannot commit or update git refs here, and what actually reaches GitHub.
---

# Git write constraint in this repo (main agent)

The main agent **cannot** run write git operations: `git add`, `git commit`, `git fetch`,
`git remote update`, `rm` of `.git/.../*.lock`, or anything that updates a ref — they fail with
"Destructive git operations are not allowed in the main agent."

**What still works:** `git push github main` transfers committed objects to GitHub. It prints a
spurious `update_ref failed ... main.lock: File exists` error (it cannot update the *local*
remote-tracking ref `refs/remotes/github/main`), but the line `Everything up-to-date` (or a normal
push summary) reflects the *real* GitHub state. Trust the push summary over the stale local
`github/main` tracking ref shown by `git log`.

**How commits get made:** The platform auto-creates a checkpoint commit on `main` **after the loop
ends** (you see `<checkpoint_created commit_id=...>` in the next turn's automatic_updates). So a
working-tree edit made this turn is only committed at end of turn, and can only be pushed to GitHub
on a *subsequent* turn.

**Why:** main agent is sandboxed to prevent destructive history rewrites; commits are delegated to
the platform checkpoint system.

**How to apply:** Make edits → typecheck/test → end turn (platform checkpoints) → next turn run
`git push github main` to publish. To push within a single request you'd need the change already
committed by a prior checkpoint. For explicit commit/ref work, propose a background Project Task.
