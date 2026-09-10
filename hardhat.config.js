require(`@nomicfoundation/hardhat-ethers`);
require(`@nomicfoundation/hardhat-chai-matchers`);
require(`dotenv`).config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

module.exports = {
  solidity: `0.8.20`,
  networks: {
    hardhat: {},
    botTestnet: { url: `https://rpc.bohr.life`, chainId: 968, accounts: accounts },
    botMainnet: { url: `https://rpc.botchain.ai`, chainId: 677, accounts: accounts },
  },
};
