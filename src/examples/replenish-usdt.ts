/**
 * USDT balance replenisher for TransaTron account.
 * Checks TFU balance against a threshold and deposits USDT if below.
 * Uses spender API key.
 */
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun } from '../lib/format.js';
import { getTransatronNodeInfo } from '../lib/chain-info.js';
import { getAccountingConfig } from '../lib/transatron-api.js';
import { estimateFeeLimit, buildLocalTransaction } from '../lib/trc20.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { sleep } from '../lib/sleep.js';

const THRESHOLD_USDT = 300_000_000; // 300 USDT — replenish when balance drops below this
const TOP_UP_USDT = 15_000_000; //  15 USDT — amount to deposit

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Replenish USDT ===');
    console.log('Sender:', senderAddress);
    console.log('Threshold:', formatSun(THRESHOLD_USDT), 'TFU');
    console.log('Top-up amount:', formatSun(TOP_UP_USDT), 'USDT');

    // Check current TFU balance
    const accountingConfig = await getAccountingConfig(tronWeb);
    const balanceBefore = accountingConfig.balance_rusdt;
    console.log('TFU balance:', formatSun(balanceBefore), 'TFU');

    if (balanceBefore >= THRESHOLD_USDT) {
      console.log('Balance is above threshold — no replenishment needed.');
      return;
    }

    console.log('Balance is below threshold — depositing USDT...');

    // Get deposit address and min deposit amount
    const depositAddress = accountingConfig.payment_address;
    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

    const depositAmount = Math.max(TOP_UP_USDT, nodeInfo.rusdt_min_deposit);

    console.log('Deposit address:', depositAddress);
    console.log('Min deposit:', formatSun(nodeInfo.rusdt_min_deposit), 'USDT');
    console.log('Deposit amount:', formatSun(depositAmount), 'USDT');

    // Check wallet USDT balance
    const usdtContract = await tronWeb.contract().at(TOKENS.USDT);
    const walletBalance = Number(await usdtContract.methods.balanceOf(senderAddress).call());
    console.log('Wallet USDT balance:', formatSun(walletBalance), 'USDT');
    if (walletBalance < depositAmount) {
      throw new Error(
        `Insufficient USDT balance: ${formatSun(walletBalance)} USDT, need at least ${formatSun(depositAmount)} USDT`,
      );
    }

    // Estimate fee limit
    const { feeLimit } = await estimateFeeLimit(
      tronWeb,
      TOKENS.USDT,
      depositAddress,
      depositAmount,
      senderAddress,
    );

    // Build local, sign, broadcast
    const localTx = await buildLocalTransaction(
      tronWeb,
      TOKENS.USDT,
      depositAddress,
      depositAmount,
      senderAddress,
      feeLimit,
    );

    const signedTx = await tronWeb.trx.sign(localTx.transaction, config.PRIVATE_KEY);
    await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    // Verify TFU credit
    console.log('Waiting 10s for deposit to be credited...');
    await sleep(10_000);
    const configAfter = await getAccountingConfig(tronWeb);
    const balanceAfter = configAfter.balance_rusdt;

    console.log('TFU balance before:', formatSun(balanceBefore), 'TFU');
    console.log('TFU balance after:', formatSun(balanceAfter), 'TFU');
    console.log('Delta:', formatSun(balanceAfter - balanceBefore), 'TFU');

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
