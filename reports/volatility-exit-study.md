# Volatility-scaled exit study

Generated: 2026-11-18T20:15:33.717Z

Pre-registered plan: [`volatility-exit-study-plan.md`](volatility-exit-study-plan.md) (committed before this run). Same universe, conditions, costs and conservative ordering as the [5% study](five-percent-study.md); stops are sized to each stock's ATR and the target is 2× the stop.

Discovery 2021-01-05 → 2023-12-29; test 2024-01-01 onward. All trade counts are non-overlapping (one open trade per stock). R = net result ÷ stop distance; a 2:1 design needs the target first on roughly 35–38% of trades to break even after costs.

## Verdict: **FAIL**

Primary candidate (best discovery result): **Design D** — Breakout above signal high · stop 1.5×ATR · target 2× · 15 sessions, with **Daily range (ATR) below 1.5% + Volume dry-up (10-day < 0.8× 50-day)**.

| Pre-registered rule | Result | Pass |
|---|---:|:---:|
| At least 100 test trades | 274 | ✅ |
| Average net R above 0 | -0.425R | ❌ |
| Lower end of 95% range above 0 | -0.578R | ❌ |
| Positive in at least 2 of 3 test years | 0 of 3 | ❌ |

Per plan: no candidate setup from this design family. Do not re-tune these designs on the test period.

## All designs

Only the primary candidate decides the verdict; the others are shown for transparency.

| Design | Selected conditions (discovery) | Period | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---|---|---:|---:|---:|---:|---:|
| A: Next open · stop 1.0×ATR · target 2× · 10 sessions | — (every stock-day) | Discovery | 60,880 | 28.1% | 55.1% | 16.8% | -0.053R ± 0.011 |
| | | Test | 57,883 | 25.8% | 59.5% | 14.7% | -0.160R ± 0.011 |
| | Daily range (ATR) below 1.5% + Beat NIFTY over 3 months + Tight 15-day base (range < 10%) | Discovery | 345 | 40.6% | 50.4% | 9.0% | +0.049R ± 0.157 |
| | | **Test** | **298 | 26.8% | 66.1% | 7.0% | -0.369R ± 0.159** |
| | | Test excl. unexplained jumps | 298 | 26.8% | 66.1% | 7.0% | -0.369R ± 0.159 |
| B: Next open · stop 1.5×ATR · target 2× · 15 sessions | — (every stock-day) | Discovery | 37,987 | 25.2% | 47.9% | 26.9% | +0.038R ± 0.013 |
| | | Test | 36,076 | 22.2% | 53.7% | 24.1% | -0.110R ± 0.013 |
| | Daily range (ATR) below 1.5% + Market green: NIFTY > 50 > 200-day | Discovery | 440 | 41.4% | 46.8% | 11.8% | +0.214R ± 0.136 |
| | | **Test** | **420 | 24.8% | 61.2% | 14.0% | -0.269R ± 0.132** |
| | | Test excl. unexplained jumps | 420 | 24.8% | 61.2% | 14.0% | -0.269R ± 0.132 |
| C: Next open · stop 1.5×ATR · target 2× · 20 sessions | — (every stock-day) | Discovery | 34,076 | 29.7% | 51.8% | 18.5% | +0.060R ± 0.015 |
| | | Test | 32,256 | 24.8% | 58.6% | 16.5% | -0.128R ± 0.015 |
| | Daily range (ATR) below 1.5% + Market green: NIFTY > 50 > 200-day | Discovery | 430 | 44.2% | 50.5% | 5.3% | +0.212R ± 0.141 |
| | | **Test** | **403 | 28.3% | 65.8% | 6.0% | -0.288R ± 0.141** |
| | | Test excl. unexplained jumps | 403 | 28.3% | 65.8% | 6.0% | -0.288R ± 0.141 |
| D: Breakout above signal high · stop 1.5×ATR · target 2× · 15 sessions | — (every stock-day) | Discovery | 32,671 | 24.7% | 47.2% | 28.1% | +0.037R ± 0.014 |
| | | Test | 30,707 | 21.2% | 53.6% | 25.2% | -0.126R ± 0.014 |
| | Daily range (ATR) below 1.5% + Volume dry-up (10-day < 0.8× 50-day) | Discovery | 301 | 42.5% | 47.5% | 10.0% | +0.224R ± 0.166 |
| | | **Test** | **274 | 22.3% | 68.6% | 9.1% | -0.425R ± 0.153** |
| | | Test excl. unexplained jumps | 274 | 22.3% | 68.6% | 9.1% | -0.425R ± 0.153 |

## Primary candidate by year (Design D)

| Year | Trades | Target first | Stop first | Expired | Avg net R (95% range) |
|---|---:|---:|---:|---:|---:|
| 2021 | 59 | 30.5% | 54.2% | 15.3% | -0.059R ± 0.361 |
| 2022 | 45 | 31.1% | 66.7% | 2.2% | -0.220R ± 0.414 |
| 2023 | 199 | 48.7% | 40.7% | 10.6% | +0.419R ± 0.204 |
| 2024 (test) | 45 | 24.4% | 64.4% | 11.1% | -0.360R ± 0.396 |
| 2025 (test) | 160 | 24.4% | 64.4% | 11.3% | -0.318R ± 0.205 |
| 2026 (test) | 92 | 19.6% | 78.3% | 2.2% | -0.608R ± 0.250 |

## Each condition on its own, Design D (non-overlapping)

| Condition | Discovery trades | Discovery target first | Discovery avg R | Test trades | Test target first | Test avg R |
|---|---:|---:|---:|---:|---:|---:|
| Daily range (ATR) below 1.5% | 545 | 39.8% | +0.148R | 468 | 23.9% | -0.341R |
| Daily range (ATR) 1.5–3.5% | 17,465 | 27.5% | +0.037R | 17,231 | 21.2% | -0.202R |
| Daily range (ATR) above 3.5% | 18,744 | 22.2% | +0.040R | 16,622 | 20.8% | -0.054R |
| Trend stack: close > 20 > 50 > 200-day average | 13,925 | 26.6% | +0.046R | 9,983 | 22.4% | -0.104R |
| Beat NIFTY over 3 months | 21,479 | 25.1% | +0.049R | 18,887 | 21.0% | -0.120R |
| Beat NIFTY by 10%+ over 3 months | 14,700 | 24.7% | +0.032R | 12,347 | 21.1% | -0.111R |
| Tight 15-day base (range < 10%) | 9,188 | 30.4% | +0.080R | 8,809 | 22.9% | -0.204R |
| Within 5% of 52-week high | 8,949 | 28.6% | +0.069R | 6,917 | 23.4% | -0.096R |
| Volume dry-up (10-day < 0.8× 50-day) | 15,304 | 24.7% | +0.030R | 14,441 | 20.6% | -0.168R |
| 20-day breakout on 1.5× volume | 6,314 | 26.7% | -0.048R | 4,484 | 22.1% | -0.176R |
| Close in top 25% of day range | 22,218 | 24.4% | +0.029R | 22,026 | 21.4% | -0.125R |
| Pullback to 20-day average in uptrend | 7,387 | 27.0% | +0.077R | 5,812 | 22.5% | -0.091R |
| Market green: NIFTY > 50 > 200-day | 20,307 | 25.6% | +0.024R | 15,261 | 20.1% | -0.176R |
| Breadth above 60% | 22,107 | 26.7% | +0.044R | 17,652 | 20.5% | -0.142R |
| Extended: up 10%+ in 5 days | 6,257 | 25.4% | -0.024R | 5,273 | 21.7% | -0.124R |

Universe: daily top 500 company shares by turnover. Research output, not investment advice.
