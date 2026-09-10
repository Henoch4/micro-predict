const { ethers, network } = require(`hardhat`);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with:`, deployer.address);
  console.log(`Network chainId:`, network.config.chainId);
  const expected = network.name === `botMainnet` ? 677 : network.name === `botTestnet` ? 968 : network.config.chainId;
  if (network.config.chainId !== expected) { throw new Error(`chain guard`); }
  const Predict = await ethers.getContractFactory(`MicroPredict`);
  const predict = await Predict.deploy();
  await predict.waitForDeployment();
  const addr = await predict.getAddress();
  console.log(`MicroPredict deployed to:`, addr);
  console.log(`Verify at: https://scan.botchain.ai/address/` + addr);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
