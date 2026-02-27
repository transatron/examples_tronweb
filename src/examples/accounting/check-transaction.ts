/**
 * Check transaction — look up a transaction by ID and decode hex messages.
 */
import { createNonSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { hexToUnicode, isObjectEmpty } from '../../lib/format.js';

// Set the transaction ID to check
const TX_ID = process.argv[2] || '';

(async () => {
  try {
    if (!TX_ID) {
      console.log('Usage: tsx src/examples/accounting/check-transaction.ts <txID>');
      console.log('Pass a transaction ID as argument.');
      process.exit(1);
    }

    const tronWeb = createNonSpenderTronWeb();

    console.log('=== Check Transaction ===');
    console.log('TX ID:', TX_ID);

    // getTransaction
    console.log('\n--- getTransaction ---');
    const txReceipt = await tronWeb.trx.getTransaction(TX_ID).catch((err) => {
      console.error('Error fetching transaction:', err);
      return null;
    });

    if (isObjectEmpty(txReceipt)) {
      console.log('Transaction not found or not yet confirmed.');
    } else {
      console.log('Transaction:', JSON.stringify(txReceipt, null, 2));
      const ret = (txReceipt as { ret?: { contractRet: string }[] }).ret;
      if (ret?.[0]) {
        console.log('Contract result:', ret[0].contractRet);
      }
    }

    // getTransactionInfo
    console.log('\n--- getTransactionInfo ---');
    const txInfo = await tronWeb.trx.getTransactionInfo(TX_ID).catch((err) => {
      console.error('Error fetching transaction info:', err);
      return null;
    });

    if (isObjectEmpty(txInfo)) {
      console.log('Transaction info not found or not yet confirmed.');
    } else {
      console.log('Transaction info:', JSON.stringify(txInfo, null, 2));

      // Decode any hex messages
      const info = txInfo as unknown as Record<string, unknown>;
      if (typeof info.resMessage === 'string') {
        console.log('Decoded resMessage:', hexToUnicode(info.resMessage));
      }
    }

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
