const PRED_DEFAULT=`0x106bAa5aFD341F902B335De2A265FA845711EAA5`;
const RPC=`https://rpc.bohr.life`;
const EXPLORER=`https://scan.bohr.life`;

const PRED_ABI=[
`function owner() view returns (address)`,
`function marketCount() view returns (uint256)`,
`function collectedFees() view returns (uint256)`,
`function markets(uint256) view returns (uint64 endTime, bool resolved, bool voided, uint8 winner, uint256 total0, uint256 total1, uint256 winningTotal, uint256 claimedTotal, uint256 feeBps)`,
`function stakes(uint256,address,uint8) view returns (uint256)`,
`function marketFee(uint256) view returns (uint256)`,
`function voidThreshold(uint256) view returns (uint256)`,
`function createMarket(uint64,uint256) returns (uint256)`,
`function bet(uint256,uint8) payable`,
`function resolve(uint256,uint8)`,
`function claim(uint256)`,
`function ownerWithdrawFees(uint256,address)`,
`function setVoidThreshold(uint256,uint256)`,
];

let signer=null;
let account=null;

function log(m){
  const el=document.getElementById(`log`);
  el.textContent+=m+`\n`;
}
async function connect(){
  if(!window.ethereum){ log(`no wallet found, use MetaMask`); return; }
  const accs=await window.ethereum.request({method:`eth_requestAccounts`});
  account=accs[0];
  try{
    await window.ethereum.request({method:`wallet_switchEthereumChain`,params:[{chainId:`0x3c8`}]});
  }catch(e){
    await window.ethereum.request({method:`wallet_addEthereumChain`,params:[{chainId:`0x3c8`,chainName:`BOT Chain Testnet`,nativeCurrency:{name:`BOT`,symbol:`BOT`,decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});
  }
  signer=await new ethers.BrowserProvider(window.ethereum).getSigner();
  log(`connected `+account);
}
function pred(){
  const a=document.getElementById(`paddr`).value||PRED_DEFAULT;
  const p=signer||new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(a,PRED_ABI,p);
}
async function send(promise,label){
  try{
    const tx=await promise;
    log(label+` sent `+tx.hash);
    await tx.wait();
    log(label+` confirmed`);
  }catch(e){
    log(label+` failed `+(e.reason||e.shortMessage||e.message||e));
  }
}
function statusOf(m,now){
  if(m.resolved&&m.voided)return `VOID - full refunds`;
  if(m.resolved)return `resolved - winner `+m.winner;
  if(Number(m.endTime)<now)return `ended - awaiting resolve`;
  return `open - ends `+new Date(Number(m.endTime)*1000).toLocaleString();
}
async function scan(){
  const v=pred();
  const now=Math.floor(Date.now()/1000);
  const n=Number(await v.marketCount());
  let html=`<table><tr><th>ID</th><th>Status</th><th>Pool 0</th><th>Pool 1</th><th>Fee bps</th></tr>`;
  for(let i=1;i<=n;i++){
    const m=await v.markets(i);
    html+=`<tr><td>${i}</td><td>${statusOf(m,now)}</td><td>${ethers.formatEther(m.total0)}</td><td>${ethers.formatEther(m.total1)}</td><td>${Number(m.feeBps)}</td></tr>`;
  }
  html+=`</table>`;
  document.getElementById(`markets`).innerHTML=n?html:`no markets yet`;
  log(`scanned `+n+` markets, owner `+await v.owner()+`, collectedFees `+ethers.formatEther(await v.collectedFees())+` BOT`);
}
async function doBet(){
  const v=pred();
  const id=document.getElementById(`bet_id`).value;
  const out=Number(document.getElementById(`bet_out`).value);
  const amt=ethers.parseEther(document.getElementById(`bet_amt`).value||`0`);
  await send(v.bet(id,out,{value:amt}),`bet`);
}
async function doClaim(){
  const v=pred();
  const id=document.getElementById(`cl_id`).value;
  await send(v.claim(id),`claim`);
}
async function doCreate(){
  const v=pred();
  const dur=Number(document.getElementById(`cm_dur`).value);
  const fee=Number(document.getElementById(`cm_fee`).value);
  await send(v.createMarket(dur,fee),`createMarket`);
}
async function doResolve(){
  const v=pred();
  const id=document.getElementById(`rs_id`).value;
  const w=Number(document.getElementById(`rs_w`).value);
  await send(v.resolve(id,w),`resolve`);
}
async function doFees(){
  const v=pred();
  const id=document.getElementById(`fw_id`).value;
  const to=document.getElementById(`fw_to`).value||account;
  await send(v.ownerWithdrawFees(id,to),`ownerWithdrawFees`);
}
async function doThreshold(){
  const v=pred();
  const id=document.getElementById(`th_id`).value;
  const amt=ethers.parseEther(document.getElementById(`th_v`).value||`0`);
  await send(v.setVoidThreshold(id,amt),`setVoidThreshold`);
}
function forecastFor(m,stake,outcome){
  const totalS=outcome===0?m.total0:m.total1;
  const pool=m.total0+m.total1+stake;
  const fee=pool*m.feeBps/10000n;
  const winPool=totalS+stake;
  let payout=0n;
  if(winPool>0n)payout=stake*(pool-fee)/winPool;
  return { fee, payout, net: payout-stake };
}
async function doForecast(){
  const v=pred();
  const id=Number(document.getElementById(`fc_id`).value);
  if(!id){ log(`forecast: enter market id`); return; }
  const stake=ethers.parseEther(document.getElementById(`fc_stake`).value||`0`);
  if(stake<=0n){ log(`forecast: stake must be > 0`); return; }
  const m=await v.markets(id);
  for(const out of [0,1]){
    const r=forecastFor(m,stake,out);
    log(`forecast out `+out+`: stake `+ethers.formatEther(stake)+` BOT, fee `+ethers.formatEther(r.fee)+` BOT, payout-if-win `+ethers.formatEther(r.payout)+` BOT, net `+ethers.formatEther(r.net)+` BOT`);
  }
}
document.getElementById(`b_connect`).addEventListener(`click`,connect);
document.getElementById(`b_scan`).addEventListener(`click`,scan);
document.getElementById(`b_bet`).addEventListener(`click`,doBet);
document.getElementById(`b_claim`).addEventListener(`click`,doClaim);
document.getElementById(`b_create`).addEventListener(`click`,doCreate);
document.getElementById(`b_resolve`).addEventListener(`click`,doResolve);
document.getElementById(`b_fees`).addEventListener(`click`,doFees);
document.getElementById(`b_threshold`).addEventListener(`click`,doThreshold);
document.getElementById(`b_forecast`).addEventListener(`click`,doForecast);
