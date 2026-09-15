// Generate Safe transaction data for MicroPredict acceptOwner (Safe -> Safe)
// OFFLINE — no RPC needed. Call AFTER 48h timelock expires on proposeOwner.
// Run with plain node: node scripts/accept-owner.js
const { ethers } = require('ethers');

const PREDICT = '0x3cb5faCA74f5F0211a1f1a773Ed45B042bDD50C5';

const iface = new ethers.Interface([
  'function acceptOwner()'
]);

const data = iface.encodeFunctionData('acceptOwner', []);

console.log(JSON.stringify({
  network: 'botMainnet',
  chainId: 677,
  contract: 'MicroPredict',
  address: PREDICT,
  from: 'Safe (0x3f6599D5694044Ac0B357695843391220a5aE0c3)',
  to: PREDICT,
  value: '0',
  data: data,
  operation: 0,
  description: 'Step 2: Safe calls acceptOwner(). Execute AFTER 48h timelock from proposeOwner tx.'
}, null, 2));