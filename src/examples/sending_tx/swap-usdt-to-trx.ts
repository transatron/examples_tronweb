/**
 * Swap USDT → TRX via SunSwap Smart Exchange Router + TransaTron.
 *
 * Uses ACCOUNT_PAYMENT mode (spender key). The router's contract deployer
 * has staked energy covering execution, so TransaTron only covers bandwidth.
 *
 * Flow:
 *   1. Approve USDT spending for the router (if needed)
 *   2. Execute swap: estimate energy → simulate for fee quote → build → sign → broadcast
 */
import { config } from '../../config/env.js';
import { TOKENS, CONTRACTS, TRX_ZERO_ADDRESS, WTRX_ADDRESS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../../lib/format.js';
import {
  estimateApproveFeeLimit,
  simulateApproveTransaction,
  buildLocalApproveTransaction,
} from '../../lib/trc20.js';
import {
  estimateSwapEnergy,
  simulateSwapTransaction,
  buildLocalSwapTransaction,
  type SwapParams,
} from '../../lib/swap.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { getChainParams } from '../../lib/chain-info.js';

const SWAP_AMOUNT = 3_000_000n; // 1 USDT (6 decimals)
const ROUTER = CONTRACTS.SUN_SWAP_ROUTER;
const FALLBACK_FEE_LIMIT = 200_000_000; // 200 TRX — fallback if energy estimation fails

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Swap USDT → TRX via SunSwap + TransaTron ===');
    console.log('Sender:', senderAddress);
    console.log('Router:', ROUTER);
    console.log('Amount:', SWAP_AMOUNT.toString(), 'SUN (USDT)');

    // ─── Step 1: Approve USDT spending for the router ───────────────────

    console.log('\n--- Step 1: Approve USDT for router ---');

    // Check current allowance
    const allowanceResult = await tronWeb.transactionBuilder.triggerConstantContract(
      tronWeb.address.toHex(TOKENS.USDT),
      'allowance(address,address)',
      {},
      [
        { type: 'address', value: senderAddress },
        { type: 'address', value: ROUTER },
      ],
      tronWeb.address.toHex(senderAddress),
    );

    const currentAllowance = BigInt('0x' + (allowanceResult.constant_result?.[0] || '0'));
    console.log('Current USDT allowance for router:', currentAllowance.toString());

    if (currentAllowance < SWAP_AMOUNT) {
      console.log('Allowance insufficient, approving...');

      // Approve a large but JS-safe amount (1 billion USDT = 10^15 smallest units)
      const approveAmount = 1_000_000_000_000_000;

      // Estimate fee for approve
      const { feeLimit: approveFeeLimit } = await estimateApproveFeeLimit(
        tronWeb,
        TOKENS.USDT,
        ROUTER,
        approveAmount,
        senderAddress,
      );

      // Simulate approve to get TransaTron fee quote
      const approveTxWrap = await simulateApproveTransaction(
        tronWeb,
        TOKENS.USDT,
        ROUTER,
        approveAmount,
        senderAddress,
        approveFeeLimit,
      );

      const approveTt = approveTxWrap.transatron;
      console.log('Approve — TransaTron code:', approveTt.code, 'message:', hexToUnicode(approveTt.message));
      console.log(
        'Approve — Account fees:',
        formatSun(approveTt.tx_fee_rtrx_account),
        'TFN (internal TRX) /',
        formatSun(approveTt.tx_fee_rusdt_account),
        'TFU (internal USDT)',
      );

      // Build, sign, broadcast approve
      const approveLocalTx = await buildLocalApproveTransaction(
        tronWeb,
        TOKENS.USDT,
        ROUTER,
        approveAmount,
        senderAddress,
        approveFeeLimit,
      );

      const signedApprove = await tronWeb.trx.sign(approveLocalTx.transaction, config.PRIVATE_KEY);
      await broadcastTransaction(tronWeb, signedApprove, { waitForConfirmation: true });
      console.log('USDT approved for router.');
    } else {
      console.log('Allowance sufficient, skipping approve.');
    }

    // ─── Step 2: Execute swap ───────────────────────────────────────────

    console.log('\n--- Step 2: Swap USDT → TRX ---');

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    // Path goes through WTRX as intermediary: USDT → WTRX (V3) → TRX (V2)
    // versionLen: v3 consumes 2 path elements [USDT,WTRX], v2 consumes 1 more [zero]
    const swapParams: SwapParams = {
      path: [TOKENS.USDT, WTRX_ADDRESS, TRX_ZERO_ADDRESS],
      poolVersion: ['v3', 'v2'],
      versionLen: [2n, 1n],
      fees: [500n, 0n, 0n],
      amountIn: SWAP_AMOUNT,
      amountOutMin: 1n, // minimal slippage protection — adjust for production
      recipient: senderAddress,
      deadline,
    };

    // Estimate energy via triggerConstantContract, compute real fee limit
    const energy = await estimateSwapEnergy(tronWeb, ROUTER, swapParams, senderAddress, 0);
    const { energyFee } = await getChainParams(tronWeb);
    const feeLimit = energy * energyFee || FALLBACK_FEE_LIMIT;
    console.log(`Estimated energy: ${energy}, energyFee: ${energyFee}, feeLimit: ${feeLimit} SUN`);

    // Simulate to get TransaTron fee quote
    const txWrap = await simulateSwapTransaction(tronWeb, ROUTER, swapParams, senderAddress, feeLimit, 0);

    const tt = txWrap.transatron;
    console.log('\nTransaTron fee estimation:');
    console.log('  Code:', tt.code);
    console.log('  Message:', hexToUnicode(tt.message));
    console.log('  Account fees:', formatSun(tt.tx_fee_rtrx_account), 'TFN (internal TRX) /', formatSun(tt.tx_fee_rusdt_account), 'TFU (internal USDT)');
    console.log('  Instant fees:', formatSun(tt.tx_fee_rtrx_instant), 'TFN (internal TRX) /', formatSun(tt.tx_fee_rusdt_instant), 'TFU (internal USDT)');
    console.log('  Burn cost (without TransaTron):', formatSun(tt.tx_fee_burn_trx), 'TRX');
    console.log('  Balance:', formatSun(tt.user_account_balance_rtrx), 'TFN (internal TRX),', formatSun(tt.user_account_balance_rusdt), 'TFU (internal USDT)');

    // Build local transaction, sign, broadcast
    const localTx = await buildLocalSwapTransaction(tronWeb, ROUTER, swapParams, senderAddress, feeLimit, 0);

    const signedTx = await tronWeb.trx.sign(localTx.transaction, config.PRIVATE_KEY);
    const broadcastResult = await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    // Print broadcast TransaTron charges and compare with estimation
    if (broadcastResult.transatron) {
      const btt = broadcastResult.transatron;
      console.log('\nTransaTron broadcast charges:');
      console.log('  Code:', btt.code);
      console.log('  Message:', hexToUnicode(btt.message));
      console.log('  Account fees:', formatSun(btt.tx_fee_rtrx_account ?? 0), 'TFN (internal TRX) /', formatSun(btt.tx_fee_rusdt_account ?? 0), 'TFU (internal USDT)');
      console.log('  Burn TRX:', formatSun(btt.tx_fee_burn_trx), 'TRX');
      console.log('  Balance:', formatSun(btt.user_account_balance_rtrx ?? 0), 'TFN (internal TRX),', formatSun(btt.user_account_balance_rusdt ?? 0), 'TFU (internal USDT)');

      console.log('\n  Comparison with estimation:');
      console.log('    TFN account fee — estimated:', formatSun(tt.tx_fee_rtrx_account), '/ actual:', formatSun(btt.tx_fee_rtrx_account ?? 0));
      console.log('    TFU account fee — estimated:', formatSun(tt.tx_fee_rusdt_account), '/ actual:', formatSun(btt.tx_fee_rusdt_account ?? 0));
      console.log('    Burn TRX       — estimated:', formatSun(tt.tx_fee_burn_trx), '/ actual:', formatSun(btt.tx_fee_burn_trx));
    }

    // Fetch on-chain receipt for energy consumption breakdown
    const txInfo = (await tronWeb.trx.getTransactionInfo(signedTx.txID)) as {
      receipt?: {
        energy_usage_total?: number;
        origin_energy_usage?: number;
        energy_fee?: number;
        net_fee?: number;
        energy_penalty_total?: number;
      };
    };

    if (txInfo.receipt) {
      const r = txInfo.receipt;
      const totalEnergy = r.energy_usage_total ?? 0;
      const deployerEnergy = r.origin_energy_usage ?? 0;
      const callerEnergy = totalEnergy - deployerEnergy;
      console.log('\nOn-chain energy breakdown:');
      console.log('  Total energy consumed:', totalEnergy);
      console.log('  Deployer-staked (origin_energy_usage):', deployerEnergy, `(${totalEnergy ? Math.round((deployerEnergy / totalEnergy) * 100) : 0}%)`);
      console.log('  Caller energy:', callerEnergy, `→ ${formatSun(r.energy_fee ?? 0)} TRX`);
      console.log('  Bandwidth fee (net_fee):', formatSun(r.net_fee ?? 0), 'TRX');
      if (r.energy_penalty_total) {
        console.log('  Energy penalty:', r.energy_penalty_total);
      }
    }

    console.log('\nSwap USDT → TRX completed!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
