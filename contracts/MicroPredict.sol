// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MicroPredict {
    address public owner;
    address public resolver;
    address public pendingOwner;
    uint256 public pendingOwnerAt;
    uint256 public constant OWNERSHIP_TIMELOCK = 48 hours;
    uint256 public marketCount;
    uint256 public collectedFees;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant DISPUTE_WINDOW = 1 hours;
    uint256 public constant DISPUTE_BOND = 0.01 ether;
    uint256 public constant SWEEP_DELAY = 180 days;
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
    mapping(uint256 => string) public marketQuestion;

    // Two-step resolution state (kept out of hot Market struct)
    mapping(uint256 => uint8) public proposedWinner;
    mapping(uint256 => uint64) public proposalTime;
    mapping(uint256 => bool) public proposalExists;
    mapping(uint256 => bool) public disputed;
    mapping(uint256 => address) public disputer;
    mapping(uint256 => uint256) public disputeBond;
    mapping(uint256 => bool) public swept;

    event MarketCreated(uint256 indexed id, uint64 endTime, uint256 feeBps, string question);
    event BetPlaced(uint256 indexed id, address indexed user, uint8 outcome, uint256 amount);
    event ResolutionProposed(uint256 indexed id, uint8 winner, uint64 finalizeAfter);
    event ResolutionDisputed(uint256 indexed id, address indexed disputer, uint256 bond);
    event MarketResolved(uint256 indexed id, uint8 winner);
    event MarketVoided(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event FeesWithdrawn(uint256 indexed id, uint256 amount);
    event Swept(uint256 indexed id, uint256 amount, address indexed to);
    event VoidThresholdSet(uint256 indexed id, uint256 amount);
    event OwnerProposed(address indexed newOwner, uint256 at);
    event OwnerAccepted(address indexed newOwner);
    event ResolverSet(address indexed resolver);

    error NotOwner();
    error NotResolver();
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
    error NoProposal();
    error AlreadyProposed();
    error WindowActive();
    error WindowNotOver();
    error IsDisputed();
    error NotDisputed();
    error BadBond();
    error SweepEarly();
    error AlreadySwept();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
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
        resolver = msg.sender;
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

    function setResolver(address r) external onlyOwner {
        if (r == address(0)) revert BadFee();
        resolver = r;
        emit ResolverSet(r);
    }

    function createMarket(uint64 durationSecs, uint256 feeBps, string calldata question) external onlyOwner returns (uint256 id) {
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
        marketQuestion[id] = question;
        emit MarketCreated(id, markets[id].endTime, feeBps, question);
    }

    function bet(uint256 id, uint8 outcome) external payable noReentry {
        Market storage m = markets[id];
        if (msg.sender == owner || msg.sender == resolver) revert OwnerBet();
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved == true) revert Done();
        if (proposalExists[id]) revert Done();
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

    function proposeResolution(uint256 id, uint8 winner) external onlyResolver {
        Market storage m = markets[id];
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved) revert Done();
        if (proposalExists[id]) revert AlreadyProposed();
        if (block.timestamp < m.endTime) revert NotEnded();
        if (winner > 1) revert BadOutcome();
        proposalExists[id] = true;
        proposedWinner[id] = winner;
        proposalTime[id] = uint64(block.timestamp);
        emit ResolutionProposed(id, winner, uint64(block.timestamp) + uint64(DISPUTE_WINDOW));
    }

    function dispute(uint256 id) external payable noReentry {
        if (!proposalExists[id]) revert NoProposal();
        Market storage m = markets[id];
        if (m.resolved) revert Done();
        if (disputed[id]) revert IsDisputed();
        if (block.timestamp >= proposalTime[id] + DISPUTE_WINDOW) revert WindowNotOver();
        if (msg.value < DISPUTE_BOND) revert BadBond();
        disputed[id] = true;
        disputer[id] = msg.sender;
        disputeBond[id] = msg.value;
        emit ResolutionDisputed(id, msg.sender, msg.value);
    }

    function finalizeResolution(uint256 id) external {
        if (!proposalExists[id]) revert NoProposal();
        Market storage m = markets[id];
        if (m.resolved) revert Done();
        if (disputed[id]) revert IsDisputed();
        if (block.timestamp < proposalTime[id] + DISPUTE_WINDOW) revert WindowActive();
        _settle(id, proposedWinner[id]);
    }

    function adminResolve(uint256 id, uint8 winner) external onlyOwner {
        Market storage m = markets[id];
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved) revert Done();
        if (!disputed[id]) revert NotDisputed();
        if (winner > 1) revert BadOutcome();
        bytes memory empty;
        if (winner != proposedWinner[id]) {
            address d = disputer[id];
            uint256 b = disputeBond[id];
            disputeBond[id] = 0;
            if (b > 0 && d != address(0)) {
                (bool rok, ) = d.call{value: b}(empty);
                if (!rok) revert TransferFail();
            }
        } else {
            uint256 b2 = disputeBond[id];
            disputeBond[id] = 0;
            if (b2 > 0) collectedFees += b2;
        }
        _settle(id, winner);
    }

    // Legacy instant resolve kept for tests/scripts (admin only, no dispute).
    function resolve(uint256 id, uint8 winner) external onlyOwner {
        Market storage m = markets[id];
        if (m.endTime == 0) revert NoMarket();
        if (m.resolved) revert Done();
        if (proposalExists[id]) revert AlreadyProposed();
        if (block.timestamp < m.endTime) revert NotEnded();
        if (winner > 1) revert BadOutcome();
        _settle(id, winner);
    }

    function _settle(uint256 id, uint8 winner) internal {
        Market storage m = markets[id];
        m.resolved = true;
        m.winner = winner;
        uint256 wt = winner == 0 ? m.total0 : m.total1;
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

    function getMarkets(uint256[] calldata ids) external view returns (Market[] memory out) {
        out = new Market[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = markets[ids[i]];
        }
    }

    function getUserStakes(uint256[] calldata ids, address user) external view returns (uint256[] memory s0, uint256[] memory s1) {
        s0 = new uint256[](ids.length);
        s1 = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            s0[i] = stakes[ids[i]][user][0];
            s1[i] = stakes[ids[i]][user][1];
        }
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

    function sweepUnclaimed(uint256 id, address payable to) external onlyOwner noReentry {
        Market storage m = markets[id];
        if (m.resolved != true || m.voided == true) revert NotEnded();
        if (swept[id]) revert AlreadySwept();
        if (block.timestamp < m.endTime + SWEEP_DELAY) revert SweepEarly();
        swept[id] = true;
        uint256 pool = m.total0 + m.total1;
        uint256 fee = marketFee(id);
        uint256 paidOut = m.winningTotal == 0 ? 0 : m.claimedTotal * (pool - fee) / m.winningTotal;
        uint256 feePart = feeWithdrawn[id] ? 0 : fee;
        if (feePart > 0) {
            feeWithdrawn[id] = true;
            if (feeTaken[id]) collectedFees -= fee;
        }
        uint256 unclaimedPayout = pool > paidOut + fee ? pool - paidOut - fee : 0;
        uint256 amount = unclaimedPayout + feePart + disputeBond[id];
        disputeBond[id] = 0;
        if (amount == 0) revert NoWin();
        bytes memory empty;
        (bool ok, ) = to.call{value: amount}(empty);
        if (!ok) revert TransferFail();
        emit Swept(id, amount, to);
    }
}
