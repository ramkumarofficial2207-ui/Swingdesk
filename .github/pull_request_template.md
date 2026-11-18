## What changed

<!-- One or two sentences. Link the issue: Closes #… -->

## Why

## How it was verified

- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` passes
- [ ] Frontend builds (`npm --prefix apex-intelligence run build`) if UI changed
- [ ] Checked in the running app (describe what you looked at)

## Strategy changes (skip if none)

- [ ] Rule or threshold changes are listed with old → new values
- [ ] The strategy version was bumped (no silent edits to a frozen version)
- [ ] Not tuned against the validation/holdout period
- [ ] Backtest report regenerated and linked; sample size stated

## Risk

- [ ] No secrets, tokens, `.env` or database files added
- [ ] No live order placement enabled
