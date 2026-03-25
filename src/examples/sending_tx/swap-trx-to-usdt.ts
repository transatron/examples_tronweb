/**
 * Swap TRX → USDT via SunSwap Smart Exchange Router + TransaTron.
 *
 * Uses ACCOUNT_PAYMENT mode (spender key). No approve step needed since
 * native TRX is sent as callValue. The router's deployer has staked energy
 * covering execution, so TransaTron only covers bandwidth.
 */
import { config } from '../../config/env.js';
import { TOKENS, CONTRACTS, TRX_ZERO_ADDRESS, WTRX_ADDRESS } from '../../config/tokens.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../../lib/format.js';
import {
  estimateSwapEnergy,
  simulateSwapTransaction,
  buildLocalSwapTransaction,
  type SwapParams,
} from '../../lib/swap.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { getChainParams } from '../../lib/chain-info.js';
import type { MutableTransaction } from '../../types/index.js';

const SWAP_AMOUNT_SUN = 10_000_000; // 10 TRX in SUN
const ROUTER = CONTRACTS.SUN_SWAP_ROUTER;
const FALLBACK_FEE_LIMIT = 200_000_000; // 200 TRX — fallback if energy estimation fails

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Swap TRX → USDT via SunSwap + TransaTron ===');
    console.log('Sender:', senderAddress);
    console.log('Router:', ROUTER);
    console.log('Amount:', SWAP_AMOUNT_SUN, 'SUN (TRX)');

    // ─── Swap TRX → USDT ───────────────────────────────────────────────

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    // Path goes through WTRX as intermediary: TRX → WTRX (V2) → USDT (V3)
    // versionLen: v2 consumes 2 path elements [zero,WTRX], v3 consumes 1 more [USDT]
    const swapParams: SwapParams = {
      path: [TRX_ZERO_ADDRESS, WTRX_ADDRESS, TOKENS.USDT],
      poolVersion: ['v2', 'v3'],
      versionLen: [2n, 1n],
      fees: [0n, 500n, 0n],
      amountIn: BigInt(SWAP_AMOUNT_SUN),
      amountOutMin: 1n, // minimal slippage protection — adjust for production
      recipient: senderAddress,
      deadline,
    };

    // Estimate energy via triggerConstantContract, compute real fee limit
    const energy = await estimateSwapEnergy(tronWeb, ROUTER, swapParams, senderAddress, SWAP_AMOUNT_SUN);
    const { energyFee } = await getChainParams(tronWeb);
    const feeLimit = energy * energyFee || FALLBACK_FEE_LIMIT;
    console.log(`\nEstimated energy: ${energy}, energyFee: ${energyFee}, feeLimit: ${feeLimit} SUN`);

    // Simulate to get TransaTron fee quote
    const txWrap = await simulateSwapTransaction(
      tronWeb,
      ROUTER,
      swapParams,
      senderAddress,
      feeLimit,
      SWAP_AMOUNT_SUN,
    );

    const tt = txWrap.transatron;
    console.log('\nTransaTron fee estimation:');
    console.log('  Code:', tt.code);
    console.log('  Message:', hexToUnicode(tt.message));
    console.log('  Account fees:', formatSun(tt.tx_fee_rtrx_account), 'TFN (internal TRX) /', formatSun(tt.tx_fee_rusdt_account), 'TFU (internal USDT)');
    console.log('  Instant fees:', formatSun(tt.tx_fee_rtrx_instant), 'TFN (internal TRX) /', formatSun(tt.tx_fee_rusdt_instant), 'TFU (internal USDT)');
    console.log('  Burn cost (without TransaTron):', formatSun(tt.tx_fee_burn_trx), 'TRX');
    console.log('  Balance:', formatSun(tt.user_account_balance_rtrx), 'TFN (internal TRX),', formatSun(tt.user_account_balance_rusdt), 'TFU (internal USDT)');

    // Build local transaction, sign, broadcast
    // callValue = SWAP_AMOUNT_SUN because we're sending native TRX
    const localTx = await buildLocalSwapTransaction(
      tronWeb,
      ROUTER,
      swapParams,
      senderAddress,
      feeLimit,
      SWAP_AMOUNT_SUN,
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction);
    const signedTx = await tronWeb.trx.sign(unsignedTx, config.PRIVATE_KEY);
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

    console.log('\nSwap TRX → USDT completed!');
  } catch (error) {
    console.error('Error:', error);
  }
})();
