const { ethers, network } = require(`hardhat`);
async function main() {
  const [signer] = await ethers.getSigners();
  const pred = await ethers.getContractAt(`MicroPredict`, `0x68DDf240099D16aFd68982b2E78E348565cAAB46`);
  console.log(`have:`, (await pred.marketCount()).toString());
  const FEE = ethers.parseEther(`0.005`);
  const NORULE = [0, ethers.ZeroAddress, 0, 0];
  const extra = [
    { durationSecs: 604800, feeBps: 300, q: `Does BOPE 7d volume cross $250k?` },
    { durationSecs: 1209600, feeBps: 100, q: `Does HIRO hold $15k liquidity for 14d?` },
    { durationSecs: 2592000, feeBps: 200, q: `Does BOPE survive 30d above $0.001?` },
  ];
  for (const m of extra) {
    console.log(`Creating market: ${m.q} ...`);
    console.log((await (await pred.createMarket(m.durationSecs, m.feeBps, m.q, NORULE, ethers.ZeroAddress, { value: FEE })).wait()).hash);
  }
  console.log(`total:`, (await pred.marketCount()).toString());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
