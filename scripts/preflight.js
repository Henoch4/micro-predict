const { ethers } = require(`ethers`);
const fs = require(`fs`);
const dotenv = require(`dotenv`);

const NETWORKS = {
  botTestnet: { rpc: `https://rpc.bohr.life`, chainId: 968 },
  botMainnet: { rpc: `https://rpc.botchain.ai`, chainId: 677 },
};

async function main() {
  const name = process.argv[2] || `botTestnet`;
  const net = NETWORKS[name];
  if (!net) { throw new Error(`unknown network`); }
  if (!fs.existsSync(`.env`)) { throw new Error(`missing .env`); }
  dotenv.config();
  if (!process.env.PRIVATE_KEY) { throw new Error(`missing PRIVATE_KEY`); }
  const provider = new ethers.JsonRpcProvider(net.rpc);
  const onchain = await provider.getNetwork().then((n) => Number(n.chainId));
  if (onchain !== net.chainId) { throw new Error(`chain guard`); }
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log(`deployer`, wallet.address);
  console.log(`balance`, ethers.formatEther(bal));
  if (bal < ethers.parseEther(`0.05`)) { throw new Error(`low balance`); }
  console.log(`PREFLIGHT_OK`, name);
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
