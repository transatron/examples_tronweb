var fs = require('fs');
const dotenv = require('dotenv');
const TronWeb = require('tronweb');

// Load the appropriate .env file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

const USDTContractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const API = process.env.NODE_API;
const privateKey = process.env.SENDER_WALLET_PK

const tronWeb = new TronWeb({
    fullHost: API,
    eventServer: API,
    privateKey: privateKey,
    headers: {
        'TRANSATRON-API-KEY': process.env.TRANSATRON_API_KEY
    }
});

const tronWebSpender = new TronWeb({
    fullHost: API,
    eventServer: API,
    privateKey: privateKey,
    headers: {
        'TRANSATRON-API-KEY': process.env.TRANSATRON_API_KEY_SPENDER
    }
});

function format(numberUSDTorTRX){
    return (numberUSDTorTRX*0.000001).toFixed(2);
}

(async () => {
    try {

        //***************************CHECK THIS SETTINGS HERE *******************/
        //set to true for a company (Entity) account with separate deposit/accounting address.
        //leave value as false for individual (sender address) account
        const areYouACompany = false;
        const accountingAddress = areYouACompany?process.env.COMPANY_ACCOUNTING_ADDRESS:tronWeb.defaultAddress.base58;
        //***************************CHECK THIS SETTINGS HERE *******************/

        const targetAddress = process.env.RECEIVER_WALLET_ADDRESS; 
        const senderAddress = tronWeb.defaultAddress.base58;
        console.log("******************************* SENDER WALLET ****************************");
        console.log("senderAddress = ",senderAddress);
        console.log("targetAddress = ",targetAddress);

        // Get the contract instance
        const USDTInstance = await tronWeb.contract().at(USDTContractAddress);

        // Call the balanceOf method
        const balance = await USDTInstance.methods.balanceOf(senderAddress).call();

        // Convert the balance to a readable format (TRC20 tokens usually have 6 or 18 decimals)
        const decimals = await USDTInstance.methods.decimals().call(); // Get decimals dynamically
        const formattedBalance = balance / Math.pow(10, decimals);

        console.log(`USDT Balance: ${formattedBalance}`);

        const balanceTRX = await tronWeb.trx.getBalance(senderAddress);

        // Convert to TRX
        const formattedBalanceTRX = balanceTRX / 1_000_000;

        console.log(`TRX Balance: ${formattedBalanceTRX}`);


        let transatronRTRXContractAddress = "";
        let transatronRUSDTContractAddress = "";
        let transatronDepositAddress = "";
        let transatronMinUSDTDeposit = 0;
        let transatronMinTRXDeposit = 0;

        let RTRXInstance;
        let RUSDTInstance;

        // Initialize blockchain parameters
        let energyFee, transactionFee, totalEnergyLimit, totalNetLimit;
        {
            let params = await tronWeb.trx.getChainParameters();
            // console.log("Chain params: ", params);
            console.log("************* Init paremeters (do once) *****************");
            // Iterate through the params array
            params.forEach(param => {
                switch (param.key) {
                    case 'getEnergyFee':
                        energyFee = param.value;
                        break;
                    case 'getTransactionFee':
                        transactionFee = param.value;
                        break;
                    case 'getTotalEnergyLimit':
                        totalEnergyLimit = param.value;
                        break;
                    case 'getTotalNetLimit':
                        totalNetLimit = param.value;
                        break;
                }
            });
             // Log the extracted values
            console.log("Energy Fee:", energyFee);
            console.log("Bandwidth Fee:", transactionFee);
            console.log("Total Energy Limit:", totalEnergyLimit);
            console.log("Total Bandwidth Limit:", totalNetLimit);
      
            const nodeInfo = await tronWeb.trx.getNodeInfo();
            // console.log("nodeInfo = ", nodeInfo);

            //read Transatron parameters
            if (nodeInfo.transatronInfo) {
                    transatronDepositAddress = nodeInfo.transatronInfo.deposit_address;
                    transatronRTRXContractAddress = nodeInfo.transatronInfo.rtrx_token_address;
                    transatronRUSDTContractAddress = nodeInfo.transatronInfo.rusdt_token_address;
                    transatronMinUSDTDeposit = nodeInfo.transatronInfo.rusdt_min_deposit;
                    transatronMinTRXDeposit = nodeInfo.transatronInfo.rtrx_min_deposit;
                    console.log("transatronDepositAddress = ", transatronDepositAddress);
                    console.log("transatronRTRXContractAddress = ", transatronRTRXContractAddress);
                    console.log("transatronRUSDTContractAddress = ", transatronRUSDTContractAddress);
                    console.log("transatronMinUSDTDeposit = ", transatronMinUSDTDeposit);
                    console.log("transatronMinTRXDeposit = ", transatronMinTRXDeposit);

                    RTRXInstance = await tronWeb.contract().at(transatronRTRXContractAddress);
                    RUSDTInstance = await tronWeb.contract().at(transatronRUSDTContractAddress);

                    let rtrxUserBalance = await RTRXInstance.methods.balanceOf(accountingAddress).call();
                    console.log("RTRX Balance = ", rtrxUserBalance.toString());

                    let rusdtUserBalance = await RUSDTInstance.methods.balanceOf(accountingAddress).call();
                    console.log("RUSDT Balance = ", rusdtUserBalance.toString());
                }
            
        }


        const numberOfTransactions = 10;
        let transactions = []; 
        let transferAmount = 12000;//... +i*0.0001 USDT so that transaction have different amount, just for testing. feel free to change. 
        
        for(var i=0;i<numberOfTransactions; i++)
        {
            // console.log("*************  CREATE TRANSFER USDT *****************");
            let _callerAddress = tronWeb.address.toHex(senderAddress);
            let _smartContractHex = tronWeb.address.toHex(USDTContractAddress);
            let _callFunction = "transfer(address,uint256)";
            var _callParameters = [{ type: 'address', value: targetAddress }, { type: 'uint256', value: transferAmount+i*100 }];
            let _feeLimit = 0;
            // console.log("*************  1) estimate feeLimit *****************");
            /**
             *WARNING! 
                * 1) senderAddress to be activated. If not activated, the result will return an error. activated means senderAddress has non zero TRX balance.
                * 2) if there is not enough balance on the wallet, you'll get "REVERT opcode executed" error. 
                * 3) 
                */
            let tccResponse = await tronWeb.transactionBuilder.triggerConstantContract(_smartContractHex, _callFunction, {}, _callParameters, _callerAddress);
            // console.log("tccResponse:", tccResponse);
            let energy_used = tccResponse.energy_used;

            // console.log("energy_used = ", energy_used);
            _feeLimit = energy_used * energyFee;
            
            // console.log("*************  3) sign transaction *****************");
            var options = {
                feeLimit: _feeLimit,
                callValue: 0,
                txLocal: true
            };

            var transaction = await tronWeb.transactionBuilder._triggerSmartContractLocal(
                _smartContractHex,
                _callFunction,
                options,
                _callParameters,
                _callerAddress
            );
            // console.log("transaction = ", transaction);
            //IMPORTANT! Make sure you extend expiration for bulk order transaction.

            //extend expiration to 12 hours from now. 
            transaction.transaction.raw_data.expiration += 1000*60*60*12;
            //update transaction data
            const updatedTxPack = await tronWeb.transactionBuilder.newTxID(transaction.transaction);
            // console.log ("updatedTxPack ",updatedTxPack);
            transaction.transaction.txID = updatedTxPack.txID;
            transaction.transaction.raw_data = updatedTxPack.raw_data;
            transaction.transaction.raw_data_hex = updatedTxPack.raw_data_hex;
            transaction.transaction.visible = updatedTxPack.visible;
            // console.log("udpated transaction = ", transaction);
            //sign transaction
            const signedTransaction = await tronWeb.trx.sign(transaction.transaction, privateKey, false, false);
            // console.log("signed transaction = ", signedTransaction);
        
            //basically, only raw_data_hex and list of signatures are required on server to restore transaction object. Everything else is excessive.
            var reducedTX = {
                raw: signedTransaction.raw_data_hex,
                signature: signedTransaction.signature
            }

            transactions.push(reducedTX);
        }

        // console.log("transactions",transactions);

        let orderID;//
        if(true && isObjectEmpty(orderID)){
            console.log("************* CREATE ORDER *****************");
           
            const request = {
                user_transactions: transactions
              };
            // console.log("request= ",request);
            
            //IMPORTANT! make sure you use _SPENDER API KEY for creating orders.
            const orderInfo = await tronWebSpender['fullNode'].request(
                "api/v1/orders",
                request,
                'post'
            );

            // console.log("orderInfo = ", orderInfo);
            let error = orderInfo.error;
            if(error == null || error.isObjectEmpty()){
                orderID = orderInfo.order_id;
                console.log("Successfully created orderID = ",orderID);
            }else {
                console.log("Error creating order: ",error);
            }
        }

        //reading order data
        if(true && orderID!=null && orderID.length > 0){
            console.log("************* READ ORDER STATUS *****************");
            let orderInfo;
            do{
                await new Promise(resolve => setTimeout(resolve, 1000));  // sleep for 1 second;
                orderInfo = await tronWebSpender['fullNode'].request(
                    "api/v1/orders/"+orderID,
                    'get'
                );

            } while (!(orderInfo.status === 'COMPLETED' || orderInfo.status === 'FAILED' || orderInfo.status === 'CANCELLED'));
            
            if(orderInfo.status === 'COMPLETED' ){
                console.log("Order completed!");
                console.log("You've paid ",format(orderInfo.usdt_invoiced)," for ",numberOfTransactions," USDT tx");
                console.log("which is ",format(orderInfo.usdt_invoiced/numberOfTransactions)," per tx");
            }

            if(orderInfo.status === 'FAILED' ){
                console.log("Order failed!");
                console.log("Error message: ",orderInfo.error_message);
            }
        }

        console.log("Done");

    } catch (error) {
        console.error('Error ', error);
    }
})();

// Convert hex to bytes
function hexToBytes(hex) {
    let bytes = [];
    for (let c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return new Uint8Array(bytes);
}

// Convert hex to Unicode string
function hexToUnicode(hex) {
    if (hex!=null && hex.length > 0) {
        const bytes = hexToBytes(hex);
        return new TextDecoder('utf-8').decode(bytes);
    } else {
        return "";
    }
}

const isObjectEmpty = (objectName) => {
    return objectName == null || JSON.stringify(objectName) === "{}";
};



