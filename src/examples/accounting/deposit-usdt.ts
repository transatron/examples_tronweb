/**
 * Deposit USDT to TransaTron account.
 * Gets deposit address from api/v1/config (payment_address), sends USDT, verifies TFU credit.
 * Uses spender API key.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun } from '../../lib/format.js';
import { getTransatronNodeInfo } from '../../lib/chain-info.js';
import { getAccountingConfig } from '../../lib/transatron-api.js';
import { estimateFeeLimit, buildLocalTransaction } from '../../lib/trc20.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { sleep } from '../../lib/sleep.js';

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Deposit USDT ===');
    console.log('Sender:', senderAddress);

    // Get deposit address and min deposit amount
    const accountingConfig = await getAccountingConfig(tronWeb);
    const depositAddress = accountingConfig.payment_address;

    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

    const depositAmount = nodeInfo.rusdt_min_deposit;

    console.log('Deposit address:', depositAddress);
    console.log('Min deposit:', formatSun(depositAmount), 'USDT');
    console.log('TFU balance before:', formatSun(accountingConfig.balance_rusdt), 'TFU');

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
    console.log('TFU balance after:', formatSun(configAfter.balance_rusdt), 'TFU');

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
