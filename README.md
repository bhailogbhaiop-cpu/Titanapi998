# DRAGON-X 120 Pattern API — v1.6.0

Node.js API for WinGo history analysis with separate 30-second and 1-minute historical-analysis profiles.

## Run locally

```bash
npm install
npm test
npm start
```

## Endpoints

- `GET /api/analyze?type=30S` — 30-second profile
- `GET /api/analyze?type=1M` — 1-minute profile
- `GET /api/patterns` — pattern catalog

## Interval-specific logic

- **30S:** uses a shorter 24-observation history window, 8-observation recent window, 30-round retrospective audit, and higher transition weighting. This reacts more to recent movement but is noisier.
- **1M:** uses a broader 60-observation history window, 20-observation recent window, 60-round retrospective audit, and lower transition weighting. This is more stable but less reactive.
- Responses include `intervalLogic.profile`, `profileConfig`, and `observationsUsed`; the audit includes its interval profile.

The profile settings are different by design, but neither approach can reliably predict independent/random outcomes. Historical hit/miss rates are retrospective diagnostics, not guaranteed future accuracy or real-world wins.


## Advanced interval-specific 120+ logic
- WinGo 30Sec and WinGo 1Min use separate strategy profiles.
- Both analyze up to 120 fetched historical observations when available.
- 30Sec emphasizes the latest 12 observations, short-horizon momentum, and transition weighting.
- 1Min emphasizes the latest 36 observations alongside smoothed long-window frequency.
- Each profile has its own walk-forward audit window and minimum-history threshold.
- Score diagnostics are heuristic scores, not calibrated probabilities or guaranteed forecasts.

Endpoints: `/api/analyze?type=30S` and `/api/analyze?type=1M`.


## v1.6.0 changes
- Separate score models for number, BIG/SMALL, and color.
- Separate 30S and 1M weight profiles; 30S reacts more to recent observations, while 1M smooths more heavily over the full sample.
- Responses include `numberLogic`, `sizeLogic`, and `colorLogic` diagnostics alongside legacy response fields.
- Score values are heuristic rankings, not calibrated probabilities. This API cannot guarantee future numbers or wins; use the audit as retrospective analysis only.


## Compact response (v2.1.0)

`GET /api/analyze?type=30S` or `?type=1M` returns the compact fields `success`, `game`, `engine`, `TargetPeriod`, `prediction`, `analysis`, `result`, and `history`. `history` is newest-first; entries remain `PENDING` until their target period appears in the fetched draw history, then become `JACKPOT` for an exact number match, `WIN` for a size or color match, or `LOSS` otherwise. Confidence values are normalized heuristic scores, not calibrated odds or guarantees.

The prediction ledger is held in process memory. For serverless deployments or reliable persistence across restarts/instances, replace the in-memory ledger with a database or shared key-value store. Past WinGo results may be random and do not reliably predict future outcomes.
