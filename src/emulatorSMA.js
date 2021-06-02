//  “Copyright Amazon.com Inc. or its affiliates.” 
const AWS = require('aws-sdk');
const wavFileBucket = process.env['WAVFILE_BUCKET']
const callInfoTable = process.env['CALLINFO_TABLE_NAME']
var documentClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async(event, context, callback) => {
    console.log("Lambda is invoked with calldetails:" + JSON.stringify(event));
    let actions;

    switch (event.InvocationEventType) {
        case "NEW_INBOUND_CALL":
            console.log("INBOUND");
            // New inbound call
            actions = await newCall(event);
            break;

        case "ACTION_SUCCESSFUL":
            // Action from the previous invocation response 
            // or a action requiring callback was successful
            console.log("SUCCESS ACTION");
            actions = await actionSuccessful(event);
            break;

        case "HANGUP":
            // Hangup received
            console.log("HANGUP ACTION");
            if (event.CallDetails.Participants[0].Status === "Disconnected") {
            }
            actions = [];
            break;       

        default:
            // Action unsuccessful or unknown event recieved
            console.log("FAILED ACTION");
            actions = [hangupAction];
    }

    const response = {
        "SchemaVersion": "1.0",
        "Actions": actions
    };

    console.log("Sending response:" + JSON.stringify(response));

    callback(null, response);
}

// New call handler
async function newCall(event, details) {
    // Play a welcome message after answering the call, play a prompt and gather DTMF tones
    const callInfo = await getCaller(event.CallDetails.Participants[0].From)
    
    playAccountIdAction.Parameters.AudioSource.Key = callInfo.id + '.wav';
    
    if ( callInfo.extension === 'sales' ) {
        playAudioAction.Parameters.AudioSource.Key = 'sales.wav'
    } else {
        playAudioAction.Parameters.AudioSource.Key = 'support.wav'
    }
    
    return [playAudioAction, playAccountIdAction, hangupAction];
}


async function actionSuccessful(event) {
    console.log("ACTION_SUCCESSFUL");

    switch (event.ActionData.Type) {

        case "PlayAudio":
            return [];
        
        case "RecordAudio":
            playAudioAction.Parameters.AudioSource.Key = "request_received.wav";
            return [playAudioAction, hangupAction];

        default:
            return [];
    }
}

const hangupAction = {
    "Type": "Hangup",
    "Parameters": {
        "SipResponseCode": "0"
    }
};

const playAudioAction = {
    "Type": "PlayAudio",
    "Parameters": {
        "ParticipantTag": "LEG-A",
        "AudioSource": {
            "Type": "S3",
            "BucketName": wavFileBucket,
            "Key": ""
        }
    }
};

const playAccountIdAction = {
    "Type": "PlayAudio",
    "Parameters": {
        "ParticipantTag": "LEG-A",
        "AudioSource": {
            "Type": "S3",
            "BucketName": wavFileBucket,
            "Key": ""
        }
    }
};

async function getCaller(callInfo) {
    var params = {
        TableName: callInfoTable,
        Key: { 'phoneNumber': callInfo }
       };

    console.log(params)
    try {
            const results = await documentClient.get(params).promise()
            console.log(results)
            if (results) {
                const callInfo = { 'extension': results.Item.extension, 'phoneNumber': results.Item.phoneNumber, 'accountId': results.Item.accountId, 'id': results.Item.id }
                console.log({callInfo})
                return callInfo
            } else {
                console.log("Account ID not found")
                return false
            }

        } catch (err) {
            console.log(err)
            console.log("No phone found")
            return false
        }
}