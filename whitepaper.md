# MicroPredict — Whitepaper

**An on-chain micro prediction market for BOT Chain memecoins — place a stake, watch the odds, collect the settle.**

Version 1 · Testnet 968 · September 2026

---

## Abstract

MicroPredict is an on-chain prediction market that lets anyone list a binary event, take either side of it, and get paid out by the pool without trusting an intermediary, a price feed, or a bookmaker's word. Markets take deposits in native BOT (v1; ERC-20 support is roadmap, not yet live), split into two branch pools (A / B), publish fee-honest odds computed live from actual pool sizes, resolve to a winner via resolver proposal + 1h dispute window, and settle automatically. Zero-volume markets and too-small winning pools are voided under a pre-committed threshold the admin cannot silently change per-market after money is in.

It is built for the memecoin beats on BOT Chain: "does BOPE survive the week", "does HIRO clear a liquidity threshold by Friday". Small stakes, fast clocks, honest math.

## The problem: prediction markets are either slow or untrustworthy

Prediction platforms usually fail one of three ways:

- **Oracle opacity.** Resolutions come from a black-box data source nobody can inspect, and disputes settle arbitrarily.
- **Fee opacity.** Odds shown to the bettor are net of fees nobody can verify — the house takes as much as the market will bear at settlement time.
- **Late-rule surprises.** Void conditions, minimum-pool cliffs, and fee formulas get invented after money is already committed.

On a blockchain, none of those need to be trust-based.

## Mechanics

### Markets

Any owner action creates a market with a fixed clock:

- **Duration** — set in hours; the market closes when it expires.
- **Fee (bps)** — a single, visible fee applied at settlement, capped well below abuse.
- **Increments** — bets are staked in native BOT (min 0.001 BOT).

### Two pools, live odds

Every market carries two pools, **Side A** and **Side B**. Money flows to one branch and stays there until settlement.

Bettors see:

- **Fee** — the exact deduction per side, computed honestly from the pool.
- **Payout if win** — what that side returns on top of the stake.
- **Net** — the honest profit-or-loss after fees.

The forecast is **fee-honest**: fee = pool * feeBps / 10000 is taken from the whole pool (winners + losers) before pro-rata distribution — payout = mine * (pool - fee) / winningTotal. Winners share the fee pro-rata out of their winnings; there is no hidden spread — the numbers on the receipt are the numbers the contract settles.

### Resolution & void

- **Resolve** — the resolver proposes a winner; 1h dispute window (0.01 BOT bond); anyone can finalize if undisputed, admin overrides if disputed. Winning side collects pro-rata from pool minus fee.
- **Void** — a market with zero(ish) volume, or a winning pool below the set minimum threshold, is voided and stakes are returned. The threshold is **pre-committed on-chain** before betting closes — the owner cannot tighten it to force a void after losing.

### Fee withdrawal

Accrued fees sit in the market until it is fully claimed, then the owner withdraws them. No fee escapes the contract, and no fee is taken before resolution.

## Architecture

| Layer | Piece |
|---|---|
| Market ledger | Every market: duration, fee, A/B pools, state (open → resolved/voided). |
| Forecast engine | On-chain read of pool sizes → fee, payout, net for both sides. |
| Back office | Owner-only: create market, resolve, set void threshold, withdraw fees. |
| Tickets | Every bet is a held ticket with its own slice of the pool. |

### Betting flow

```
admin: createMarket(duration, feeBps, question)
bet:   bet(market, side) {value}           ── native BOT only v1
board: getMarkets(ids) batch read ──► fee / payout / net forecast
close: market expires
resolver: proposeResolution(market, winner) ── starts 1h window
anyone: dispute(market){bond} / finalizeResolution(market)
settle: winners withdraw pro-rata from (pool - fee)
admin: withdrawFees(market)                ── after full claim or 30d timeout; sweepUnclaimed after 180d
```

## Security & fairness model

- **Fee-honest math.** Odds are derived from actual committed pools; the receipt is the settlement.
- **Pre-committed void threshold.** The minimum winning pool is set before the market is meaningfully funded, and read back as "current" from the contract — not from memory.
- **No credit.** Everything is on-chain; no intermediary holds stakes between bet and settle.
- **Reentrancy-safe settlement.** Claim and fee tracks settle cleanly, one market at a time.

## Roadmap

| Item | Status |
|---|---|
| Markets, A/B pools, fee-honest forecast, tickets | Shipped (testnet 968) |
| Void thresholds pre-committed per market | Shipped |
| Fee withdrawal per market | Shipped |
| Responsive odds board (mobile bets) | Shipped |
| Resolution oracles / dispute window | Next |
| Leaderboards & points for long-running markets | Parked |
| Base rails (mirror of BOT Chain) | Parked |

## No token

MicroPredict needs no governance token to work — the fee is the product, and the markets are the reward. Points-style participation reward is a roadmap item, not a requirement.

## Disclaimer

This document describes a prediction market on BOT Chain testnet (968). Markets are binary games with real stakes and real loss risk; past outcomes do not predict future ones. Nothing here is financial advice, and markets with small liquidity may be voided under their pre-committed thresholds. Bet only what you can afford to lose.