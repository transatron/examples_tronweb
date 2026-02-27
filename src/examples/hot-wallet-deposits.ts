/**
 * Business case: Merchant deposit flow — user pays USDT to a merchant wallet,
 * merchant sweeps funds to the hot wallet.
 *
 * Simulates the full cycle:
 * 1. Generate a temporary merchant wallet
 * 2. Hot wallet sends USDT to merchant wallet (simulating a user deposit)
 * 3. Merchant wallet sweeps USDT to hot wallet (TARGET_ADDRESS)
 *
 * Both steps use ACCOUNT_PAYMENT mode (spender API key) — fees deducted
 * from company's prepaid TFN/TFU balance.
 */
import { TronWeb } from 'tronweb';
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../lib/trc20.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { sleep } from '../lib/sleep.js';

const TOKEN = TOKENS.USDT;
const DEPOSIT_AMOUNT = 10000; // amount the "user" deposits to the merchant

(async () => {
  try {
    // === Setup ===
    const tronWebHotWallet = createSpenderTronWeb();
    const hotWalletAddress = tronWebHotWallet.defaultAddress.base58 as string;

    console.log('=== Hot Wallet — Merchant Deposit Flow ===');
    console.log('Hot wallet:', hotWalletAddress);
    console.log('Token:', TOKEN);
    console.log('Deposit amount:', DEPOSIT_AMOUNT);

    // Generate a temporary merchant wallet
    const tempAccount = await TronWeb.createAccount();
    console.log('\nGenerated temp merchant wallet:');
    console.log('  Address:', tempAccount.address.base58);
    console.log('  Private key:', tempAccount.privateKey);

    // === Step 1: Simulate user deposit — hot wallet sends USDT to merchant ===
    console.log('\n--- Step 1: User deposit (hot wallet → merchant) ---');

    const { feeLimit: feeLimit1 } = await estimateFeeLimit(
      tronWebHotWallet,
      TOKEN,
      tempAccount.address.base58,
      DEPOSIT_AMOUNT,
      hotWalletAddress,
    );

    const txWrap1 = await simulateTransaction(
      tronWebHotWallet,
      TOKEN,
      tempAccount.address.base58,
      DEPOSIT_AMOUNT,
      hotWalletAddress,
      feeLimit1,
    );
    const tt1 = txWrap1.transatron;
    console.log('Transatron code:', tt1.code, 'message:', hexToUnicode(tt1.message));
    console.log('Account fee:', formatSun(tt1.tx_fee_rtrx_account), 'TFN /', formatSun(tt1.tx_fee_rusdt_account), 'TFU');

    const localTx1 = await buildLocalTransaction(
      tronWebHotWallet,
      TOKEN,
      tempAccount.address.base58,
      DEPOSIT_AMOUNT,
      hotWalletAddress,
      feeLimit1,
    );
    const signedTx1 = await tronWebHotWallet.trx.sign(localTx1.transaction, config.PRIVATE_KEY);
    await broadcastTransaction(tronWebHotWallet, signedTx1, { waitForConfirmation: true });

    console.log('User deposit confirmed.');
    await sleep(2000);

    // === Step 2: Merchant sweep — merchant sends USDT to hot wallet ===
    console.log('\n--- Step 2: Merchant sweep (merchant → hot wallet) ---');

    // Create a new TronWeb instance for the merchant wallet with spender API key
    const tronWebMerchant = new TronWeb({
      fullHost: config.API,
      eventServer: config.API,
      privateKey: tempAccount.privateKey,
      headers: {
        'TRANSATRON-API-KEY': config.TRANSATRON_API_KEY_SPENDER,
      },
    });
    const merchantAddress = tronWebMerchant.defaultAddress.base58 as string;

    const { feeLimit: feeLimit2 } = await estimateFeeLimit(
      tronWebMerchant,
      TOKEN,
      config.TARGET_ADDRESS,
      DEPOSIT_AMOUNT,
      merchantAddress,
    );

    const txWrap2 = await simulateTransaction(
      tronWebMerchant,
      TOKEN,
      config.TARGET_ADDRESS,
      DEPOSIT_AMOUNT,
      merchantAddress,
      feeLimit2,
    );
    const tt2 = txWrap2.transatron;
    console.log('Transatron code:', tt2.code, 'message:', hexToUnicode(tt2.message));
    console.log('Account fee:', formatSun(tt2.tx_fee_rtrx_account), 'TFN /', formatSun(tt2.tx_fee_rusdt_account), 'TFU');

    const localTx2 = await buildLocalTransaction(
      tronWebMerchant,
      TOKEN,
      config.TARGET_ADDRESS,
      DEPOSIT_AMOUNT,
      merchantAddress,
      feeLimit2,
    );
    const signedTx2 = await tronWebMerchant.trx.sign(localTx2.transaction, tempAccount.privateKey);
    await broadcastTransaction(tronWebMerchant, signedTx2, { waitForConfirmation: true });

    console.log('Merchant sweep confirmed.');
    console.log('\n=== Flow complete: user deposited → merchant swept to hot wallet ===');

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
