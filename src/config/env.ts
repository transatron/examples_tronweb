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
};
