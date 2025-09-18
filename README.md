# Transatron Integration examples with TronWeb

## Rerefence
- [accountDeposits.js](./src/accountDeposits.js) - Basics of Transatron account management:
    - creating and sending top-up transactions with TRX and USDT
    - reading RTRX and RUSDT balances
- [sendingTransactions.js](./src/sendingTransactions.js) - Handles individual transaction processing and broadcasting in the following modes:
    - transaction fee paid from internal account
    - transaction fee paid with instant TRX or USDT payments
    - transaction fee paid with Coupon 
    - alternating 'expiration' parameter for sending "Delayed" transactions for bulk processing in future. 

## Usage
Before you start, please contact [TransaTronSupport](https://t.me/TransaTronSupport) to obtain API keys. Then, copy-and-paste `.env.example` into `.env` and fill in. 

Then, run `yarn init` or `npm i` to initialize and install dependencies

Run example file with `npm run sendtx:dev`