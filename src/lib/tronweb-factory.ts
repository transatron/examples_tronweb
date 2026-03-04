import { TronWeb } from 'tronweb';
import { config } from '../config/env.js';

export function createSpenderTronWeb(): TronWeb {
  return new TronWeb({
    fullHost: config.API,
    eventServer: config.API,
    privateKey: config.PRIVATE_KEY,
    headers: {
      'TRANSATRON-API-KEY': config.TRANSATRON_API_KEY_SPENDER,
    },
  });
}

export function createNonSpenderTronWeb(): TronWeb {
  return new TronWeb({
    fullHost: config.API,
    eventServer: config.API,
    privateKey: config.PRIVATE_KEY,
    headers: {
      'TRANSATRON-API-KEY': config.TRANSATRON_API_KEY_NON_SPENDER,
    },
  });
}

export function createUnauthenticatedTronWeb(): TronWeb {
  return new TronWeb({
    fullHost: config.API,
    eventServer: config.API,
    privateKey: config.PRIVATE_KEY,
  });
}
