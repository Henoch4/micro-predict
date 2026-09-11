const { ethers } = require(`hardhat`);
const fs = require(`fs`);
const path = require(`path`);

// Points season v1: 1 pt per 0.01 BOT staked + 50% upset bonus for
// winning on the minority side (winnerTotal < loserTotal).
// Pure log indexing. No contract changes, no state reads except via events.
async function main() {
  const PRED = process.env.PRED || `0x68DDf240099D16aFd68982b2E78E348565cAAB46`;
  const RPC = `https://rpc.bohr.life`;
  const provider = new ethers.JsonRpcProvider(RPC);
  const abi = [
    `event MarketCreated(uint256 indexed id, uint64 endTime, uint256 feeBps, string question)`,
    `event BetPlaced(uint256 indexed id, address indexed user, uint8 outcome, uint256 amount)`,
    `event MarketResolved(uint256 indexed id, uint8 winner)`,
    `event MarketVoided(uint256 indexed id)`,
    `event Claimed(uint256 indexed id, address indexed user, uint256 payout)`,
  ];
  const c = new ethers.Contract(PRED, abi, provider);
  const fromBlock = 0;
  const [created, bets, resolved, voided, claimed] = await Promise.all([
    c.queryFilter(`MarketCreated`, fromBlock),
    c.queryFilter(`BetPlaced`, fromBlock),
    c.queryFilter(`MarketResolved`, fromBlock),
    c.queryFilter(`MarketVoided`, fromBlock),
    c.queryFilter(`Claimed`, fromBlock),
  ]);

  const markets = {};
  for (const e of created) {
    const id = Number(e.args.id);
    markets[id] = {
      id, question: e.args.question || ``, feeBps: Number(e.args.feeBps),
      total0: 0n, total1: 0n, winner: null, voided: false,
    };
  }
  for (const e of voided) {
    const id = Number(e.args.id);
    if (markets[id]) markets[id].voided = true;
  }
  for (const e of resolved) {
    const id = Number(e.args.id);
    if (markets[id]) markets[id].winner = Number(e.args.winner);
  }
  // stakes from logs (claims zero out on-chain stakes, logs preserve history)
  const stakes = {}; // id -> user -> [s0, s1]
  for (const e of bets) {
    const id = Number(e.args.id);
    const u = e.args.user.toLowerCase();
    const o = Number(e.args.outcome);
    const a = e.args.amount;
    if (!markets[id]) markets[id] = { id, question: ``, feeBps: 0, total0: 0n, total1: 0n, winner: null, voided: false };
    if (o === 0) markets[id].total0 += a; else markets[id].total1 += a;
    stakes[id] = stakes[id] || {};
    stakes[id][u] = stakes[id][u] || [0n, 0n];
    stakes[id][u][o] += a;
  }
  const claimedSum = {}; // user -> wei
  for (const e of claimed) {
    const u = e.args.user.toLowerCase();
    claimedSum[u] = (claimedSum[u] || 0n) + e.args.payout;
  }

  const players = {};
  const touch = (u) => (players[u] = players[u] || { address: u, volume: 0n, marketSet: new Set(), wins: 0, points: 0 });
  for (const e of bets) {
    const u = e.args.user.toLowerCase();
    const p = touch(u);
    p.volume += e.args.amount;
    p.marketSet.add(Number(e.args.id));
    p.points += Number(e.args.amount) / 1e16; // 0.01 BOT = 1e16 wei -> 1 pt
  }
  for (const idStr of Object.keys(markets)) {
    const m = markets[idStr];
    if (m.winner === null || m.voided) continue;
    const wt = m.winner === 0 ? m.total0 : m.total1;
    const lt = m.winner === 0 ? m.total1 : m.total0;
    const upset = wt < lt;
    const perMarket = stakes[m.id] || {};
    for (const u of Object.keys(perMarket)) {
      const s = perMarket[u][m.winner] || 0n;
      if (s > 0n) {
        const p = touch(u);
        p.wins += 1;
        if (upset) p.points += (Number(s) / 1e16) * 0.5;
      }
    }
  }

  const rows = Object.values(players).map((p) => {
    const vol = Number(p.volume) / 1e18;
    const cl = Number(claimedSum[p.address] || 0n) / 1e18;
    return {
      address: p.address,
      volumeBOT: Math.round(vol * 1e6) / 1e6,
      markets: p.marketSet.size,
      wins: p.wins,
      winRate: p.marketSet.size ? Math.round((p.wins / p.marketSet.size) * 1000) / 10 : 0,
      claimedBOT: Math.round(cl * 1e6) / 1e6,
      roiPct: vol > 0 ? Math.round(((cl - vol) / vol) * 1000) / 10 : 0,
      points: Math.round(p.points * 100) / 100,
    };
  }).sort((a, b) => b.points - a.points);

  const out = {
    updatedAt: new Date().toISOString(),
    chainId: 968,
    contract: PRED,
    season: { id: 1, rule: `1pt per 0.01 BOT + 50% minority-win bonus`, version: `v1` },
    marketCount: Object.keys(markets).length,
    players: rows,
  };
  const fp = path.join(__dirname, `..`, `frontend`, `leaderboard.json`);
  fs.writeFileSync(fp, JSON.stringify(out, null, 2));
  console.log(`wrote ${fp} — ${rows.length} players, ${out.marketCount} markets`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
