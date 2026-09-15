// Generate Safe transaction data for MicroPredict proposeOwner -> Safe
// OFFLINE — no RPC needed. Chain state: owner=deployer, pendingOwner=none
// Run with plain node: node scripts/propose-owner-micro.js
// After mining, wait 48h then run accept-owner-micro.js
const { ethers } = require('ethers');

const SAFE = '0x3f6599D5694044Ac0B357695843391220a5aE0c3';
const PREDICT = '0x3cb5faCA74f5F0211a1f1a773Ed45B042bDD50C5';

const iface = new ethers.Interface([
  'function proposeOwner(address newOwner)'
]);

const data = iface.encodeFunctionData('proposeOwner', [SAFE]);

console.log(JSON.stringify({
  network: 'botMainnet',
  chainId: 677,
  contract: 'MicroPredict',
  address: PREDICT,
  from: 'deployer (0xCeA3A19feb565bee69e505112d405b1a1f31F230)',
  to: PREDICT,
  value: '0',
  data: data,
  operation: 0,
  description: 'Step 1: Deployer calls proposeOwner(Safe). After 48h timelock, Safe calls acceptOwner().'
}, null, 2));