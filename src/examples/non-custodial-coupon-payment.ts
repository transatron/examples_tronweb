/**
 * Business case: Non-custodial wallet lets users pay for USDT transactions
 * via card or bonus points. Company creates a coupon to cover the fee,
 * user redeems it when broadcasting.
 *
 * Flow:
 * 1. Company estimates the fee and creates a coupon (spender key)
 * 2. "In production, company charges user via card/bonus points here"
 * 3. User builds, signs, attaches coupon, and broadcasts (non-spender key)
 * 4. Company verifies coupon usage and checks account balance
 */
import { config } from '../config/env.js';
import { TOKENS } from '../config/tokens.js';
import { createSpenderTronWeb, createNonSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../lib/format.js';
import { estimateFeeLimit, simulateTransaction, buildLocalTransaction } from '../lib/trc20.js';
import { prepareTransaction } from '../lib/tx-prepare.js';
import { createCoupon, getCoupon, getAccountingConfig } from '../lib/transatron-api.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import type { MutableTransaction, SignedTransactionWithCoupon } from '../types/index.js';

const TOKEN = TOKENS.USDT;
const TRANSFER_AMOUNT = 10000;

(async () => {
  try {
    // === Setup ===
    const tronWebSpender = createSpenderTronWeb();
    const tronWebNonSpender = createNonSpenderTronWeb();
    const senderAddress = tronWebSpender.defaultAddress.base58 as string;

    console.log('=== Non-Custodial — Coupon Payment (Card/Bonus Points) ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Token:', TOKEN);
    console.log('Amount:', TRANSFER_AMOUNT);

    // === Step 1: Company side — estimate fee and create coupon ===
    console.log('\n--- Company: Estimate Fee ---');

    const { feeLimit } = await estimateFeeLimit(
      tronWebSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
    );

    const txWrap = await simulateTransaction(
      tronWebSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
      feeLimit,
    );
    const tt = txWrap.transatron;
    console.log('Transatron code:', tt.code, 'message:', hexToUnicode(tt.message));
    console.log(
      'Account fees:',
      formatSun(tt.tx_fee_rtrx_account),
      'TFN /',
      formatSun(tt.tx_fee_rusdt_account),
      'TFU',
    );

    console.log('\n--- Company: Create Coupon ---');
    const couponResponse = await createCoupon(tronWebSpender, {
      rtrx_limit: 0,
      usdt_transactions: 1,
      address: senderAddress,
      valid_to: Date.now() + 10 * 60 * 1000, // 10 min validity
    });

    if (couponResponse.code !== 'SUCCESS') {
      throw new Error(`Coupon creation failed: ${couponResponse.code}`);
    }

    const couponId = couponResponse.coupon.id;
    console.log('Coupon ID:', couponId);
    console.log('Coupon limit:', formatSun(couponResponse.coupon.rtrx_limit), 'TRX');
    console.log(
      'Account balance: TFN:',
      formatSun(couponResponse.balance_rtrx),
      '/ TFU:',
      formatSun(couponResponse.balance_rusdt),
    );

    // In production, the company would charge the user via card/bonus points here
    console.log('\n[In production, company charges user via card/bonus points here]');

    // === Step 2: User side — build, attach coupon, broadcast ===
    console.log('\n--- User: Build & Broadcast with Coupon ---');

    const localTx = await buildLocalTransaction(
      tronWebNonSpender,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
      feeLimit,
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(tronWebNonSpender, localTx.transaction as MutableTransaction);
    const signedTx = (await tronWebNonSpender.trx.sign(
      unsignedTx,
      config.PRIVATE_KEY,
    )) as SignedTransactionWithCoupon;
    signedTx.coupon = couponId;

    // Broadcast through non-spender (coupon redemption uses non-spender key)
    await broadcastTransaction(tronWebNonSpender, signedTx, { waitForConfirmation: true });

    // === Step 3: Company side — verify coupon ===
    console.log('\n--- Company: Verify Coupon ---');
    const couponAfter = await getCoupon(tronWebSpender, couponId);

    if (couponAfter.code !== 'SUCCESS') {
      console.error('Failed to fetch coupon:', couponAfter.code);
    } else {
      const c = couponAfter.coupon;
      if (c.tx_id) {
        console.log('Coupon spent for transaction:', c.tx_id);
        console.log(
          'TRX spent:',
          formatSun(c.rtrx_spent ?? 0),
          'TRX (limit was',
          formatSun(c.rtrx_limit),
          'TRX)',
        );
        const returned = c.rtrx_limit - (c.rtrx_spent ?? 0);
        if (returned > 0) {
          console.log('Remaining', formatSun(returned), 'TRX returned to account');
        }
      } else {
        console.log('Coupon has not been spent yet');
      }
    }

    // === Step 4: Company side — check account ===
    console.log('\n--- Company: Account Summary ---');
    const accountConfig = await getAccountingConfig(tronWebSpender);
    console.log('TFN balance:', formatSun(accountConfig.balance_rtrx), 'TFN');
    console.log('TFU balance:', formatSun(accountConfig.balance_rusdt), 'TFU');
    console.log('Active coupons:', accountConfig.active_coupons_count);
    console.log('Balance on coupons:', formatSun(accountConfig.balance_on_coupons_rtrx), 'TRX');

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
