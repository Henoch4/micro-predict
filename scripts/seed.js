const { ethers, network } = require(`hardhat`);

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Seeding with:`, signer.address);
  console.log(`Network:`, network.name, `chainId:`, network.config.chainId);

  const PRED = `0xb71588BE36603e48F114F97b07c42602f50144f0`;
  const pred = await ethers.getContractAt(`MicroPredict`, PRED);

  const owner = await pred.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the contract owner ${owner}`);
  }

  const currentCount = await pred.marketCount();
  console.log(`Existing markets:`, currentCount.toString());

  const markets = [
    { durationSecs: 3600,    feeBps: 50,  label: `1-hour, 0.5% fee` },
    { durationSecs: 7200,    feeBps: 100, label: `2-hour, 1% fee` },
    { durationSecs: 14400,   feeBps: 100, label: `4-hour, 1% fee` },
    { durationSecs: 28800,   feeBps: 150, label: `8-hour, 1.5% fee` },
    { durationSecs: 43200,   feeBps: 100, label: `12-hour, 1% fee` },
    { durationSecs: 86400,   feeBps: 100, label: `24-hour, 1% fee` },
    { durationSecs: 86400,   feeBps: 200, label: `24-hour, 2% fee` },
    { durationSecs: 172800,  feeBps: 100, label: `2-day, 1% fee` },
    { durationSecs: 172800,  feeBps: 250, label: `2-day, 2.5% fee` },
    { durationSecs: 259200,  feeBps: 100, label: `3-day, 1% fee` },
    { durationSecs: 432000,  feeBps: 150, label: `5-day, 1.5% fee` },
    { durationSecs: 604800,  feeBps: 100, label: `7-day, 1% fee` },
    { durationSecs: 604800,  feeBps: 300, label: `7-day, 3% fee` },
    { durationSecs: 1209600, feeBps: 100, label: `14-day, 1% fee` },
    { durationSecs: 2592000, feeBps: 200, label: `30-day, 2% fee` },
  ];

  for (const m of markets) {
    console.log(`Creating market: ${m.label} ...`);
    const tx = await pred.createMarket(m.durationSecs, m.feeBps);
    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === `MarketCreated`);
    const id = event ? event.args[0].toString() : `?`;
    console.log(`  Market #${id} created — tx ${receipt.hash}`);
  }

  const finalCount = await pred.marketCount();
  console.log(`\nDone. Total markets on-chain: ${finalCount.toString()}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
