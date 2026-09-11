// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MicroPredict {
    address public owner;
    address public pendingOwner;
    uint256 public pendingOwnerAt;
    uint256 public constant OWNERSHIP_TIMELOCK = 48 hours;
    uint256 public marketCount;
    uint256 public collectedFees;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 private guardFlag = 1;

    struct Market {
        uint64 endTime;
        bool resolved;
        bool voided;
        uint8 winner;
        uint256 total0;
        uint256 total1;
        uint256 winningTotal;
        uint256 claimedTotal;
        uint256 feeBps;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public stakes;
    mapping(uint256 => bool) public feeTaken;
    mapping(uint256 => bool) public feeWithdrawn;
    mapping(uint256 => uint256) public voidThreshold;

    event MarketCreated(uint256 indexed id, uint64 endTime, uint256 feeBps);
    event BetPlaced(uint256 indexed id, address indexed user, uint8 outcome, uint256 amount);
    event MarketResolved(uint256 indexed id, uint8 winner);
    event MarketVoided(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event FeesWithdrawn(uint256 indexed id, uint256 amount);
    event VoidThresholdSet(uint256 indexed id, uint256 amount);
    event OwnerProposed(address indexed newOwner, uint256 at);
    event OwnerAccepted(address indexed newOwner);

    error NotOwner();
    error BadTime();
    error BadFee();
    error NoMarket();
    error Ended();
    error NotEnded();
    error Done();
    error BadOutcome();
    error SmallBet();
    error NoWin();
    error Locked();
    error TransferFail();
    error OwnerBet();
    error NotFullyClaimed();
    error FeesDone();
    error HasVolume();
    error TimelockActive();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier noReentry() {
        if (guardFlag != 1) revert Locked();
        guardFlag = 2;
        _;
        guardFlag = 1;
    }

    constructor() {
        owner = msg.sender;
    }

    function proposeOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert BadFee();
        pendingOwner = newOwner;
        pendingOwnerAt = block.timestamp + OWNERSHIP_TIMELOCK;
        emit OwnerProposed(newOwner, pendingOwnerAt);
    }

    function acceptOwner() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        if (block.timestamp < pendingOwnerAt) revert TimelockActive();
        owner = pendingOwner;
        pendingOwner = address(0);
        pendingOwnerAt = 0;
        emit OwnerAccepted(owner);
    }

    function createMarket(uint64 durationSecs, uint256 feeBps) external onlyOwner returns (uint256 id) {
        if (durationSecs < 60 || durationSecs > 90 days) revert BadTime();
        if (feeBps > MAX_FEE_BPS) revert BadFee();
        id = ++marketCount;
        markets[id] = Market({
            endTime: uint64(block.timestamp) + durationSecs,
            resolved: false,
            voided: false,
            winner: 0,
            total0: 0,
            total1: 0,
            winningTotal: 0,
            claimedTotal: 0,
            feeBps: feeBps
        });
        emit MarketCreated(id, markets[id].endTime, feeBps);
    }

    function bet(uint256 id, uint8 outcome) external payable noReentry {
        Market storage m = markets[id];
        if (msg.sender == owner) revert OwnerBet();
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved == true) revert Done();
        if (block.timestamp >= m.endTime) revert Ended();
        if (outcome > 1) revert BadOutcome();
        if (msg.value < MIN_BET) revert SmallBet();
        if (outcome == 0) {
            m.total0 += msg.value;
        } else {
            m.total1 += msg.value;
        }
        stakes[id][msg.sender][outcome] += msg.value;
        emit BetPlaced(id, msg.sender, outcome, msg.value);
    }

    function resolve(uint256 id, uint8 winner) external onlyOwner {
        Market storage m = markets[id];
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved == true) revert Done();
        if (block.timestamp < m.endTime) revert NotEnded();
        if (winner > 1) revert BadOutcome();
        m.resolved = true;
        m.winner = winner;
        uint256 wt = winner == 0 ? m.total0 : m.total1;
        // Thin-market rule: void when winning side is at or below the
        // pre-committed void threshold (defaults to 0 = old behavior).
        if (wt <= voidThreshold[id]) {
            m.voided = true;
            emit MarketVoided(id);
        } else {
            m.winningTotal = wt;
            emit MarketResolved(id, winner);
        }
    }

    function setVoidThreshold(uint256 id, uint256 amount) external onlyOwner {
        Market storage m = markets[id];
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved == true) revert Done();
        if (m.total0 != 0 || m.total1 != 0) revert HasVolume();
        voidThreshold[id] = amount;
        emit VoidThresholdSet(id, amount);
    }

    function claim(uint256 id) external noReentry {
        Market storage m = markets[id];
        if (m.resolved != true) revert NotEnded();
        bytes memory empty;
        if (m.voided == true) {
            uint256 refund = stakes[id][msg.sender][0] + stakes[id][msg.sender][1];
            if (refund == 0) revert NoWin();
            stakes[id][msg.sender][0] = 0;
            stakes[id][msg.sender][1] = 0;
            (bool vok, ) = msg.sender.call{value: refund}(empty);
            if (vok != true) revert TransferFail();
            emit Claimed(id, msg.sender, refund);
            return;
        }
        uint256 mine = stakes[id][msg.sender][m.winner];
        if (mine == 0) revert NoWin();
        stakes[id][msg.sender][0] = 0;
        stakes[id][msg.sender][1] = 0;
        uint256 pool = m.total0 + m.total1;
        uint256 fee = pool * m.feeBps / 10000;
        uint256 payout = mine * (pool - fee) / m.winningTotal;
        m.claimedTotal += mine;
        if (feeTaken[id] != true) {
            collectedFees += fee;
            feeTaken[id] = true;
        }
        (bool ok, ) = msg.sender.call{value: payout}(empty);
        if (ok != true) revert TransferFail();
        emit Claimed(id, msg.sender, payout);
    }

    function marketFee(uint256 id) public view returns (uint256) {
        Market storage m = markets[id];
        return (m.total0 + m.total1) * m.feeBps / 10000;
    }

    function ownerWithdrawFees(uint256 id, address payable to) external onlyOwner noReentry {
        Market storage m = markets[id];
        if (m.resolved != true || m.voided == true) revert NotEnded();
        bool timeoutSweep = block.timestamp >= m.endTime + 30 days;
        if (!timeoutSweep && m.claimedTotal < m.winningTotal) revert NotFullyClaimed();
        if (feeWithdrawn[id] == true) revert FeesDone();
        feeWithdrawn[id] = true;
        uint256 amount = marketFee(id);
        collectedFees -= amount;
        bytes memory empty;
        (bool ok, ) = to.call{value: amount}(empty);
        if (ok != true) revert TransferFail();
        emit FeesWithdrawn(id, amount);
    }
}