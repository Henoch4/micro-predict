const { ethers, network } = require(`hardhat`);

async function main() {
  const pred = await ethers.getContractAt(`MicroPredict`, `0xf9E816eCA32d5a086b9D64480832f3aa4BA25A7a`);
  const n = await pred.marketCount();
  console.log(`marketCount:`, n.toString());
  for (let i = 1; i <= n; i++) {
    const m = await pred.markets(i);
    const end = new Date(Number(m.endTime) * 1000).toISOString();
    console.log(`Market #${i} — end: ${end}, fee: ${m.feeBps}bps, resolved: ${m.resolved}, voided: ${m.voided}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
