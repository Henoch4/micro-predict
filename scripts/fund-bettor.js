const { ethers, network } = require(`hardhat`);
async function main() {
  const [deployer] = await ethers.getSigners();
  const to = `0x56912EeFF53149404E3973E09F26cdbd8eB65D0a`;
  const dbal = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer:`, deployer.address, ethers.formatEther(dbal), `BOT`);
  const amt = ethers.parseEther(`2`);
  if (dbal < amt) throw new Error(`deployer short`);
  const tx = await deployer.sendTransaction({ to, value: amt });
  console.log(`sent 2 BOT:`, tx.hash);
  await tx.wait();
  console.log(`new bal:`, ethers.formatEther(await ethers.provider.getBalance(to)), `BOT`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
