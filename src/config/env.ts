import dotenv from 'dotenv';

const env = process.env.NODE_ENV || 'development';
console.log(`Loading .env.${env}`);
dotenv.config({ path: `.env.${env}` });

export interface EnvConfig {
  API: string;
  PRIVATE_KEY: string;
  TRANSATRON_API_KEY_NON_SPENDER: string;
  TRANSATRON_API_KEY_SPENDER: string;
  TARGET_ADDRESS: string;
  /** Multisig owner (sender) address — optional, used by send-trx-multisig. */
  MULTISIG_OWNER_ADDRESS?: string;
  /** Comma-separated multisig signer private keys (≥2) — optional, used by send-trx-multisig. */
  MULTISIG_SIGNER_KEYS?: string;
  /** Multisig active permission id — optional, defaults to 2 in send-trx-multisig. */
  MULTISIG_PERMISSION_ID?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: EnvConfig = {
  API: requireEnv('API'),
  PRIVATE_KEY: requireEnv('PRIVATE_KEY'),
  TRANSATRON_API_KEY_NON_SPENDER: requireEnv('TRANSATRON_API_KEY_NON_SPENDER'),
  TRANSATRON_API_KEY_SPENDER: requireEnv('TRANSATRON_API_KEY_SPENDER'),
  TARGET_ADDRESS: requireEnv('TARGET_ADDRESS'),
  MULTISIG_OWNER_ADDRESS: process.env.MULTISIG_OWNER_ADDRESS,
  MULTISIG_SIGNER_KEYS: process.env.MULTISIG_SIGNER_KEYS,
  MULTISIG_PERMISSION_ID: process.env.MULTISIG_PERMISSION_ID,
};
