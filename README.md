# MicroPredict - micro prediction markets for BOT Chain

Project 3 of 3 - user growth engine for Option C metrics.
Binary markets with native BOT stakes, owner resolution, pro rata claims minus protocol fee.

## Commands
- npm install
- npx hardhat test
- npx hardhat run scripts/deploy.js --network botTestnet
- npx hardhat run scripts/deploy.js --network botMainnet

## Post deploy
1. Verify on scan.botchain.ai
2. createMarket with duration in seconds plus fee in bps, max 500
3. Users bet with value at or above 0.001 BOT
4. resolve after endTime, winners claim, owner withdraws fees via ownerWithdrawFees
