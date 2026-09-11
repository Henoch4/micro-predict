const { ethers, network } = require(`hardhat`);
async function main() {
  const PRED = `0xf9E816eCA32d5a086b9D64480832f3aa4BA25A7a`;
  const pred = await ethers.getContractAt(`MicroPredict`, PRED);
  const id = 13;
  const m = await pred.markets(id);
  console.log(JSON.stringify({
    network: network.name, chainId: network.config.chainId,
    id,
    endTime: m.endTime.toString(),
    endISO: new Date(Number(m.endTime) * 1000).toISOString(),
    now: Math.floor(Date.now() / 1000),
    resolved: m.resolved, voided: m.voided,
    total0: m.total0.toString(), total1: m.total1.toString(),
    feeBps: m.feeBps.toString(),
  }));
  console.log(`proposalExists:`, await pred.proposalExists(id));
  console.log(`disputed:`, await pred.disputed(id));
  console.log(`owner:`, await pred.owner());
  console.log(`resolver:`, await pred.resolver());
  const user = `0x56912EeFF53149404E3973E09F26cdbd8eB65D0a`;
  const bal = await ethers.provider.getBalance(user);
  console.log(`userBal:`, ethers.formatEther(bal), `BOT`);
  // selector check
  const iface = new ethers.Interface([`function bet(uint256,uint8) payable`]);
  console.log(`bet selector:`, iface.getFunction(`bet`).selector);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
