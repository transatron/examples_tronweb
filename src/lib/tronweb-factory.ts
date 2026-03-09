import { TronWeb, providers } from 'tronweb';
import { config } from '../config/env.js';

const TRANSATRON_TIMEOUT = 60000;

export function createSpenderTronWeb(): TronWeb {
  const headers = { 'TRANSATRON-API-KEY': config.TRANSATRON_API_KEY_SPENDER };
  return new TronWeb({
    fullNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    solidityNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    eventServer: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    privateKey: config.PRIVATE_KEY,
  });
}

export function createNonSpenderTronWeb(): TronWeb {
  const headers = { 'TRANSATRON-API-KEY': config.TRANSATRON_API_KEY_NON_SPENDER };
  return new TronWeb({
    fullNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    solidityNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    eventServer: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT, '', '', headers),
    privateKey: config.PRIVATE_KEY,
  });
}

export function createUnauthenticatedTronWeb(): TronWeb {
  return new TronWeb({
    fullNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT),
    solidityNode: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT),
    eventServer: new providers.HttpProvider(config.API, TRANSATRON_TIMEOUT),
    privateKey: config.PRIVATE_KEY,
  });
}
