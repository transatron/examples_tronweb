/**
 * Send TRX from a MULTISIG owner account — demonstrates multi-signature transactions
 * through TransaTron. Uses the spender key (company account payment mode) to broadcast.
 *
 * ## What multisig adds
 *
 * A TRON account can require ≥2 signatures (an active permission with threshold > 1) before
 * a transaction is valid. TransaTron supports multisig for `TransferContract`,
 * `TriggerSmartContract`, and `CreateSmartContract`. When such a transaction is broadcast,
 * the node burns a dynamic `multiSignFee` (currently ~1 TRX) on top of the usual fee.
 *
 * TransaTron **pre-funds the owner** so the owner's own TRX balance is untouched — the
 * `multiSignFee` is folded into the existing `tx_fee_burn_trx` field (there is no separate
 * field for it).
 *
 * ## Requirements
 *
 * This example only runs against a REAL, already-configured multisig account: the owner must
 * have an active permission whose keys match `MULTISIG_SIGNER_KEYS`, and the account must be
 * funded enough to satisfy the transfer. Configure via the optional env vars below.
 *
 * See FAQ: https://docs.transatron.io/faq#what-happens-when-i-send-a-multisig-transaction
 */
import { config } from '../../config/env.js';
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { prepareTransaction } from '../../lib/tx-prepare.js';
import { broadcastTransaction } from '../../lib/broadcast.js';
import { hexToUnicode, formatSun } from '../../lib/format.js';
import type { MutableTransaction } from '../../types/index.js';

// Small, deterministic-ish amount so repeated runs stay cheap. Random jitter keeps txIDs unique.
const amountSun = Math.floor(Math.random() * 10_000) + 1;

(async () => {
  try {
    // --- Read multisig config (all OPTIONAL — placeholders only, never real keys in repo) ---
    const ownerAddress = config.MULTISIG_OWNER_ADDRESS;
    const signerKeys = (config.MULTISIG_SIGNER_KEYS ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
    const permissionId = config.MULTISIG_PERMISSION_ID
      ? parseInt(config.MULTISIG_PERMISSION_ID, 10)
      : 2;

    // Clean, secret-free abort if the multisig account isn't configured.
    if (!ownerAddress) {
      console.log(
        'MULTISIG_OWNER_ADDRESS is not set. This example requires a real, funded multisig ' +
          'account. See README (send-trx-multisig) for setup.',
      );
      return;
    }
    if (signerKeys.length < 2) {
      console.log(
        `MULTISIG_SIGNER_KEYS must contain at least 2 comma-separated private keys ` +
          `(found ${signerKeys.length}). Aborting without broadcasting. ` +
          `Never commit real keys — configure them locally in .env.stage / .env.prod.`,
      );
      return;
    }

    const tronWeb = createSpenderTronWeb();

    console.log('=== Send TRX (multisig) ===');
    console.log('Owner (multisig sender):', ownerAddress);
    console.log('Target:', config.TARGET_ADDRESS);
    console.log('Amount:', amountSun, 'SUN');
    console.log('Permission_id:', permissionId);
    console.log('Signer count:', signerKeys.length);

    // 1. Build the TRX transfer FROM the multisig owner.
    const rawTx = (await tronWeb.transactionBuilder.sendTrx(
      config.TARGET_ADDRESS,
      amountSun,
      ownerAddress,
    )) as MutableTransaction;

    // 2. Tag the contract with the multisig permission id. `TransactionContract` already
    //    declares `Permission_id?: number`, so this is set before the txID is (re)computed.
    rawTx.raw_data.contract[0].Permission_id = permissionId;

    // 3. Solidify the reference block and recompute the txID (prepareTransaction recomputes it).
    //    Permission_id is part of raw_data, so it must already be set before this step.
    const unsignedTx = await prepareTransaction(tronWeb, rawTx);

    // 4. Collect signatures — one multiSign() call per signer key. Sign ONLY after the txID is
    //    final (steps 2–3). Each call appends a signature; assert we end up with ≥2.
    let signedTx = await tronWeb.trx.multiSign(unsignedTx, signerKeys[0], permissionId);
    console.log(`Signature added by signer #1 — total signatures: ${signedTx.signature.length}`);
    for (let i = 1; i < signerKeys.length; i++) {
      signedTx = await tronWeb.trx.multiSign(signedTx, signerKeys[i], permissionId);
      console.log(
        `Signature added by signer #${i + 1} — total signatures: ${signedTx.signature.length}`,
      );
    }

    if (signedTx.signature.length < 2) {
      console.log('Multisig requires at least 2 signatures — aborting without broadcasting.');
      return;
    }

    // 5. Broadcast through TransaTron (resource delegation happens at broadcast time).
    const result = await broadcastTransaction(tronWeb, signedTx, { waitForConfirmation: true });

    // 6. Surface the TransaTron extension object.
    const tt = result.transatron;
    if (tt) {
      console.log('--- TransaTron ---');
      console.log('Code:', tt.code);
      console.log('Message:', hexToUnicode(tt.message)); // TransaTron messages are hex-encoded
      console.log('tx_fee_burn_trx:', formatSun(tt.tx_fee_burn_trx), 'TRX');
      console.log(
        '  ^ This figure INCLUDES the dynamic ~1 TRX MultiSignFee the node burns for multisig ' +
          'transactions. TransaTron pre-funds the owner, so the owner account TRX balance is ' +
          'unaffected. There is no separate fee field — the MultiSignFee is folded into ' +
          'tx_fee_burn_trx.',
      );
    }
    console.log('On-chain txid:', result.txid);

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
