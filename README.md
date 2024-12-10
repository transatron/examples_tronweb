# Transatron Integration examples with TronWeb

## Rerefence
- `accountDeposits.js` - Basics of Transatron account management:
    - creating and sending top-up transactions with TRX and USDT
    - reading RTRX and RUSDT balances
- `sendingBulkOrders.js` - Creating a bunch of transactions and sending all of them at once within one bulk order.
- `sendingTransactions.js` - Handles individual transaction processing and broadcasting in the following modes:
    - transaction fee paid from internal account
    - transaction fee paid with instant TRX or USDT payments
    - transaction fee paid with Coupon 
    - alternating 'expiration' parameter for sending "Delayed" transactions for bulk processing in future. 

## Usage
Before you start, please contact [t.me/TransaTronSupport] to obtain API keys. Then, copy-and-paste `.env.example` into `.env` and fill in. 

Then, run `yarn init` to initialize and install dependencies

Run example file with `node src/<filename>.js`