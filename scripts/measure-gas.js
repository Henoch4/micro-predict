const { ethers } = require(`hardhat`);
const GAS_PRICE = 20_000_000_000n; // mainnet eth_gasPrice snapshot
async function main(){
  const f = await ethers.getContractFactory(`MicroPredict`);
  const c = await f.deploy();
  const rc = await c.deploymentTransaction().wait();
  const gas = BigInt(rc.gasUsed);
  const cost = gas * GAS_PRICE;
  console.log(JSON.stringify({contract:`MicroPredict`, gasUsed:gas.toString(), botCost:ethers.formatEther(cost), gwei:20n.toString()}));
}
main().catch((e)=>{ console.error(e); process.exitCode = 1; });