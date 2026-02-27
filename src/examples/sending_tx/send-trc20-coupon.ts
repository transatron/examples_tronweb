/**
 * Send TRC20 — COUPON_PAYMENT mode.
 * Company creates a coupon (spender key), then user redeems it (non-spender key).
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb, createNonSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../../lib/trc20.js';
import { createCoupon, getCoupon } from '../../lib/transatron-api.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import type { SignedTransactionWithCoupon } from '../../types/index.js';

const TOKEN = TOKENS.USDC;

(async () => {
  try {
    const tronWebSpender = createSpenderTronWeb();
    const tronWebNonSpender = createNonSpenderTronWeb();
    const senderAddress = tronWebSpender.defaultAddress.base58 as string;
    const transferAmount = Math.floor(Math.random() * 10000) + 5000;

    console.log('=== Send TRC20 — Coupon Payment ===');
    console.log('Sender:', senderAddress);
    console.log('Amount:', transferAmount);

    // Step 1: Estimate feeLimit
    const { feeLimit } = await estimateFeeLimit(
      tronWebSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
    );

    // Step 2: Simulate to get fee quote (using spender for simulation)
    const txWrap = await simulateTransaction(
      tronWebSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
      feeLimit,
    );

    const tt = txWrap.transatron;
    console.log('Transatron code:', tt.code, 'message:', hexToUnicode(tt.message));

    // Create coupon (company privilege, uses spender key)
    console.log('--- Creating coupon ---');
    const couponResponse = await createCoupon(tronWebSpender, {
      rtrx_limit: 0,
      usdt_transactions: 1,
      address: senderAddress,
      valid_to: Date.now() + 10 * 60 * 1000, // 10 min validity
    });

    if (couponResponse.code !== 'SUCCESS') {
      throw new Error(`Coupon creation failed: ${couponResponse.code}`);
    }

    const couponCode = couponResponse.coupon.id;
    const couponLimit = couponResponse.coupon.rtrx_limit;
    console.log('Coupon ID:', couponCode);
    console.log('Coupon limit:', formatSun(couponLimit), 'TRX');
    console.log('Account balance: TFN:', formatSun(couponResponse.balance_rtrx), '/ TFU:', formatSun(couponResponse.balance_rusdt));

    // Step 3: Build main transaction, sign with non-spender, attach coupon
    const localTx = await buildLocalTransaction(
      tronWebNonSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      transferAmount,
      senderAddress,
      feeLimit,
    );

    const signedTx = (await tronWebNonSpender.trx.sign(
      localTx.transaction,
      config.PRIVATE_KEY,
    )) as SignedTransactionWithCoupon;
    signedTx.coupon = couponCode;

    // Broadcast through non-spender (coupon redemption goes through non-spender key)
    await broadcastTransaction(tronWebNonSpender, signedTx, { waitForConfirmation: true });

    // Verify coupon is spent
    console.log('--- Verifying coupon ---');
    const couponAfter = await getCoupon(tronWebSpender, couponCode);
    if (couponAfter.code !== 'SUCCESS') {
      console.error('Failed to fetch coupon after broadcast:', couponAfter.code);
    } else {
      const c = couponAfter.coupon;
      if (c.tx_id) {
        console.log(`Coupon spent for transaction: ${c.tx_id}`);
        console.log(`TRX spent: ${formatSun(c.rtrx_spent ?? 0)} TRX (limit was ${formatSun(c.rtrx_limit)} TRX)`);
        const returned = c.rtrx_limit - (c.rtrx_spent ?? 0);
        if (returned > 0) {
          console.log(`Remaining ${formatSun(returned)} TRX returned to account`);
        }
      } else {
        console.log('Coupon has not been spent yet');
      }
    }

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
