const fetch = require('node-fetch');

const utils = require('../utils');

const baseUrl = 'https://api.solend.fi';
const configEndpoint = `${baseUrl}/v1/config`;
const reservesEndpoint = `${baseUrl}/v1/reserves`;

const main = async () => {
  const configResponse = await fetch(`${configEndpoint}?deployment=production`);

  const config = await configResponse.json();

  const reservesConfigs = config.markets.flatMap((market) =>
    market.reserves.map((reserve) => ({
      ...reserve,
      marketName: market.name,
    }))
  );

  // note(slasher): seems like the solend team has made changes to the reserveEndpoint
  // which now has a limit of max 5 ids, hence why i made this change to loop instead
  const tokenIds = reservesConfigs.map((reserve) => reserve.address);
  const reserves = [];
  const maxIds = 5;
  for (let i = 0; i <= tokenIds.length; i += maxIds) {
    const tokens = tokenIds.slice(i, i + 5).join(',');

    const reservesResponse = await fetch(`${reservesEndpoint}?ids=${tokens}`);
    const res = (await reservesResponse.json()).results;

    if (res === undefined) continue;
    reserves.push(res);
  }

  return reserves.flat().map((reserveData, index) => {
    const reserveConfig = reservesConfigs[index];
    const liquidity = reserveData.reserve.liquidity;
    const collateral = reserveData.reserve.collateral;
    const apyBase = Number(reserveData.rates.supplyInterest);
    const apyBaseBorrow = Number(reserveData.rates.borrowInterest);
    const apyReward = reserveData.rewards.reduce(
      (acc, reward) =>
        reward.side === 'supply' ? (Number(reward.apy) || 0) + acc : acc,
      0
    );
    const apyRewardBorrow = reserveData.rewards.reduce(
      (acc, reward) =>
        reward.side === 'borrow' ? (Number(reward.apy) || 0) + acc : acc,
      0
    );

    const rewardTokens = reserveData.rewards
      .filter((r) => r.side == 'supply')
      .map((r) =>
        r?.rewardMint === 'SLND_OPTION'
          ? 'SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp'
          : r?.rewardMint
      );
    const secondaryString =
      reserveConfig.marketName.charAt(0).toUpperCase() +
      reserveConfig.marketName.slice(1) +
      ' Pool';

    // total supply
    const totalSupplyUsd =
      (Number(collateral.mintTotalSupply) / 10 ** liquidity.mintDecimals) *
      (liquidity.marketPrice / 10 ** 18);

    // available liquidity
    const tvlUsd =
      (Number(liquidity.availableAmount) / 10 ** liquidity.mintDecimals) *
      (liquidity.marketPrice / 10 ** 18);

    // total borrow
    const totalBorrowUsd = totalSupplyUsd - tvlUsd;

    return {
      pool: reserveConfig.address,
      chain: utils.formatChain('solana'),
      project: 'solend',
      symbol: `${reserveConfig.asset}`,
      poolMeta: secondaryString,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? rewardTokens : [],
      underlyingTokens: [reserveData.reserve.liquidity.mintPubkey],
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: apyRewardBorrow > 0 ? apyRewardBorrow : null,
      ltv: reserveData.reserve.config.loanToValueRatio / 100,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://solend.fi/pools',
};
