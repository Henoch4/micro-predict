const { ethers, network } = require(`hardhat`);

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Seeding with:`, signer.address);
  console.log(`Network:`, network.name, `chainId:`, network.config.chainId);

  const PRED = `0x68DDf240099D16aFd68982b2E78E348565cAAB46`;
  const pred = await ethers.getContractAt(`MicroPredict`, PRED);

  const owner = await pred.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the contract owner ${owner}`);
  }

  const currentCount = await pred.marketCount();
  console.log(`Existing markets:`, currentCount.toString());

  const markets = [
    { durationSecs: 3600,    feeBps: 50,  q: `Does $BOPE close above $0.002 in 1h?` },
    { durationSecs: 7200,    feeBps: 100, q: `Does BOT 2h volume cross $10k?` },
    { durationSecs: 14400,   feeBps: 100, q: `Does $HIRO hold >$10k liquidity for 4h?` },
    { durationSecs: 28800,   feeBps: 150, q: `Does BOPE outperform HIRO over 8h?` },
    { durationSecs: 43200,   feeBps: 100, q: `Does BOT close green in 12h?` },
    { durationSecs: 86400,   feeBps: 100, q: `Does $BOPE survive 24h above $0.001?` },
    { durationSecs: 86400,   feeBps: 200, q: `Does HIRO 24h volume cross $50k?` },
    { durationSecs: 172800,  feeBps: 100, q: `Does BOPE outperform BOT over 2d?` },
    { durationSecs: 172800,  feeBps: 250, q: `Does $HIRO stay above $0.005 for 2d?` },
    { durationSecs: 259200,  feeBps: 100, q: `Does BOT 3d volume cross $100k?` },
    { durationSecs: 432000,  feeBps: 150, q: `Does BOPE hold $25k liquidity for 5d?` },
    { durationSecs: 604800,  feeBps: 100, q: `Does $HIRO survive the week above $0.004?` },
    { durationSecs: 604800,  feeBps: 300, q: `Does BOPE 7d volume cross $250k?` },
    { durationSecs: 1209600, feeBps: 100, q: `Does HIRO hold $15k liquidity for 14d?` },
    { durationSecs: 2592000, feeBps: 200, q: `Does BOPE survive 30d above $0.001?` },
  ];

  const FEE = ethers.parseEther(`0.005`);
  const NORULE = [0, ethers.ZeroAddress, 0, 0];
  for (const m of markets) {
    console.log(`Creating market: ${m.q} ...`);
    const tx = await pred.createMarket(m.durationSecs, m.feeBps, m.q, NORULE, ethers.ZeroAddress, { value: FEE });
    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === `MarketCreated`);
    const id = event ? event.args[0].toString() : `?`;
    console.log(`  Market #${id} created — tx ${receipt.hash}`);
  }

  const finalCount = await pred.marketCount();
  console.log(`\nDone. Total markets on-chain: ${finalCount.toString()}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
