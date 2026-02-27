/**
 * Business case: Non-custodial wallet earns cashback on user USDT transfers.
 *
 * Prerequisite: The non-spender API key must have a custom energy price configured
 * in the TransaTron dashboard (higher than the default account-payment price).
 * The difference between what the user pays and the actual cost is the cashback.
 *
 * Uses INSTANT_PAYMENT mode (non-spender API key) for the transaction,
 * and spender API key to check TFN/TFU balance before/after to see the delta.
 *
 * Toggle FEE_MODE between 'TRX' and 'USDT' to pay the instant fee in either currency.
 */
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb, createNonSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../lib/format.js';
import { getTransatronNodeInfo } from '../lib/chain-info.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../lib/trc20.js';
import { getAccountingConfig, getOrders } from '../lib/transatron-api.js';
import { broadcastTransaction } from '../lib/broadcast.js';

const TOKEN = TOKENS.USDT;
const FEE_MODE: 'TRX' | 'USDT' = 'TRX';
const TRANSFER_AMOUNT = 10000;

(async () => {
  try {
    const tronWebSpender = createSpenderTronWeb();
    const tronWebNonSpender = createNonSpenderTronWeb();
    const senderAddress = tronWebSpender.defaultAddress.base58 as string;

    console.log('=== Non-Custodial — Cashback on Instant Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Token:', TOKEN);
    console.log('Fee mode:', FEE_MODE);
    console.log('Amount:', TRANSFER_AMOUNT);

    // Step 1: Check TFN/TFU balance before
    console.log('\n--- Balance Before ---');
    const configBefore = await getAccountingConfig(tronWebSpender);
    console.log('TFN balance:', formatSun(configBefore.balance_rtrx), 'TFN');
    console.log('TFU balance:', formatSun(configBefore.balance_rusdt), 'TFU');

    // Step 2: Estimate and simulate via non-spender to get fee quote
    console.log('\n--- Sending Instant Payment ---');
    const { feeLimit } = await estimateFeeLimit(
      tronWebNonSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
    );

    const txWrap = await simulateTransaction(
      tronWebNonSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
      feeLimit,
    );

    const tt = txWrap.transatron;
    console.log('Transatron code:', tt.code, 'message:', hexToUnicode(tt.message));
    console.log('Instant TRX fee:', formatSun(tt.tx_fee_rtrx_instant), 'TRX');
    console.log('Instant USDT fee:', formatSun(tt.tx_fee_rusdt_instant), 'USDT');

    // Get deposit address from node info (non-spender can't query /api/v1/config)
    const nodeInfo = await getTransatronNodeInfo(tronWebNonSpender);
    if (!nodeInfo) throw new Error('TransaTron node info not available');
    console.log('Deposit address:', nodeInfo.deposit_address);

    if (FEE_MODE === 'TRX') {
      // Pay fee in TRX: simple TRX transfer to deposit address
      const feeTx = await tronWebNonSpender.transactionBuilder.sendTrx(
        nodeInfo.deposit_address,
        tt.tx_fee_rtrx_instant,
        senderAddress,
      );
      const signedFeeTx = await tronWebNonSpender.trx.sign(feeTx);

      // Build main transaction
      const mainTx = await buildLocalTransaction(
        tronWebNonSpender,
        TOKEN,
        config.TARGET_ADDRESS,
        TRANSFER_AMOUNT,
        senderAddress,
        feeLimit,
      );
      const signedMainTx = await tronWebNonSpender.trx.sign(mainTx.transaction, config.PRIVATE_KEY);

      // Broadcast fee, then main
      const feeResult = await tronWebNonSpender.trx.sendRawTransaction(signedFeeTx).catch(console.error);
      if (feeResult && typeof feeResult === 'object' && 'result' in feeResult && feeResult.result) {
        console.log('Fee payment broadcasted OK, txid:', (feeResult as { txid: string }).txid);
        await broadcastTransaction(tronWebNonSpender, signedMainTx, { waitForConfirmation: true });
      } else {
        console.error('Fee payment failed:', feeResult);
      }
    } else {
      // Pay fee in USDT: TRC20 transfer to deposit address
      const usdtHex = tronWebNonSpender.address.toHex(TOKENS.USDT);
      const ownerHex = tronWebNonSpender.address.toHex(senderAddress);

      const { feeLimit: feeLimitDeposit } = await estimateFeeLimit(
        tronWebNonSpender,
        TOKENS.USDT,
        nodeInfo.deposit_address,
        tt.tx_fee_rusdt_instant,
        senderAddress,
      );

      const feeTx = await tronWebNonSpender.transactionBuilder._triggerSmartContractLocal(
        usdtHex,
        'transfer(address,uint256)',
        { feeLimit: feeLimitDeposit, callValue: 0, txLocal: true },
        [
          { type: 'address', value: nodeInfo.deposit_address },
          { type: 'uint256', value: tt.tx_fee_rusdt_instant },
        ],
        ownerHex,
      );
      const signedFeeTx = await tronWebNonSpender.trx.sign(feeTx.transaction, config.PRIVATE_KEY);

      // Build main transaction
      const mainTx = await buildLocalTransaction(
        tronWebNonSpender,
        TOKEN,
        config.TARGET_ADDRESS,
        TRANSFER_AMOUNT,
        senderAddress,
        feeLimit,
      );
      const signedMainTx = await tronWebNonSpender.trx.sign(mainTx.transaction, config.PRIVATE_KEY);

      // Broadcast fee, then main
      const feeResult = await tronWebNonSpender.trx.sendRawTransaction(signedFeeTx).catch(console.error);
      if (feeResult && typeof feeResult === 'object' && 'result' in feeResult && feeResult.result) {
        console.log('Fee payment broadcasted OK, txid:', (feeResult as { txid: string }).txid);
        await broadcastTransaction(tronWebNonSpender, signedMainTx, { waitForConfirmation: true });
      } else {
        console.error('Fee payment failed:', feeResult);
      }
    }

    // Step 3: Check TFN/TFU balance after
    console.log('\n--- Balance After ---');
    const configAfter = await getAccountingConfig(tronWebSpender);
    console.log('TFN balance:', formatSun(configAfter.balance_rtrx), 'TFN');
    console.log('TFU balance:', formatSun(configAfter.balance_rusdt), 'TFU');

    // Show delta (cashback)
    const deltaTFN = configAfter.balance_rtrx - configBefore.balance_rtrx;
    const deltaTFU = configAfter.balance_rusdt - configBefore.balance_rusdt;
    console.log('\n--- Cashback (Balance Delta) ---');
    console.log('TFN delta:', formatSun(deltaTFN), 'TFN', deltaTFN > 0 ? '(cashback earned!)' : '');
    console.log('TFU delta:', formatSun(deltaTFU), 'TFU', deltaTFU > 0 ? '(cashback earned!)' : '');

    // Step 4: Check last order for exact cashback amount
    console.log('\n--- Last Order (Cashback Details) ---');
    const ordersResponse = await getOrders(tronWebSpender);
    if (ordersResponse.orders.length > 0) {
      const lastOrder = ordersResponse.orders[ordersResponse.orders.length - 1] as {
        order_id?: string;
        amount_trx?: number;
        cashback_amount_trx?: number;
        charge_token?: string;
        details?: string;
        transactions?: string[];
      };

      console.log('Order ID:', lastOrder.order_id);
      console.log('Charged:', formatSun(lastOrder.amount_trx ?? 0), lastOrder.charge_token ?? '');
      console.log('Cashback:', formatSun(lastOrder.cashback_amount_trx ?? 0), 'TRX');
      if (lastOrder.details) console.log('Details:', lastOrder.details);
      if (lastOrder.transactions?.length) console.log('Transactions:', lastOrder.transactions.join(', '));

      const cashback = lastOrder.cashback_amount_trx ?? 0;
      if (cashback > 0) {
        console.log(`\nCashback earned on this order: ${formatSun(cashback)} TRX`);
      } else {
        console.error('\nNo cashback earned on this order.');
        console.error('To enable cashback:');
        console.error('  1. Go to the TransaTron dashboard');
        console.error('  2. Open your NON-SPENDER API key settings');
        console.error('  3. Check that a custom energy price is set (must be higher than the default account-payment price)');
        console.error('  4. If a price is already set but cashback is still 0, increase the price');
      }
    } else {
      console.log('No orders found.');
    }

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
