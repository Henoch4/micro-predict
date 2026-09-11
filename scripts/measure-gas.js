const { ethers } = require(`hardhat`);
async function main(){
  const provider = ethers.provider;
  const gasPrice = await provider.getFeeData().then(d => d.gasPrice);
  const f = await ethers.getContractFactory(`MicroPredict`);
  const c = await f.deploy();
  const rc = await c.deploymentTransaction().wait();
  const gas = BigInt(rc.gasUsed);
  const cost = gas * gasPrice;
  console.log(JSON.stringify({contract:`MicroPredict`, gasUsed:gas.toString(), botCost:ethers.formatEther(cost), gasPriceGwei:ethers.formatUnits(gasPrice, `gwei`)}));
}
main().catch((e)=>{ console.error(e); process.exitCode = 1; });