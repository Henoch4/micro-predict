const { ethers, network } = require(`hardhat`);

async function main() {
  const pred = await ethers.getContractAt(`MicroPredict`, `0xc790D56538D0eF2F38c48DB3c7F9fD77A488f01a`);
  const n = await pred.marketCount();
  console.log(`marketCount:`, n.toString());
  for (let i = 1; i <= n; i++) {
    const m = await pred.markets(i);
    const end = new Date(Number(m.endTime) * 1000).toISOString();
    console.log(`Market #${i} — end: ${end}, fee: ${m.feeBps}bps, resolved: ${m.resolved}, voided: ${m.voided}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
