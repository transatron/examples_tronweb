/**
 * Check balances — TRX, TRC20, chain params, node info, TFN/TFU balances.
 * Uses non-spender API key (read-only operations).
 */
import { TOKENS } from '../../config/tokens.js';
import { createNonSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { getChainParams, getTransatronNodeInfo } from '../../lib/chain-info.js';

(async () => {
  try {
    const tronWeb = createNonSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Check Balances ===');
    console.log('Address:', senderAddress);

    // TRX balance
    const trxBalance = await tronWeb.trx.getBalance(senderAddress);
    console.log('TRX Balance:', trxBalance / 1_000_000);

    // TRC20 balances
    for (const [symbol, address] of Object.entries(TOKENS)) {
      try {
        const contract = await tronWeb.contract().at(address);
        const balance = await contract.methods.balanceOf(senderAddress).call();
        const decimals = await contract.methods.decimals().call();
        const formatted = Number(balance) / Math.pow(10, Number(decimals));
        console.log(`${symbol} Balance:`, formatted);
      } catch {
        console.log(`${symbol}: unable to read balance`);
      }
    }

    // Chain parameters
    const params = await getChainParams(tronWeb);
    console.log('--- Chain Parameters ---');
    console.log('Energy Fee:', params.energyFee);
    console.log('Bandwidth Fee:', params.transactionFee);
    console.log('Total Energy Limit:', params.totalEnergyLimit);
    console.log('Total Bandwidth Limit:', params.totalNetLimit);

    // TransaTron node info
    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (nodeInfo) {
      console.log('--- TransaTron Info ---');
      console.log('Deposit address:', nodeInfo.deposit_address);
      console.log('TFN token:', nodeInfo.rtrx_token_address);
      console.log('TFU token:', nodeInfo.rusdt_token_address);
      console.log('Min USDT deposit:', nodeInfo.rusdt_min_deposit);
      console.log('Min TRX deposit:', nodeInfo.rtrx_min_deposit);
      console.log('TRX price:', nodeInfo.trx_price);

      // TFN/TFU balances
      const tfnContract = await tronWeb.contract().at(nodeInfo.rtrx_token_address);
      const tfuContract = await tronWeb.contract().at(nodeInfo.rusdt_token_address);
      const tfnBalance = await tfnContract.methods.balanceOf(senderAddress).call();
      const tfuBalance = await tfuContract.methods.balanceOf(senderAddress).call();
      console.log('TFN Balance:', tfnBalance.toString());
      console.log('TFU Balance:', tfuBalance.toString());
    } else {
      console.log('TransaTron node info not available');
    }

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
