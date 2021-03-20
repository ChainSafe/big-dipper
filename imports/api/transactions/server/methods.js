import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';
import { Transactions } from '../../transactions/transactions.js';
import { Validators } from '../../validators/validators.js';

const AddressLength = 40;

Meteor.methods({
    'Transactions.updateTransactions': async function(){
        this.unblock();
        if (TXSYNCING)
            return "Syncing transactions...";

        const transactions = Transactions.find({processed:false},{limit: 500}).fetch();
        
        console.log("TRANSACTIONS: ", transactions);
        console.log("TRANSACTIONS LENGTH: ", transactions.length)

        try{
            TXSYNCING = true;
            const bulkTransactions = Transactions.rawCollection().initializeUnorderedBulkOp();
            for (let i in transactions){
                console.log("i: ", i);
                console.log("transactions["+i+"]: ", transactions[i]);
                console.log("transactions["+i+"].txhash: ", transactions[i].txhash);
                console.log("transactions["+i+"].height: ", parseInt(transactions[i].height));
                console.log("transactions["+i+"].processed: ", transactions[i].processed);
                try {
                    let url = LCD+ '/txs/0x'+transactions[i].txhash;
                    let response = HTTP.get(url);
                    let tx = JSON.parse(response.content);

                    console.log("RESPONSE: ", response);
                    console.log("RESPONSE.TX: ", tx)
            
                    transactions[i].height = parseInt(transactions[i].height);
                    transactions[i].processed = true;

                    console.log("TX HEIGHT: ", transactions[i].height);
                    console.log("TX PROCESSED: ", transactions[i].processed);

                    console.log("TRANSACTION HASH: ", {txhash:'0x'+transactions[i].txhash});

                    bulkTransactions.find({txhash:'0x'+transactions[i].txhash}).updateOne({$set:tx});
                }
                catch(e) {
                    console.log("Getting transaction %o: %o", hash, e);
                }
            }
            // for (let i in transactions){
            //     console.log("i: ", i);
            //     console.log("transactions: ", transactions);
            //     try {
            //         let url = LCD+ '/txs/'+transactions[i].txhash;
            //         let response = HTTP.get(url);
            //         let tx = JSON.parse(response.content);
            
            //         tx.height = parseInt(tx.height);
            //         tx.processed = true;

            //         console.log("TRANSACTION HASH: ", '0x'+{txhash:transactions[i].txhash});

            //         bulkTransactions.find('0x'+{txhash:transactions[i].txhash}).updateOne({$set:tx});

            
            //     }
            //     catch(e) {
            //         console.log("Getting transaction %o: %o", hash, e);
            //     }
            // }
            if (bulkTransactions.length > 0){
                console.log("aaa: %o",bulkTransactions.length)
                bulkTransactions.execute((err, result) => {
                    if (err){
                        console.log(err);
                    }
                    if (result){
                        console.log(result);
                    }
                });
            }
        }
        catch (e) {
            TXSYNCING = false;
            return e
        }
        TXSYNCING = false;
        return transactions
    },
    'Transactions.findDelegation': function(address, height){
        this.unblock();
        // following cosmos-sdk/x/slashing/spec/06_events.md and cosmos-sdk/x/staking/spec/06_events.md
        return Transactions.find({
            $or: [{$and: [
                {"logs.events.type": "delegate"},
                {"logs.events.attributes.key": "validator"},
                {"logs.events.attributes.value": address}
            ]}, {$and:[
                {"logs.events.attributes.key": "action"},
                {"logs.events.attributes.value": "unjail"},
                {"logs.events.attributes.key": "sender"},
                {"logs.events.attributes.value": address}
            ]}, {$and:[
                {"logs.events.type": "create_validator"},
                {"logs.events.attributes.key": "validator"},
                {"logs.events.attributes.value": address}
            ]}, {$and:[
                {"logs.events.type": "unbond"},
                {"logs.events.attributes.key": "validator"},
                {"logs.events.attributes.value": address}
            ]}, {$and:[
                {"logs.events.type": "redelegate"},
                {"logs.events.attributes.key": "destination_validator"},
                {"logs.events.attributes.value": address}
            ]}],
            "code": {$exists: false},
            height:{$lt:height}},
        {sort:{height:-1},
            limit: 1}
        ).fetch();
    },
    'Transactions.findUser': function(address, fields=null){
        this.unblock();
        // address is either delegator address or validator operator address
        let validator;
        if (!fields)
            fields = {address:1, description:1, operator_address:1, delegator_address:1};
        if (address.includes(Meteor.settings.public.bech32PrefixValAddr)){
            // validator operator address
            validator = Validators.findOne({operator_address:address}, {fields});
        }
        else if (address.includes(Meteor.settings.public.bech32PrefixAccAddr)){
            // delegator address
            validator = Validators.findOne({delegator_address:address}, {fields});
        }
        else if (address.length === AddressLength) {
            validator = Validators.findOne({address:address}, {fields});
        }
        if (validator){
            return validator;
        }
        return false;

    }
});
