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
    await expect(predict.createMarket(3600, 100)).to.emit(predict, `MarketCreated`);
    expect(await predict.marketCount()).to.equal(1);
  });

  it(`takes bets, resolves and pays winners minus fee`, async function () {
    const { user1, user2, predict } = await deploy();
    const addr = await predict.getAddress();
    await predict.createMarket(3600, 100);
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
    await expect(predict.connect(user1).createMarket(3600, 100))
      .to.be.revertedWithCustomError(predict, `NotOwner`);
    await expect(predict.createMarket(10, 100))
      .to.be.revertedWithCustomError(predict, `BadTime`);
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
    await expect(predict.bet(1, 0, { value: ethers.parseEther(`1`) })).to.be.revertedWithCustomError(predict, `OwnerBet`);
  });

  it(`pre-committed void threshold voids thin markets with full refunds`, async function () {
    const { user1, user2, predict } = await deploy();
    const addr = await predict.getAddress();
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
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
    await predict.createMarket(3600, 100);
    await predict.connect(user1).bet(1, 0, { value: ethers.parseEther(`1`) });
    await expect(predict.setVoidThreshold(1, ethers.parseEther(`0.5`)))
      .to.be.revertedWithCustomError(predict, `HasVolume`);
    await expect(predict.connect(user1).setVoidThreshold(1, ethers.parseEther(`0.5`)))
      .to.be.revertedWithCustomError(predict, `NotOwner`);
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
    await predict.createMarket(3600, 100);
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
});
