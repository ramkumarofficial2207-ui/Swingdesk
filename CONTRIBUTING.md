# Working on SwingDesk

SwingDesk is run like a small company codebase: nothing reaches `main` without a pull request, a green CI run and a review.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Always working. Protected: no direct pushes, no force pushes. |
| `feature/<short-name>` | New capability, e.g. `feature/v4-forward-test-log` |
| `fix/<short-name>` | Bug fix, e.g. `fix/v4-distribution-rule` |
| `strategy/<name>-v<N>` | A new strategy version, e.g. `strategy/presurge-v5` |
| `chore/<short-name>` | Tooling, dependencies, docs |

One branch per task. Keep it short-lived: open the PR within a few days.

## Daily flow

```sh
git switch main
git pull
git switch -c feature/my-change
# work, commit in small steps
npm test
npx tsc --noEmit
git push -u origin feature/my-change
gh pr create --fill
```

After CI passes and the PR is reviewed, **squash-merge** it. The branch is deleted automatically.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
fix(presurge-v4): allow at most one distribution day
feat(report): add drawdown to setup validation report
chore(deps): bump prisma to 5.22
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `strategy`.

## Definition of done

- Tests added or updated for the change; `npm test` and `npx tsc --noEmit` pass.
- Behaviour checked in the running app when it affects what the user sees.
- Docs updated when behaviour or setup changes (`SWINGDESK.md`, this file).

## Strategy rules (non-negotiable)

These exist because earlier versions looked good on the data they were built from and failed on later dates.

1. **A frozen strategy version is never edited.** Changing a rule or threshold means a new version (`PRE_SURGE_V5`) on a `strategy/` branch.
2. **Declare the evaluation before running it.** Write the pass criteria (minimum trades, net expectancy, maximum drawdown) in the PR description first.
3. **Never tune against the validation period.** Development dates and validation dates are fixed and stated in the report.
4. **Report the sample size.** Under 30 priced outcomes is labelled insufficient evidence.
5. **No live order placement** is enabled by a PR unless it is the sole purpose of that PR and the forward test has passed.

## Secrets and data

- Never commit `.env`, tokens, broker credentials or database files. Use `.env.example` for new variables.
- Market data, backtest outputs and research inputs stay out of git (see `.gitignore`).
- If a secret is committed by mistake, rotate it immediately; deleting the commit is not enough.

## Releases

Tag `main` when deploying: `git tag v2.1.0 && git push --tags`. Use semantic versioning.
