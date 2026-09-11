// Keeper: watches on-chain Rules, proposes/finalizes. No API, no DB.
// Reads marketRule(id) + reference data over RPC, sends txs with resolver key.
// Default: dry-run report. Pass --exec to send.
const { ethers, network } = require(`hardhat`);

const PAIR_ABI = [`function getReserves() view returns (uint112 r0, uint112 r1, uint32 ts)`];

async function main() {
  const EXEC = process.argv.includes(`--exec`);
  const PRED = process.env.PRED || `0xc790D56538D0eF2F38c48DB3c7F9fD77A488f01a`;
  const [signer] = await ethers.getSigners();
  console.log(`keeper as:`, signer.address, `exec:`, EXEC, `net:`, network.name);
  const pred = await ethers.getContractAt(`MicroPredict`, PRED);
  const globalResolver = await pred.resolver();
  console.log(`global resolver:`, globalResolver, `| me:`, signer.address);

  const n = Number(await pred.marketCount());
  console.log(`markets:`, n);
  if (n === 0) return;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const ms = await pred.getMarkets(ids);
  const now = Math.floor(Date.now() / 1000);

  const report = { propose: [], finalize: [], disputed: [], manual: [], ok: [] };
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const m = ms[i];
    if (m.endTime === 0n || m.resolved) continue;
    const [exists, isDisputed] = await Promise.all([
      pred.proposalExists(id), pred.disputed(id),
    ]);
    if (exists && isDisputed) { report.disputed.push(id); continue; }
    if (exists) {
      const pt = Number(await pred.proposalTime(id));
      const window = Number(await pred.DISPUTE_WINDOW());
      if (now >= pt + window) report.finalize.push(id);
      continue;
    }
    if (now < Number(m.endTime)) { report.ok.push(id); continue; }
    // ended, no proposal: read on-chain rule
    const rule = await pred.marketRule(id);
    const mr = await pred.marketResolver(id);
    const mine = mr.toLowerCase() === signer.address.toLowerCase();
    if (rule.kind === 0n || rule.kind === 0) {
      report.manual.push({ id, why: `kind=manual`, resolver: mr, mine });
      continue;
    }
    // kind 1: liquidity-above on ref pair reserves sum
    try {
      const pair = new ethers.Contract(rule.ref, PAIR_ABI, ethers.provider);
      const [r0, r1] = await pair.getReserves();
      const liq = BigInt(r0) + BigInt(r1);
      const winner = liq >= rule.threshold ? 0 : 1; // A = holds threshold
      report.propose.push({ id, kind: `liq`, liq: liq.toString(), th: rule.threshold.toString(), winner, resolver: mr, mine });
    } catch (e) {
      report.manual.push({ id, why: `pair read failed: ` + (e.shortMessage || e.message), resolver: mr, mine });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!EXEC) { console.log(`dry-run. re-run with --exec to send.`); return; }
  for (const p of report.propose) {
    if (!p.mine) { console.log(`skip propose #${p.id}: not my resolver key`); continue; }
    console.log(`proposing #${p.id} winner ${p.winner} (liq ${p.liq} vs ${p.th})`);
    console.log((await (await pred.proposeResolution(p.id, p.winner)).wait()).hash);
  }
  for (const id of report.finalize) {
    console.log(`finalizing #${id}`);
    console.log((await (await pred.finalizeResolution(id)).wait()).hash);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
