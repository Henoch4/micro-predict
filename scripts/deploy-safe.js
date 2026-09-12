// Deploys a 2-owner Safe (GnosisSafe v1.3.0) on BOT Chain via the canonical
// keyless ProxyFactory — no Safe web UI needed. Reads everything from env,
// sends nothing to chat, commits nothing secret (.env is gitignored).
//
//   Required in .env:
//     PRIVATE_KEY=0x...        (deployer, pays gas — already in use)
//     SAFE_OWNER_1=0x...       (wallet 1)
//     SAFE_OWNER_2=0x...       (wallet 2)
//   Optional:
//     SAFE_OWNER_3=0x...       (third signer -> 2-of-3, recommended later)
//     SAFE_THRESHOLD=2         (default: all owners must sign)
//     SAFE_SALT=12345          (default: 1; change only to deploy a 2nd Safe)
//
//   Shared team Safe: deploy ONCE (from any project folder), then use the
//   resulting address as owner everywhere (vault, predict, launch).
//   npx hardhat run scripts/deploy-safe.js --network botMainnet
const { ethers, network } = require(`hardhat`);

const SINGLETON = `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552`;
const FACTORY = `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`;
const ZERO = `0x0000000000000000000000000000000000000000`;

const FACTORY_ABI = [
  `function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)`,
  `event ProxyCreation(address indexed proxy, address singleton)`,
];
const SETUP_ABI = [
  `function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)`,
];

function envAddr(name, required) {
  const v = (process.env[name] || ``).trim();
  if (!v) {
    if (required) throw new Error(`Set ${name} in .env`);
    return null;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not a valid address`);
  return v;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const owners = [envAddr(`SAFE_OWNER_1`, true), envAddr(`SAFE_OWNER_2`, true)];
  const third = envAddr(`SAFE_OWNER_3`, false);
  if (third) owners.push(third);
  if (new Set(owners.map((a) => a.toLowerCase())).size !== owners.length) {
    throw new Error(`Duplicate owner addresses`);
  }
  const threshold = Number(process.env.SAFE_THRESHOLD || owners.length);
  if (!(threshold >= 1 && threshold <= owners.length)) {
    throw new Error(`SAFE_THRESHOLD must be 1..${owners.length}`);
  }
  const salt = BigInt(process.env.SAFE_SALT || `1`);

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer);
  const singleton = new ethers.Contract(SINGLETON, SETUP_ABI, deployer);
  const initializer = await singleton.setup.populateTransaction(
    owners, threshold, ZERO, `0x`, ZERO, ZERO, 0, ZERO
  ).then((tx) => tx.data);

  const predicted = await factory.createProxyWithNonce.staticCall(SINGLETON, initializer, salt);
  console.log(JSON.stringify({ network: network.name, predicted, owners, threshold }));
  const tx = await factory.createProxyWithNonce(SINGLETON, initializer, salt);
  const rc = await tx.wait();
  const created = rc.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === `ProxyCreation`);
  const safe = created ? created.args.proxy : predicted;
  console.log(JSON.stringify({
    safe,
    owners,
    threshold,
    singleton: SINGLETON,
    txHash: rc.hash,
    explorer: `https://scan.botchain.ai/address/${safe}`,
    matchesPrediction: safe.toLowerCase() === predicted.toLowerCase(),
  }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
