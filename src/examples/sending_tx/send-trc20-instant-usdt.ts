/**
 * Send TRC20 — INSTANT_PAYMENT_USDT mode.
 * Fee is paid instantly by sending USDT to TransaTron's deposit address.
 * Uses non-spender API key.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createNonSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun } from '../../lib/format.js';
import { getTransatronNodeInfo } from '../../lib/chain-info.js';
import {
  estimateFeeLimit,
  simulateTransaction,
  buildLocalTransaction,
} from '../../lib/trc20.js';
import { broadcastTransaction } from '../../lib/broadcast.js';

const TOKEN = TOKENS.USDC;

(async () => {
  try {
    const tronWeb = createNonSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;
    const transferAmount = Math.floor(Math.random() * 10000) + 5000;

    console.log('=== Send TRC20 — Instant USDT Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Amount:', transferAmount);

    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (!nodeInfo) throw new Error('TransaTron node info not available');

    // Step 1: Estimate feeLimit for main transaction
    const { feeLimit } = await estimateFeeLimit(
      tronWeb,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
    );

    // Step 2: Simulate to get fee quote
    const txWrap = await simulateTransaction(
      tronWeb,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
      feeLimit,
    );

    const tt = txWrap.transatron;
    console.log('Instant USDT fee:', formatSun(tt.tx_fee_rusdt_instant), 'USDT');

    // Step 3: Create and sign USDT fee transaction to deposit address
    const usdtHex = tronWeb.address.toHex(TOKENS.USDT);
    const ownerHex = tronWeb.address.toHex(senderAddress);

    const { feeLimit: feeLimitDeposit } = await estimateFeeLimit(
      tronWeb,
      TOKENS.USDT,
      nodeInfo.deposit_address,
      tt.tx_fee_rusdt_instant,
      senderAddress,
    );

    const feeTx = await tronWeb.transactionBuilder._triggerSmartContractLocal(
      usdtHex,
      'transfer(address,uint256)',
      { feeLimit: feeLimitDeposit, callValue: 0, txLocal: true },
      [
        { type: 'address', value: nodeInfo.deposit_address },
        { type: 'uint256', value: tt.tx_fee_rusdt_instant },
      ],
      ownerHex,
    );
    const signedFeeTx = await tronWeb.trx.sign(feeTx.transaction, config.PRIVATE_KEY);

    // Step 4: Build main transaction, sign
    const mainTx = await buildLocalTransaction(
      tronWeb,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
      feeLimit,
    );
    const signedTx = await tronWeb.trx.sign(mainTx.transaction, config.PRIVATE_KEY);

    // Step 5: Broadcast fee transaction
    const feeResult = await tronWeb.trx.sendRawTransaction(signedFeeTx).catch(console.error);
    if (feeResult && typeof feeResult === 'object' && 'result' in feeResult && feeResult.result) {
      console.log('Fee payment broadcasted OK, txid:', (feeResult as { txid: string }).txid);
      // Step 6: Broadcast main transaction
      await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });
    } else {
      console.error('Fee payment failed:', feeResult);
    }

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
