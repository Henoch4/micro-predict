const { ethers } = require(`hardhat`);
async function main() {
  const pred = await ethers.getContractAt(`MicroPredict`, `0xf9E816eCA32d5a086b9D64480832f3aa4BA25A7a`);
  const tx = await pred.createMarket(86400, 100, "Demo: Does $BOPE close above $0.002 tomorrow?");
  const rc = await tx.wait();
  console.log(`created tx ${rc.hash}`);
  console.log(`marketCount: ${(await pred.marketCount()).toString()}`);
  console.log(`question #16: ${await pred.marketQuestion(16)}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
