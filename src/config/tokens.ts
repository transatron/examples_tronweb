export const TOKENS = {
  USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  USDC: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  SUN: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
} as const;

export type TokenSymbol = keyof typeof TOKENS;

export const CONTRACTS = {
  SUN_SWAP_ROUTER: 'TWH7FMNjaLUfx5XnCzs1wybzA6jV5DXWsG',
} as const;

/** Zero address representing native TRX in SunSwap paths. */
export const TRX_ZERO_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

/** Wrapped TRX — intermediary token required in SunSwap swap paths. */
export const WTRX_ADDRESS = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR';
