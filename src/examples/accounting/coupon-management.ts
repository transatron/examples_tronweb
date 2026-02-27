/**
 * Coupon management — create, read, and delete coupons.
 * Uses spender API key (company privilege).
 */
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun } from '../../lib/format.js';
import { createCoupon, getCoupon, deleteCoupon } from '../../lib/transatron-api.js';

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Coupon Management ===');
    console.log('Address:', senderAddress);

    // Create coupon
    console.log('\n--- Create Coupon ---');
    const response = await createCoupon(tronWeb, {
      rtrx_limit: 0,
      usdt_transactions: 1,
      address: senderAddress,
      valid_to: Date.now() + 10 * 60 * 1000,
    });

    if (response.code !== 'SUCCESS') {
      throw new Error(`Coupon creation failed: ${response.code}`);
    }

    const couponId = response.coupon.id;
    console.log('Coupon ID:', couponId);
    console.log('Coupon limit:', formatSun(response.coupon.rtrx_limit), 'TRX');
    console.log('Account balance: TFN:', formatSun(response.balance_rtrx), '/ TFU:', formatSun(response.balance_rusdt));
    console.log('Balance on active coupons:', formatSun(response.balance_on_coupons_rtrx), 'TFN');

    // Read coupon
    console.log('\n--- Read Coupon ---');
    const getResponse = await getCoupon(tronWeb, couponId);
    if (getResponse.code !== 'SUCCESS') {
      console.error('Failed to read coupon:', getResponse.code);
    } else {
      const c = getResponse.coupon;
      console.log('Coupon ID:', c.id);
      console.log('Address:', c.address);
      console.log('Limit:', formatSun(c.rtrx_limit), 'TRX');
      console.log('Valid to:', new Date(c.valid_to).toISOString());
      if (c.tx_id) {
        console.log('Status: SPENT');
        console.log('Spent for tx:', c.tx_id);
        console.log('TRX spent:', formatSun(c.rtrx_spent ?? 0));
      } else {
        console.log('Status: ACTIVE (not yet used)');
      }
    }

    // Delete coupon
    console.log('\n--- Delete Coupon ---');
    const deleteResult = await deleteCoupon(tronWeb, couponId);
    console.log('Delete result:', deleteResult.code);

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
