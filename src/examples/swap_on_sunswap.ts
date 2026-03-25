/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USDT ↔ TRX Swap via SunSwap Smart Exchange Router + TransaTron
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the business-case overview that demonstrates both swap directions
 * in a single script. For focused, single-direction examples, see:
 *   - src/examples/sending_tx/swap-usdt-to-trx.ts  (USDT → TRX)
 *   - src/examples/sending_tx/swap-trx-to-usdt.ts  (TRX → USDT)
 *
 * ── Why SunSwap? ──────────────────────────────────────────────────────────
 * SunSwap is the largest DEX on TRON. Its Smart Exchange Router
 * (TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj) aggregates liquidity across V2 and
 * V3 pools, routing through the best-priced path automatically.
 *
 * ── Why TransaTron? ───────────────────────────────────────────────────────
 * On TRON, every transaction consumes bandwidth and energy. Without
 * TransaTron, the sender would burn TRX for both resources — which is
 * significantly more expensive than using TransaTron's prepaid model.
 *
 * TransaTron acts as the fullHost (TRON API proxy). When a transaction is
 * broadcast through TransaTron, it delegates resources at broadcast time:
 *   - Bandwidth is covered by TransaTron (the "essential" part)
 *   - Energy is covered by whoever has staked it for the contract
 *
 * ── Energy coverage model ─────────────────────────────────────────────────
 * The deployer of the SunSwap router has staked energy to cover contract
 * execution costs. This means:
 *   1. triggerConstantContract shows low/zero energy for the caller
 *   2. TransaTron's fee quote covers only essential fees
 *   3. The total cost per swap is dramatically lower than burning TRX
 *
 * This is a common pattern for high-traffic DeFi contracts on TRON — the
 * protocol operator stakes energy to subsidize user costs, and TransaTron
 * handles the remaining bandwidth cost efficiently.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { config } from '../config/env.js';
import { TOKENS, CONTRACTS, TRX_ZERO_ADDRESS, WTRX_ADDRESS } from '../config/tokens.js';
import { createSpenderTronWeb } from '../lib/tronweb-factory.js';
import { formatSun, hexToUnicode } from '../lib/format.js';
import {
  estimateApproveFeeLimit,
  simulateApproveTransaction,
  buildLocalApproveTransaction,
} from '../lib/trc20.js';
import {
  estimateSwapEnergy,
  simulateSwapTransaction,
  buildLocalSwapTransaction,
  type SwapParams,
} from '../lib/swap.js';
import { prepareTransaction } from '../lib/tx-prepare.js';
import { broadcastTransaction } from '../lib/broadcast.js';
import { getChainParams } from '../lib/chain-info.js';
import type { MutableTransaction } from '../types/index.js';

// ── Configuration ─────────────────────────────────────────────────────────
// Change these to control the swap direction and amount.

/** 'USDT_TO_TRX' or 'TRX_TO_USDT' */
const DIRECTION: 'USDT_TO_TRX' | 'TRX_TO_USDT' = 'USDT_TO_TRX';

/** Amount to swap — in the smallest unit of the input token.
 *  USDT: 1_000_000 = 1 USDT (6 decimals)
 *  TRX:  1_000_000 = 1 TRX  (6 decimals) */
const AMOUNT = 1_000_000n;

const ROUTER = CONTRACTS.SUN_SWAP_ROUTER;
const FALLBACK_FEE_LIMIT = 200_000_000; // 200 TRX — fallback if energy estimation fails

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('═══════════════════════════════════════════════════════');
    console.log(' SunSwap + TransaTron — Token Swap');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Direction:', DIRECTION);
    console.log('Amount:', AMOUNT.toString(), 'smallest units');
    console.log('Sender:', senderAddress);
    console.log('Router:', ROUTER);

    // ── Approve USDT if swapping USDT → TRX ─────────────────────────────
    //
    // When swapping TRX → USDT, no approve is needed because native TRX is
    // sent as callValue directly to the contract.
    //
    // When swapping USDT → TRX, the router needs permission to transfer
    // USDT from the sender's account. This is a standard ERC20/TRC20
    // approve pattern.

    if (DIRECTION === 'USDT_TO_TRX') {
      console.log('\n─── Checking USDT approval for router ───');

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
      console.log('Current allowance:', currentAllowance.toString());

      if (currentAllowance < AMOUNT) {
        console.log('Approving USDT for router...');
        // Approve a large but JS-safe amount (1 billion USDT = 10^15 smallest units)
        const approveAmount = 1_000_000_000_000_000;

        // The approve transaction itself needs bandwidth (covered by TransaTron)
        // and minimal energy (approve is a cheap operation).
        const { feeLimit: approveFeeLimit } = await estimateApproveFeeLimit(
          tronWeb,
          TOKENS.USDT,
          ROUTER,
          approveAmount,
          senderAddress,
        );

        // Simulate to see TransaTron's fee quote for the approve
        const approveTxWrap = await simulateApproveTransaction(
          tronWeb,
          TOKENS.USDT,
          ROUTER,
          approveAmount,
          senderAddress,
          approveFeeLimit,
        );

        const att = approveTxWrap.transatron;
        console.log('Approve fee quote —', 'code:', att.code, '/ account:', formatSun(att.tx_fee_rtrx_account), 'TFN (internal TRX)');

        // Build, sign, broadcast the approve
        const approveLocal = await buildLocalApproveTransaction(
          tronWeb,
          TOKENS.USDT,
          ROUTER,
          approveAmount,
          senderAddress,
          approveFeeLimit,
        );
        // Replace reference block with solidified (fork-proof) block
        const unsignedApprove = await prepareTransaction(tronWeb, approveLocal.transaction as MutableTransaction);
        const signedApprove = await tronWeb.trx.sign(unsignedApprove, config.PRIVATE_KEY);
        await broadcastTransaction(tronWeb, signedApprove, { waitForConfirmation: true });
        console.log('Approve confirmed.');
      } else {
        console.log('Allowance sufficient, no approve needed.');
      }
    }

    // ── Execute the swap ────────────────────────────────────────────────
    //
    // The swap path goes through WTRX as intermediary:
    //   USDT → TRX: USDT → WTRX (V3, fee 500) → TRX (V2, fee 0)
    //   TRX → USDT: TRX → WTRX (V2, fee 0) → USDT (V3, fee 500)
    //
    // Key difference between directions:
    //   USDT → TRX: callValue = 0 (USDT is transferred via approve)
    //   TRX → USDT: callValue = amount (native TRX sent with the call)

    console.log('\n─── Executing swap ───');

    const isUsdtToTrx = DIRECTION === 'USDT_TO_TRX';
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 minutes
    const callValue = isUsdtToTrx ? 0 : Number(AMOUNT);

    const swapParams: SwapParams = {
      // Path goes through WTRX: the SunSwap router requires an intermediary
      // for TRX↔USDT swaps since TRX is native (not a token).
      path: isUsdtToTrx
        ? [TOKENS.USDT, WTRX_ADDRESS, TRX_ZERO_ADDRESS]
        : [TRX_ZERO_ADDRESS, WTRX_ADDRESS, TOKENS.USDT],
      poolVersion: isUsdtToTrx ? ['v3', 'v2'] : ['v2', 'v3'],
      // versionLen[i] = number of path elements consumed by poolVersion[i]
      // First pool consumes 2 elements, second consumes 1 more
      versionLen: [2n, 1n],
      fees: isUsdtToTrx ? [500n, 0n, 0n] : [0n, 500n, 0n],
      amountIn: AMOUNT,
      amountOutMin: 1n, // Set to 1 for demo — in production, calculate proper slippage
      recipient: senderAddress,
      deadline,
    };

    // Step 1: Estimate energy
    //
    // Because the router deployer has staked energy, the estimated energy
    // for the caller should be low or zero. This is the key cost advantage.
    const energy = await estimateSwapEnergy(tronWeb, ROUTER, swapParams, senderAddress, callValue);
    const { energyFee } = await getChainParams(tronWeb);
    const feeLimit = energy * energyFee || FALLBACK_FEE_LIMIT;

    console.log(`Energy estimate: ${energy}`);
    console.log(`  → Deployer-staked energy covers contract execution`);
    console.log(`  → Fee limit: ${feeLimit} SUN (${formatSun(feeLimit)} TRX)`);

    // Step 2: Simulate to get TransaTron fee quote
    //
    // The simulation response includes the full TransaTron pricing breakdown:
    //   - tx_fee_rtrx_account / tx_fee_rusdt_account: cost if using account payment (TFN/TFU)
    //   - tx_fee_rtrx_instant / tx_fee_rusdt_instant: cost if using instant payment
    //   - tx_fee_burn_trx: what it would cost to burn TRX without TransaTron
    //   - user_account_balance_*: remaining prepaid balance after this transaction
    const txWrap = await simulateSwapTransaction(
      tronWeb,
      ROUTER,
      swapParams,
      senderAddress,
      feeLimit,
      callValue,
    );

    const tt = txWrap.transatron;
    console.log('\nTransaTron fee estimation:');
    console.log('  Code:', tt.code);
    console.log('  Message:', hexToUnicode(tt.message));
    console.log('  ┌─ Account payment mode ─────────────────────');
    console.log('  │  TFN cost:', formatSun(tt.tx_fee_rtrx_account), 'TFN (internal TRX)');
    console.log('  │  TFU cost:', formatSun(tt.tx_fee_rusdt_account), 'TFU (internal USDT)');
    console.log('  ├─ Instant payment mode ─────────────────────');
    console.log('  │  TFN cost:', formatSun(tt.tx_fee_rtrx_instant), 'TFN (internal TRX)');
    console.log('  │  TFU cost:', formatSun(tt.tx_fee_rusdt_instant), 'TFU (internal USDT)');
    console.log('  ├─ Without TransaTron (burn) ────────────────');
    console.log('  │  Burn cost:', formatSun(tt.tx_fee_burn_trx), 'TRX');
    console.log('  ├─ Account balances ─────────────────────────');
    console.log('  │  TFN:', formatSun(tt.user_account_balance_rtrx), 'TFN (internal TRX)');
    console.log('  │  TFU:', formatSun(tt.user_account_balance_rusdt), 'TFU (internal USDT)');
    console.log('  └────────────────────────────────────────────');

    // The savings are visible: account fees should be much lower than burn cost,
    // especially since the deployer's staked energy eliminates the energy component.

    // Step 3: Build, sign, broadcast
    const localTx = await buildLocalSwapTransaction(
      tronWeb,
      ROUTER,
      swapParams,
      senderAddress,
      feeLimit,
      callValue,
    );

    // Replace reference block with solidified (fork-proof) block
    const unsignedTx = await prepareTransaction(tronWeb, localTx.transaction as MutableTransaction);
    const signedTx = await tronWeb.trx.sign(unsignedTx, config.PRIVATE_KEY);
    const broadcastResult = await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    // ── Broadcast charges ───────────────────────────────────────────────
    //
    // After broadcast, TransaTron returns the actual charges applied.
    // Compare these with the estimation above to verify pricing accuracy.

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

    // ── On-chain energy breakdown ───────────────────────────────────────
    //
    // The receipt from getTransactionInfo shows how energy was split:
    //   - energy_usage_total: total energy consumed by the contract call
    //   - origin_energy_usage: energy provided by the contract deployer's stake
    //   - energy_fee: energy cost paid by the caller (in SUN)
    //   - net_fee: bandwidth cost (in SUN) — covered by TransaTron
    //
    // With deployer energy coverage + TransaTron:
    //   - Energy: mostly covered by deployer's stake (~99%)
    //   - Bandwidth: covered by TransaTron at TFN/TFU rates
    //   - Total out-of-pocket: only the TransaTron account fee

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

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(` Swap ${DIRECTION.replace('_', ' → ').replace('_', ' ')} completed!`);
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('Error:', error);
  }
})();
