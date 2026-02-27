/**
 * Estimate fees for a TRC20 transfer without sending.
 * Shows energy estimate, TransaTron fee quotes, and bandwidth calculation.
 */
import { config } from '../../config/env.js';
import { TOKENS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../../lib/format.js';
import { getChainParams } from '../../lib/chain-info.js';
import { estimateEnergy, simulateTransaction } from '../../lib/trc20.js';

const TOKEN = TOKENS.USDC;
const TRANSFER_AMOUNT = 10_000;

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Estimate Fees ===');
    console.log('Sender:', senderAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Token:', TOKEN);
    console.log('Amount:', TRANSFER_AMOUNT);

    const chainParams = await getChainParams(tronWeb);

    // Step 1: Estimate energy via triggerConstantContract
    let energy: number;
    try {
      energy = await estimateEnergy(tronWeb, TOKEN, config.TARGET_ADDRESS, TRANSFER_AMOUNT, senderAddress);
      console.log('Estimated energy:', energy);
    } catch {
      energy = 132_000; // fallback for unactivated addresses
      console.log('Energy estimation failed, using fallback:', energy);
    }

    const feeLimit = energy * chainParams.energyFee;
    console.log('Fee limit:', feeLimit, 'SUN (', formatSun(feeLimit), 'TRX )');

    // Step 2: Simulate with txLocal: true
    const txWrap = await simulateTransaction(
      tronWeb,
      TOKEN,
      config.TARGET_ADDRESS,
      TRANSFER_AMOUNT,
      senderAddress,
      feeLimit,
    );

    const tt = txWrap.transatron;
    console.log('\n--- TransaTron Fee Quotes ---');
    console.log('Code:', tt.code, '| Message:', hexToUnicode(tt.message));
    console.log(
      'Account payment:',
      formatSun(tt.tx_fee_rtrx_account),
      'TFN /',
      formatSun(tt.tx_fee_rusdt_account),
      'TFU',
    );
    console.log(
      'Instant payment:',
      formatSun(tt.tx_fee_rtrx_instant),
      'TRX /',
      formatSun(tt.tx_fee_rusdt_instant),
      'USDT',
    );
    console.log('Burn TRX (no TransaTron):', formatSun(tt.tx_fee_burn_trx), 'TRX');
    console.log(
      'Current balance:',
      formatSun(tt.user_account_balance_rtrx),
      'TFN,',
      formatSun(tt.user_account_balance_rusdt),
      'TFU',
    );
    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
