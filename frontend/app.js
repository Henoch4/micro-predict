import * as ethers from 'ethers';
import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

const PRED_DEFAULT=`0xf9E816eCA32d5a086b9D64480832f3aa4BA25A7a`;
const RPC=`https://rpc.bohr.life`;
const EXPLORER=`https://scan.bohr.life`;
const CHAIN_ID=0x3c8;

const PRED_ABI=[
`function owner() view returns (address)`,
`function resolver() view returns (address)`,
`function pendingOwner() view returns (address)`,
`function pendingOwnerAt() view returns (uint256)`,
`function marketCount() view returns (uint256)`,
`function collectedFees() view returns (uint256)`,
`function markets(uint256) view returns (uint64 endTime, bool resolved, bool voided, uint8 winner, uint256 total0, uint256 total1, uint256 winningTotal, uint256 claimedTotal, uint256 feeBps)`,
`function marketQuestion(uint256) view returns (string)`,
`function stakes(uint256,address,uint8) view returns (uint256)`,
`function marketFee(uint256) view returns (uint256)`,
`function voidThreshold(uint256) view returns (uint256)`,
`function createMarket(uint64,uint256,string) returns (uint256)`,
`function bet(uint256,uint8) payable`,
`function resolve(uint256,uint8)`,
`function proposeResolution(uint256,uint8)`,
`function dispute(uint256) payable`,
`function finalizeResolution(uint256)`,
`function adminResolve(uint256,uint8)`,
`function claim(uint256)`,
`function ownerWithdrawFees(uint256,address)`,
`function sweepUnclaimed(uint256,address)`,
`function setVoidThreshold(uint256,uint256)`,
`function proposeOwner(address)`,
`function acceptOwner()`,
`function setResolver(address)`,
`function OWNERSHIP_TIMELOCK() view returns (uint256)`,
`function DISPUTE_WINDOW() view returns (uint256)`,
`function getMarkets(uint256[]) view returns (tuple(uint64 endTime, bool resolved, bool voided, uint8 winner, uint256 total0, uint256 total1, uint256 winningTotal, uint256 claimedTotal, uint256 feeBps)[])`,
`function getUserStakes(uint256[],address) view returns (uint256[],uint256[])`,
`function proposalExists(uint256) view returns (bool)`,
`function disputed(uint256) view returns (bool)`,
];

let signer=null;
let account=null;

const PROJECT_ID=`f018499b1e4a94d961ab67aeeeff3254`;

const botTestnet={
  id:968,
  chainNamespace:`eip155`,
  caipNetworkId:`eip155:968`,
  name:`BOT Chain Testnet`,
  nativeCurrency:{name:`BOT`,symbol:`BOT`,decimals:18},
  rpcUrls:{default:{http:[RPC]}},
  blockExplorers:{default:{name:`BOT Scan`,url:EXPLORER}},
};
const botMainnet={
  id:677,
  chainNamespace:`eip155`,
  caipNetworkId:`eip155:677`,
  name:`BOT Chain`,
  nativeCurrency:{name:`BOT`,symbol:`BOT`,decimals:18},
  rpcUrls:{default:{http:[`https://rpc.botchain.ai`]}},
  blockExplorers:{default:{name:`BOT Scan`,url:`https://scan.botchain.ai`}},
};

const modal=createAppKit({
  adapters:[new EthersAdapter()],
  networks:[botTestnet,botMainnet],
  defaultNetwork:botTestnet,
  projectId:PROJECT_ID,
  metadata:{
    name:`MicroPredict`,
    description:`Micro prediction markets on BOT Chain`,
    url:`https://micro-predict.vercel.app`,
    icons:[`https://micro-predict.vercel.app/favicon.ico`],
  },
  themeVariables:{'--w3m-accent':`#d99a2b`},
  features:{analytics:false},
});

let walletProvider=null;
let _connectResolve=null;

function getProvider(){
  if(walletProvider)return walletProvider;
  try{
    if(modal&&typeof modal.getWalletProvider===`function`){
      const p=modal.getWalletProvider(`eip155`)||modal.getWalletProvider();
      if(p){walletProvider=p;return p;}
    }
  }catch(e){}
  return null;
}

async function syncFromProvider(wp){
  let bp=new ethers.BrowserProvider(wp);
  const net=await bp.getNetwork();
  if(Number(net.chainId)!==CHAIN_ID){
    log(`switching to BOT Chain testnet…`);
    await modal.switchNetwork(botTestnet);
    bp=new ethers.BrowserProvider(getProvider()||wp);
  }
  signer=await bp.getSigner();
  account=await signer.getAddress();
}

function updateConnectedUI(){
  el(`walletState`).textContent=shorten(account)+` · testnet`;
  el(`connectBtn`).textContent=`Connected`;
}
function updateDisconnectedUI(){
  el(`walletState`).textContent=`not connected`;
  el(`connectBtn`).textContent=`Connect wallet`;
}

modal.subscribeProviders((state)=>{
  if(state&&state[`eip155`])walletProvider=state[`eip155`];
});

modal.subscribeAccount(async (state)=>{
  if(state&&state.isConnected&&state.address){
    account=state.address;
    const wp=getProvider();
    if(wp){
      try{
        await syncFromProvider(wp);
        updateConnectedUI();
        updateBackofficeVisibility();
        log(`connected `+account);
        refreshTickets();
      }catch(e){log(`connect failed: `+(e.reason||e.shortMessage||e.message));}
    }else{
      updateConnectedUI();
      updateBackofficeVisibility();
      log(`connected `+account);
      refreshTickets();
    }
    if(_connectResolve){_connectResolve(!!signer);_connectResolve=null;}
  }else{
    const was=!!account;
    account=null;signer=null;
    updateDisconnectedUI();
    updateBackofficeVisibility();
    if(was){log(`disconnected`);refreshTickets();}
    if(_connectResolve){_connectResolve(false);_connectResolve=null;}
  }
});

modal.subscribeState((state)=>{
  if(state&&state.open===false&&_connectResolve&&!signer){
    _connectResolve(false);_connectResolve=null;
  }
});

function onConnectClick(){
  let isConn=false;
  try{isConn=modal.getIsConnectedState();}catch(e){}
  if(isConn&&getProvider()){
    try{
      const r=modal.open({view:`Account`});
      if(r&&typeof r.catch===`function`)r.catch(()=>{try{modal.open();}catch(e){}});
    }catch(e){try{modal.open();}catch(_){}}
    return;
  }
  connect();
}

const state={ sel:0, side:0, owner:null };

function log(m){
  const el=document.getElementById(`log`);
  const d=document.createElement(`div`);
  d.textContent=m;
  el.appendChild(d);
  el.scrollTop=el.scrollHeight;
}
function el(id){ return document.getElementById(id); }
function stakeWei(){
  const v=el(`betAmt`).value.trim();
  if(!v)return 0n;
  try{ return ethers.parseEther(v); }
  catch(e){ return 0n; }
}

function pred(){
  const a=el(`paddr`).value.trim()||PRED_DEFAULT;
  const p=signer||new ethers.JsonRpcProvider(RPC);
  return new ethers.Contract(a,PRED_ABI,p);
}

async function connect(){
  try{
    if(modal.getIsConnectedState()){
      const wp=getProvider();
      if(wp){
        await syncFromProvider(wp);
        updateConnectedUI();
        log(`connected `+account);
        refreshTickets();
        return true;
      }
    }
  }catch(e){}
  const pending=new Promise((resolve)=>{_connectResolve=resolve;});
  try{modal.open();}
  catch(e){
    _connectResolve=null;
    log(`connect failed: `+(e.message||e));
    return false;
  }
  const timeout=new Promise((resolve)=>setTimeout(()=>resolve(!!signer),120000));
  return Promise.race([pending,timeout]);
}
function shorten(a){ return a ? a.slice(0,6)+`…`+a.slice(-4) : ``; }

async function send(promise,label){
  try{
    const tx=await promise;
    log(label+` sent `+tx.hash);
    document.title=`⏳ `+label;
    await tx.wait();
    document.title=`MicroPredict — BOT Chain odds board`;
    log(`✓ `+label+` confirmed`);
    scan(); refreshTickets();
  }catch(e){
    document.title=`MicroPredict — BOT Chain odds board`;
    log(`✗ `+label+` failed: `+(e.reason||e.shortMessage||(e.message||e).split(`\n`)[0]));
    throw e;
  }
}

function statusOf(m,now,compact){
  if(m.resolved&&m.voided)return compact?`VOID`:{label:`void`,cls:`void`};
  if(m.resolved)return compact?`winner ${m.winner}`:{label:`winner ${m.winner}`,cls:`resolved`};
  if(Number(m.endTime)<now)return compact?`awaiting resolve`:{label:`ended · await resolve`,cls:`ended`};
  return compact?`open`:{label:`open`,cls:`open`};
}

async function scan(){
  const v=pred();
  try{
    const now=Math.floor(Date.now()/1000);
    const n=Number(await v.marketCount());
    const body=el(`boardBody`);
    body.innerHTML=``;

    if(n===0){
      el(`scanStats`).textContent=`0 markets`;
      fillOfficeSelects(0);
      return;
    }

    // 1 RPC for all markets via getMarkets view (replaces O(n) loop + broken MulticallContract)
    const ids=Array.from({length:n},(_,i)=>i+1);
    const [marketsArr, ownerAddr, collectedFees] = await Promise.all([
      v.getMarkets(ids),
      v.owner(),
      v.collectedFees(),
    ]);
    // Questions are separate strings — parallel fetch, non-blocking fallback to #N
    let questions=[];
    try{
      questions=await Promise.all(ids.map(id=>v.marketQuestion(id).catch(()=>"")));
    }catch{ questions=ids.map(()=>""); }

    const sorted=[];
    for(let i=0;i<n;i++){
      sorted.push({id:i+1,m:marketsArr[i],q:questions[i]||""});
    }
    sorted.sort((a,b)=>{
      const ap=a.m.resolved?9:0, bp=b.m.resolved?9:0;
      return (ap-bp) || (Number(a.m.endTime)-Number(b.m.endTime));
    });
    for(const {id,m,q} of sorted){
      const tr=document.createElement(`tr`);
      tr.className=`flap-row`;
      tr.style.animationDelay=(0.03*(id%20))+'s';
      const title=q||`Market ${id}`;
      tr.innerHTML=`
        <td class="mkt-id">#${id}</td>
        <td class="mkt-name">${title}<div class="sub" style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--muted-dim);font-weight:400;">${Number(m.feeBps)} bps fee · min 0.001 BOT</div></td>
        <td class="col-closes mkt-closes">${m.resolved?`—`:new Date(Number(m.endTime)*1000).toLocaleString()}</td>
        <td><span class="pool-chip a">${ethers.formatEther(m.total0)}</span></td>
        <td><span class="pool-chip b">${ethers.formatEther(m.total1)}</span></td>
        <td><span class="status-flap ${statusOf(m,now).cls}">${statusOf(m,now).label}</span></td>`;
      tr.addEventListener(`click`,()=>select(id));
      body.appendChild(tr);
    }

    state.owner=ownerAddr.toLowerCase();
    updateBackofficeVisibility();
    el(`scanStats`).textContent=n+` markets · owner ${shorten(ownerAddr)} · fees ${ethers.formatEther(collectedFees)} BOT`;
    if(state.sel>n)select(0);
    fillOfficeSelects(n);
    if(n)updateForecast();
  }catch(e){
    log(`scan failed: `+(e.reason||e.shortMessage||(e.message||e).split(`\n`)[0]));
  }
}

function select(id){
  state.sel=id;
  document.querySelectorAll(`tr.flap-row`).forEach((tr,i)=>tr.classList.remove(`selected`));
  const rows=document.querySelectorAll(`tr.flap-row`);
  for(const tr of rows){
    const td=tr.querySelector(`.mkt-id`);
    if(td && td.textContent.trim()===`#${id}`)tr.classList.add(`selected`);
  }
  if(id===0){
    el(`slipTitle`).textContent=`Pick a market from the board`;
    el(`slipSub`).textContent=`— then place your stake —`;
    el(`betError`).style.display=`none`;
    return;
  }
  el(`slipTitle`).textContent=`Market #${id}`;
  el(`slipSub`).textContent=`side ${state.side===0?`A`:`B`} selected`;
  updateForecast();
}

function setSide(s){
  state.side=s;
  el(`sideA`).classList.toggle(`on`,s===0);
  el(`sideB`).classList.toggle(`on`,s===1);
  el(`sideA`).classList.toggle(`a`,true);
  el(`sideB`).classList.toggle(`b`,true);
  updateForecast();
}

async function forecastFor(id,stake,outcome){
  const v=pred();
  const m=await v.markets(id);
  if(m.endTime===0n)return null;
  const totalS=outcome===0?m.total0:m.total1;
  const pool=m.total0+m.total1+stake;
  const fee=pool*m.feeBps/10000n;
  const winPool=totalS+stake;
  let payout=0n;
  if(winPool>0n)payout=stake*(pool-fee)/winPool;
  return { fee, payout, net: payout-stake };
}

async function updateForecast(){
  const stake=stakeWei();
  if(!state.sel||stake<=0n){
    for(const p of [`A`,`B`]){ el(`fee`+p).textContent=`—`; el(`pay`+p).textContent=`—`; el(`net`+p).textContent=`—`; }
    return;
  }
  for(const out of [0,1]){
    const r=await forecastFor(state.sel,stake,out);
    if(!r){ continue; }
    el(`fee`+(out===0?`A`:`B`)).textContent=ethers.formatEther(r.fee)+` BOT`;
    el(`pay`+(out===0?`A`:`B`)).textContent=ethers.formatEther(r.payout)+` BOT`;
    const net=el(`net`+(out===0?`A`:`B`));
    net.textContent=ethers.formatEther(r.net)+` BOT`;
    net.className=`net `+(r.net>=0n?`pos`:`neg`);
  }
}

async function doBet(){
  if(!state.sel){ err(`place: pick a market from the board first`); return; }
  if(!signer){ err(`place: connect a wallet first`); await connect(); if(!signer)return; }
  const amt=stakeWei();
  if(amt<=0n){ err(`place: amount must be > 0`); return; }
  el(`betError`).style.display=`none`;
  el(`placeBetBtn`).disabled=true;
  try{
    await send(pred().bet(state.sel,state.side,{value:amt}),`place bet #${state.sel}`);
  }finally{ el(`placeBetBtn`).disabled=false; }
}
function err(m){
  const e=el(`betError`);
  e.textContent=m; e.style.display=`block`;
}

async function refreshTickets(){
  const list=el(`heldList`);
  if(!account){
    list.innerHTML=`<div class="empty-note">connect to see your tickets</div>`;
    return;
  }
  const v=pred();
  const now=Math.floor(Date.now()/1000);
  try{
    const n=Number(await v.marketCount());
    if(n===0){
      list.innerHTML=`<div class="empty-note">no markets yet</div>`;
      return;
    }

    // 2 RPCs total via batch views (replaces 3n individual calls)
    const ids=Array.from({length:n},(_,i)=>i+1);
    const [marketsArr, stakeRes] = await Promise.all([
      v.getMarkets(ids),
      v.getUserStakes(ids, account),
    ]);
    const s0arr=stakeRes[0], s1arr=stakeRes[1];
    let html=``;
    for(let i=1;i<=n;i++){
      const m=marketsArr[i-1];
      const s0=s0arr[i-1];
      const s1=s1arr[i-1];
      if(s0>0n||s1>0n){
        const st=statusOf(m,now,true);
        const claimable=m.resolved;
        html+=`
          <div class="held-item">
            <div>
              <div class="desc">Market <b>#${i}</b> · ${st}</div>
              <div class="meta">side A ${ethers.formatEther(s0)} BOT · side B ${ethers.formatEther(s1)} BOT</div>
            </div>
            ${claimable?`<button class="btn primary" data-claim="${i}" style="padding:6px 12px;font-size:12px;">Claim</button>`:``}
          </div>`;
      }
    }
    list.innerHTML=html||`<div class="empty-note">no positions on chain yet — place a bet to see it here</div>`;
    list.querySelectorAll(`[data-claim]`).forEach(b=>{
      b.addEventListener(`click`,async()=>{
        b.disabled=true;
        try{ await send(pred().claim(Number(b.dataset.claim)),`claim #${b.dataset.claim}`); }
        catch(e){}
        b.disabled=false;
      });
    });
  }catch(e){
    list.innerHTML=`<div class="empty-note">could not read positions: `+(e.shortMessage||e.message)+`</div>`;
  }
}

async function refreshThreshold(){
  const id=el(`thMarket`).value;
  if(!id){ el(`thCurrent`).textContent=`—`; return; }
  try{
    const t=await pred().voidThreshold(Number(id));
    el(`thCurrent`).textContent=ethers.formatEther(t)+` BOT (min winning pool for resolve to settle)`;
  }catch(e){
    el(`thCurrent`).textContent=`could not read`;
  }
}

function fillOfficeSelects(n){
  const cur=(sel)=>el(sel).value;
  const rs=cur(`rsMarket`), th=cur(`thMarket`), fw=cur(`fwMarket`);
  let html=`<option value="">— pick market —</option>`;
  for(let i=1;i<=n;i++)html+=`<option value="${i}">#${i}</option>`;
  el(`rsMarket`).innerHTML=html;
  el(`thMarket`).innerHTML=html;
  el(`fwMarket`).innerHTML=html;
  const set=(sel,v)=>{ if(v)el(sel).value=v; };
  set(`rsMarket`,rs); set(`thMarket`,th); set(`fwMarket`,fw);
  refreshThreshold();
}

async function doCreate(){
  const durH=Number(el(`cmDur`).value);
  const feeBps=Number(el(`cmFee`).value);
  const q=(el(`cmQ`)&&el(`cmQ`).value||"").trim()||`Market — ${durH}h`;
  if(!durH||durH*3600<60){ log(`create: duration must be ≥ 1 minute`); return; }
  const durSecs=BigInt(Math.floor(durH*3600));
  await send(pred().createMarket(durSecs,feeBps,q),`create market (${durH}h)`);
  el(`cmDur`).value=``;
  if(el(`cmQ`))el(`cmQ`).value=``;
}
async function doResolve(){
  const id=el(`rsMarket`).value;
  if(!id){ log(`resolve: pick a market`); return; }
  await send(pred().resolve(Number(id),Number(el(`rsWinner`).value)),`resolve #${id}`);
}
async function doThreshold(){
  const id=el(`thMarket`).value;
  if(!id){ log(`threshold: pick a market`); return; }
  const amt=ethers.parseEther(el(`thAmt`).value||`0`);
  await send(pred().setVoidThreshold(Number(id),amt),`void threshold #${id}`);
  refreshThreshold();
}
async function doFees(){
  const id=el(`fwMarket`).value;
  if(!id){ log(`withdraw: pick a market`); return; }
  await send(pred().ownerWithdrawFees(Number(id),account),`withdraw fees #${id}`);
}

function updateBackofficeVisibility(){
  const isOwner=!!account&&!!state.owner&&account.toLowerCase()===state.owner;
  el(`backoffice`).style.display=isOwner?`block`:`none`;
  el(`ownerBadge`).style.display=isOwner?`inline-block`:`none`;
}

document.addEventListener(`DOMContentLoaded`,()=>{
  const word=`MICROPREDICT`;
  const wm=el(`wordmark`);
  wm.innerHTML=word.split(``).map((ch,i)=>`<span style="animation-delay:${0.05*i}s">${ch}</span>`).join(``);
  el(`paddr`).value=PRED_DEFAULT;

  el(`connectBtn`).addEventListener(`click`,onConnectClick);
  el(`refreshBtn`).addEventListener(`click`,scan);
  el(`sideA`).addEventListener(`click`,()=>setSide(0));
  el(`sideB`).addEventListener(`click`,()=>setSide(1));
  el(`betAmt`).addEventListener(`input`,updateForecast);
  el(`placeBetBtn`).addEventListener(`click`,doBet);
  el(`cmSubmit`).addEventListener(`click`,doCreate);
  el(`rsSubmit`).addEventListener(`click`,doResolve);
  el(`thSubmit`).addEventListener(`click`,doThreshold);
  el(`thMarket`).addEventListener(`change`,refreshThreshold);
  el(`fwSubmit`).addEventListener(`click`,doFees);
  el(`clearLog`).addEventListener(`click`,(e)=>{ e.preventDefault(); el(`log`).innerHTML=``; });
  el(`paddr`).addEventListener(`change`,scan);

  setSide(0);
  updateBackofficeVisibility();
  scan();
  setInterval(()=>{ scan(); refreshTickets(); },20000);
  setTimeout(async ()=>{
    try{
      if(!signer&&modal.getIsConnectedState()){
        const wp=getProvider();
        if(wp){
          await syncFromProvider(wp);
          updateConnectedUI();
          updateBackofficeVisibility();
          log(`connected `+account);
          refreshTickets();
        }
      }
    }catch(e){}
  },800);
});