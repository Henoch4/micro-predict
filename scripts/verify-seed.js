const { ethers, network } = require(`hardhat`);

async function main() {
  const pred = await ethers.getContractAt(`MicroPredict`, `0x839163E7d05531a1B1BEa5ac7352AA4cF2139764`);
  const n = await pred.marketCount();
  console.log(`marketCount:`, n.toString());
  for (let i = 1; i <= n; i++) {
    const m = await pred.markets(i);
    const end = new Date(Number(m.endTime) * 1000).toISOString();
    console.log(`Market #${i} — end: ${end}, fee: ${m.feeBps}bps, resolved: ${m.resolved}, voided: ${m.voided}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
