/**
 * Query orders — fetch accounting config and order history from TransaTron.
 */
import { createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { getAccountingConfig, getOrders } from '../../lib/transatron-api.js';

(async () => {
  try {
    const tronWeb = createSpenderTronWeb();

    console.log('=== Query Orders ===');

    // Get accounting config
    console.log('\n--- Accounting Config ---');
    const config = await getAccountingConfig(tronWeb);
    console.log('Config:', config);

    // Get orders
    console.log('\n--- Orders ---');
    const orders = await getOrders(tronWeb);
    console.log('Orders:', orders);

    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
