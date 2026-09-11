const { expect } = require(`chai`);
const { ethers } = require(`hardhat`);

describe(`MicroPredict`, function () {
  async function deploy() {
    const [owner, user1, user2] = await ethers.getSigners();
    const Predict = await ethers.getContractFactory(`MicroPredict`);
    const predict = await Predict.deploy();
    return { owner, user1, user2, predict };
  }

  it(`owner creates a market`, async function () {
    const { predict } = await deploy();
    await expect(predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) })).to.emit(predict, `MarketCreated`);
    expect(await predict.marketCount()).to.equal(1);
  });

  it(`takes bets, resolves and pays winners minus fee`, async function () {
    const { user1, user2, predict } = await deploy();
    const addr = await predict.getAddress();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 1, { value: ethers.parseEther(`3`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.resolve(1, 1);
    await expect(predict.connect(user2).claim(1)).to.emit(predict, `Claimed`);
    expect(await ethers.provider.getBalance(addr)).to.equal(ethers.parseEther(`0.04`));
    expect(await predict.collectedFees()).to.equal(ethers.parseEther(`0.04`));
    await expect(predict.connect(user1).claim(1)).to.be.revertedWithCustomError(predict, `NoWin`);
  });

  it(`reverts on bad bets and early resolve`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    const NORULE = [0, ethers.ZeroAddress, 0, 0];
    await expect(predict.createMarket(3600, 100, "Will BOT close above $0.01?", NORULE, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(predict, `BadFee`); // no listing fee
    await expect(predict.createMarket(10, 100, "bad", NORULE, ethers.ZeroAddress, { value: FEE }))
      .to.be.revertedWithCustomError(predict, `BadTime`);
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await expect(predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`0.0001`) }))
      .to.be.revertedWithCustomError(predict, `SmallBet`);
    await expect(predict.resolve(1, 0))
      .to.be.revertedWithCustomError(predict, `NotEnded`);
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) }))
      .to.be.revertedWithCustomError(predict, `Ended`);
    await predict.resolve(1, 0);
    await expect(predict.connect(user2).claim(1))
      .to.be.revertedWithCustomError(predict, `NoWin`);
  });

  it(`owner withdraws collected fees`, async function () {
    const { owner, user1, predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.resolve(1, 0);
    await predict.connect(user1).claim(1);
    await predict.ownerWithdrawFees(1, owner.address);
    expect(await predict.collectedFees()).to.equal(0);
  });

  it(`voids market with empty winning side and refunds stakes`, async function () {
    const { user1, user2, predict } = await deploy();
    const addr = await predict.getAddress();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.resolve(1, 1)).to.emit(predict, `MarketVoided`);
    await expect(predict.connect(user1).claim(1)).to.emit(predict, `Claimed`);
    expect(await ethers.provider.getBalance(addr)).to.equal(0);
    await expect(predict.connect(user2).claim(1)).to.be.revertedWithCustomError(predict, `NoWin`);
  });

  it(`blocks fee withdrawal until every winner claimed`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 0, { value: ethers.parseEther(`3`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.resolve(1, 0);
    await predict.connect(user1).claim(1);
    await expect(predict.ownerWithdrawFees(1, owner.address)).to.be.revertedWithCustomError(predict, `NotFullyClaimed`);
    await predict.connect(user2).claim(1);
    await expect(predict.ownerWithdrawFees(1, owner.address)).to.emit(predict, `FeesWithdrawn`);
    await expect(predict.ownerWithdrawFees(1, owner.address)).to.be.revertedWithCustomError(predict, `FeesDone`);
  });

it(`bars owner from betting`, async function () {
    const { predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await expect(predict.bet(1, 0, { value: ethers.parseEther(`1`) })).to.be.revertedWithCustomError(predict, `OwnerBet`);
  });

  it(`pre-committed void threshold voids thin markets with full refunds`, async function () {
    const { user1, user2, predict } = await deploy();
    const addr = await predict.getAddress();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.setVoidThreshold(1, ethers.parseEther(`0.5`));
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`0.2`) });
    await predict.connect(user2).bet(1, 1, { value: ethers.parseEther(`0.3`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.resolve(1, 1)).to.emit(predict, `MarketVoided`);
    await predict.connect(user1).claim(1);
    await predict.connect(user2).claim(1);
    expect(await ethers.provider.getBalance(addr)).to.equal(0);
  });

  it(`winning side above threshold still resolves normally`, async function () {
    const { user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.setVoidThreshold(1, ethers.parseEther(`0.5`));
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`2`) });
    await predict.connect(user2).bet(1, 1, { value: ethers.parseEther(`3`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.resolve(1, 1)).to.emit(predict, `MarketResolved`);
    await expect(predict.connect(user2).claim(1)).to.emit(predict, `Claimed`);
  });

  it(`void threshold setter rejects markets that already have volume`, async function () {
    const { user1, predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await expect(predict.setVoidThreshold(1, ethers.parseEther(`0.5`)))
      .to.be.revertedWithCustomError(predict, `HasVolume`);
    await predict.createMarket(3600, 100, "second?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await expect(predict.connect(user1).setVoidThreshold(2, ethers.parseEther(`0.5`)))
      .to.be.revertedWithCustomError(predict, `NotCreator`);
  });

  it(`ownership timelock: proposeOwner + acceptOwner after delay`, async function () {
    const { owner, user1, predict } = await deploy();
    await predict.proposeOwner(user1.address);
    expect(await predict.pendingOwner()).to.equal(user1.address);
    await expect(predict.connect(user1).acceptOwner()).to.be.revertedWithCustomError(predict, `TimelockActive`);
    await ethers.provider.send(`evm_increaseTime`, [48 * 3600 + 1]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.connect(user1).acceptOwner();
    expect(await predict.owner()).to.equal(user1.address);
  });

  it(`timeout sweep allows fee withdrawal after 30 days even if unclaimed`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "Will BOT close above $0.01?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 0, { value: ethers.parseEther(`3`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.resolve(1, 0);
    await predict.connect(user1).claim(1);
    await expect(predict.ownerWithdrawFees(1, owner.address)).to.be.revertedWithCustomError(predict, `NotFullyClaimed`);
    await ethers.provider.send(`evm_increaseTime`, [30 * 24 * 3600 + 1]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.ownerWithdrawFees(1, owner.address)).to.emit(predict, `FeesWithdrawn`);
  });

  it(`stores question + batch views work`, async function () {
    const { user1, predict } = await deploy();
    await predict.createMarket(3600, 100, "Does $BOPE close above $0.002 Friday?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    expect(await predict.marketQuestion(1)).to.equal("Does $BOPE close above $0.002 Friday?");
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    const ms = await predict.getMarkets([1]);
    expect(ms[0].total0).to.equal(ethers.parseEther(`1`));
    const [s0, s1] = await predict.getUserStakes([1], user1.address);
    expect(s0[0]).to.equal(ethers.parseEther(`1`));
    expect(s1[0]).to.equal(0);
  });

  it(`admin/resolver split: resolver pinned at creation`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    const NORULE = [0, ethers.ZeroAddress, 0, 0];
    await predict.createMarket(3600, 100, "q", NORULE, ethers.ZeroAddress, { value: FEE });
    await predict.setResolver(user1.address);
    expect(await predict.resolver()).to.equal(user1.address);
    expect(await predict.marketResolver(1)).to.equal(owner.address); // pinned at creation
    await predict.createMarket(3600, 100, "q2", NORULE, ethers.ZeroAddress, { value: FEE });
    expect(await predict.marketResolver(2)).to.equal(user1.address); // new global picked up
    await predict.connect(user2).bet(2, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.proposeResolution(2, 0))
      .to.be.revertedWithCustomError(predict, `NotResolver`);
    await expect(predict.connect(user1).proposeResolution(2, 0))
      .to.emit(predict, `ResolutionProposed`);
  });

  it(`dispute window: propose -> dispute -> adminResolve override`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "q", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 1, { value: ethers.parseEther(`2`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.proposeResolution(1, 0);
    await expect(predict.finalizeResolution(1))
      .to.be.revertedWithCustomError(predict, `WindowActive`);
    await predict.connect(user1).dispute(1, { value: ethers.parseEther(`0.01`) });
    await expect(predict.finalizeResolution(1))
      .to.be.revertedWithCustomError(predict, `IsDisputed`);
    await predict.adminResolve(1, 1);
    const m = await predict.markets(1);
    expect(m.resolved).to.equal(true);
    expect(m.winner).to.equal(1);
  });

  it(`finalize after window when undisputed`, async function () {
    const { user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "q", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 1, { value: ethers.parseEther(`2`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.proposeResolution(1, 1);
    await ethers.provider.send(`evm_increaseTime`, [3600 + 1]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.finalizeResolution(1)).to.emit(predict, `MarketResolved`);
  });

  it(`anyone creates a market by paying the listing fee`, async function () {
    const { owner, user1, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    const NORULE = [0, ethers.ZeroAddress, 0, 0];
    const ob = await ethers.provider.getBalance(owner.address);
    await expect(predict.connect(user1).createMarket(3600, 100, "user market?", NORULE, ethers.ZeroAddress, { value: FEE }))
      .to.emit(predict, `MarketCreated`);
    expect(await predict.marketCreator(1)).to.equal(user1.address);
    expect(await predict.marketResolver(1)).to.equal(owner.address); // blank falls back to global
    expect(await ethers.provider.getBalance(owner.address)).to.be.gt(ob); // fee forwarded
    await expect(predict.connect(user1).createMarket(3600, 100, "free?", NORULE, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(predict, `BadFee`);
  });

  it(`per-market resolver proposes, global resolver cannot`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    const NORULE = [0, ethers.ZeroAddress, 0, 0];
    await predict.connect(user1).createMarket(3600, 100, "user market?", NORULE, user2.address, { value: FEE });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.proposeResolution(1, 0)).to.be.revertedWithCustomError(predict, `NotResolver`);
    await expect(predict.connect(user2).proposeResolution(1, 0)).to.emit(predict, `ResolutionProposed`);
    await expect(predict.connect(user2).bet(1, 0, { value: ethers.parseEther(`1`) }))
      .to.be.revertedWithCustomError(predict, `OwnerBet`);
  });

  it(`setRule before volume, rejects after`, async function () {
    const { owner, user1, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    const NORULE = [0, ethers.ZeroAddress, 0, 0];
    await predict.connect(user1).createMarket(3600, 100, "user market?", NORULE, ethers.ZeroAddress, { value: FEE });
    const PAIR = `0x0000000000000000000000000000000000000001`;
    await predict.connect(user1).setRule(1, [1, PAIR, ethers.parseEther(`10`), 0]);
    const r = await predict.marketRule(1);
    expect(r.kind).to.equal(1);
    expect(r.ref).to.equal(PAIR);
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await expect(predict.connect(user1).setRule(1, NORULE))
      .to.be.revertedWithCustomError(predict, `HasVolume`);
  });

  it(`getBoard returns market+roles+question in one call`, async function () {
    const { owner, user1, predict } = await deploy();
    const FEE = ethers.parseEther(`0.005`);
    await predict.connect(user1).createMarket(3600, 100, "board q?", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: FEE });
    const rows = await predict.getBoard([1]);
    expect(rows.length).to.equal(1);
    expect(rows[0].question).to.equal("board q?");
    expect(rows[0].creator).to.equal(user1.address);
    expect(rows[0].resolverAddr).to.equal(owner.address);
    expect(rows[0].kind).to.equal(0);
    expect(rows[0].m.feeBps).to.equal(100);
  });

  it(`sweepUnclaimed after 180 days`, async function () {
    const { owner, user1, user2, predict } = await deploy();
    await predict.createMarket(3600, 100, "q", [0, ethers.ZeroAddress, 0, 0], ethers.ZeroAddress, { value: ethers.parseEther(`0.005`) });
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await predict.connect(user2).bet(1, 0, { value: ethers.parseEther(`1`) });
    await ethers.provider.send(`evm_increaseTime`, [3601]);
    await ethers.provider.send(`evm_mine`, []);
    await predict.resolve(1, 0);
    await predict.connect(user1).claim(1);
    await expect(predict.sweepUnclaimed(1, owner.address))
      .to.be.revertedWithCustomError(predict, `SweepEarly`);
    await ethers.provider.send(`evm_increaseTime`, [180 * 24 * 3600 + 1]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(predict.sweepUnclaimed(1, owner.address)).to.emit(predict, `Swept`);
  });
});
