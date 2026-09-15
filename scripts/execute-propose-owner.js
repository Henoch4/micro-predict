// Execute MicroPredict proposeOwner(Safe) on mainnet
// Run: npx hardhat run scripts/execute-propose-owner.js --network botMainnet
const { ethers } = require('hardhat');

async function main() {
  const PREDICT = '0x3cb5faCA74f5F0211a1f1a773Ed45B042bDD50C5';
  const SAFE = '0x3f6599D5694044Ac0B357695843391220a5aE0c3';

  const [deployer] = await ethers.getSigners();
  const predict = await ethers.getContractAt('MicroPredict', PREDICT);

  const owner = await predict.owner();
  console.log('Current owner:', owner);
  console.log('Deployer:', deployer.address);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error('Deployer is not the owner');
  }

  const tx = await predict.proposeOwner(SAFE);
  console.log('Tx sent:', tx.hash);

  const rc = await tx.wait();
  console.log('Mined block:', rc.blockNumber);

  const pending = await predict.pendingOwner();
  const at = await predict.pendingOwnerAt();
  console.log('Pending owner:', pending);
  console.log('Pending at:', at.toString());
  console.log('Accept after:', new Date((Number(at) + 172800) * 1000).toISOString());
}

main().catch(e => { console.error(e); process.exit(1); });