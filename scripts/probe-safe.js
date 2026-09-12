const { network } = require(`hardhat`);
// Canonical Safe v1.3.0 keyless addresses (identical on every EVM chain, if deployed).
// Raw RPC: ethers v6 getCode trips on ENS resolution for chain 677.
const ADDRS = {
  safeMastercopy130: `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552`,
  safeProxyFactory130: `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`,
};
async function main() {
  const rpc = async (method, params) => {
    const res = await fetch(network.config.url, {
      method: `POST`,
      headers: { "content-type": `application/json` },
      body: JSON.stringify({ jsonrpc: `2.0`, id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const out = { network: network.name };
  for (const [k, a] of Object.entries(ADDRS)) {
    const code = await rpc(`eth_getCode`, [a, `latest`]);
    out[k] = code === `0x` ? `EMPTY` : `code:${code.length}`;
  }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
