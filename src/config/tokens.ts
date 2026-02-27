export const TOKENS = {
  USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  USDC: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
  SUN: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
} as const;

export type TokenSymbol = keyof typeof TOKENS;
