const AWS = require('aws-sdk');
const wavFileBucket = process.env['WAVFILE_BUCKET'];
const callInfoTable = process.env['CALLINFO_TABLE_NAME'];
const salesNumber = process.env['SALES_PHONE_NUMBER'];
const supportNumber = process.env['SUPPORT_PHONE_NUMBER'];
var documentClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  console.log('Lambda is invoked with calldetails:' + JSON.stringify(event));
  let actions;

  switch (event.InvocationEventType) {
    case 'NEW_INBOUND_CALL':
      console.log('INBOUND');
      actions = await newCall(event);
      break;

    case 'ACTION_SUCCESSFUL':
      console.log('SUCCESS ACTION');
      actions = await actionSuccessful(event);
      break;

    case 'HANGUP':
      console.log('HANGUP');
      const hangupId = event.CallDetails.Participants.filter(
        ({ Status }) => Status === 'Connected',
      )?.[0]?.CallId;
      if (hangupId) {
        hangupAction.Parameters.CallId = hangupId;
        actions = [hangupAction];
      }
      break;

    case 'CALL_ANSWERED':
      console.log('CALL ANSWERED');
      actions = [];
      break;

    default:
      console.log('FAILED ACTION');
      actions = [hangupAction];
  }

  const response = {
    SchemaVersion: '1.0',
    Actions: actions,
  };

  console.log('Sending response:' + JSON.stringify(response));

  callback(null, response);
};

// New call handler
async function newCall(event) {
  const callInfo = await getCaller(event.CallDetails.Participants[0].From);
  if (callInfo === false) {
    console.log('Do not know this phone number.  Getting Account ID');
    playAudioAndGetDigitsAction.Parameters.MinNumberOfDigits = 5;
    playAudioAndGetDigitsAction.Parameters.MaxNumberOfDigits = 5;
    playAudioAndGetDigitsAction.Parameters.AudioSource.Key = 'greeting.wav';
    return [playAudioAndGetDigitsAction];
  } else {
    console.log('Know this phone number.  Sending Prompt');
    speakAction.Parameters.Text =
      "<speak>Your account ID is <say-as interpret-as='digits'>" +
      callInfo.accountId +
      '</say-as>.</speak>';
    'Your account ID is ' + callInfo.accountId;
    playAudioAndGetDigitsAction.Parameters.MinNumberOfDigits = 1;
    playAudioAndGetDigitsAction.Parameters.MaxNumberOfDigits = 1;
    playAudioAndGetDigitsAction.Parameters.AudioSource.Key = 'prompt.wav';
    return [speakAction, playAudioAndGetDigitsAction];
  }
}

async function actionSuccessful(event) {
  console.log('ACTION_SUCCESSFUL');

  switch (event.ActionData.Type) {
    case 'PlayAudioAndGetDigits':
      const callInfo = await getCaller(event.CallDetails.Participants[0].From);

      console.log({ callInfo });
      console.log('ReceivedDigits: ' + event.ActionData.ReceivedDigits);

      if (callInfo.accountId) {
        if (event.ActionData.ReceivedDigits === '1') {
          console.log('Transferring to Sales');
          playAudioAction.Parameters.AudioSource.Key = 'transfer-to-sales.wav';
          callAndBridgeAction.Parameters.CallerIdNumber =
            event.CallDetails.Participants[0].From;
          callAndBridgeAction.Parameters.Endpoints[0].Uri = salesNumber;
          callInfo.extension = 'sales';
          await updateCaller(callInfo);
          return [playAudioAction, callAndBridgeAction];
        } else {
          console.log('Transferring to Support');
          playAudioAction.Parameters.AudioSource.Key =
            'transfer-to-support.wav';
          callAndBridgeAction.Parameters.CallerIdNumber =
            event.CallDetails.Participants[0].From;
          callAndBridgeAction.Parameters.Endpoints[0].Uri = supportNumber;
          callInfo.extension = 'support';
          await updateCaller(callInfo);
          return [playAudioAction, callAndBridgeAction];
        }
      } else {
        const storeInfo = {
          phoneNumber: event.CallDetails.Participants[0].From,
          accountId: event.ActionData.ReceivedDigits,
          id: event.CallDetails.TransactionId,
        };

        console.log('putting in Dynamo: ' + JSON.stringify(storeInfo));
        putCaller(storeInfo);
        playAudioAndGetDigitsAction.Parameters.MaxNumberOfDigits = 1;
        playAudioAndGetDigitsAction.Parameters.MinNumberOfDigits = 1;
        playAudioAndGetDigitsAction.Parameters.AudioSource.Key = 'prompt.wav';
        console.log('Stored accountId.  Sending Prompt');
        return [playAudioAndGetDigitsAction];
      }

    default:
      return [];
  }
}

const hangupAction = {
  Type: 'Hangup',
  Parameters: {
    SipResponseCode: '0',
    ParticipantTag: '',
  },
};

const playAudioAction = {
  Type: 'PlayAudio',
  Parameters: {
    ParticipantTag: 'LEG-A',
    AudioSource: {
      Type: 'S3',
      BucketName: wavFileBucket,
      Key: '',
    },
  },
};

const playAudioAndGetDigitsAction = {
  Type: 'PlayAudioAndGetDigits',
  Parameters: {
    MinNumberOfDigits: '',
    MaxNumberOfDigits: '',
    Repeat: 3,
    InBetweenDigitsDurationInMilliseconds: 1000,
    RepeatDurationInMilliseconds: 5000,
    TerminatorDigits: ['#'],
    AudioSource: {
      Type: 'S3',
      BucketName: wavFileBucket,
      Key: '',
    },
    FailureAudioSource: {
      Type: 'S3',
      BucketName: wavFileBucket,
      Key: 'failure.wav',
    },
  },
};

const callAndBridgeAction = {
  Type: 'CallAndBridge',
  Parameters: {
    CallTimeoutSeconds: '20',
    CallerIdNumber: '',
    Endpoints: [
      {
        Uri: '',
        BridgeEndpointType: 'PSTN',
      },
    ],
  },
};

const speakAction = {
  Type: 'Speak',
  Parameters: {
    Text: '',
    CallId: '',
    Engine: 'neural',
    LanguageCode: 'en-US',
    TextType: 'ssml',
    VoiceId: 'Joanna',
  },
};

async function putCaller(callInfo) {
  var params = {
    TableName: callInfoTable,
    Item: {
      phoneNumber: callInfo.phoneNumber,
      accountId: callInfo.accountId,
      id: callInfo.id,
    },
  };

  try {
    const results = await documentClient.put(params).promise();
    console.log(results);
    return results;
  } catch (err) {
    console.log(err);
    return err;
  }
}

async function updateCaller(callInfo) {
  var params = {
    TableName: callInfoTable,
    Key: {
      phoneNumber: callInfo.phoneNumber,
    },
    UpdateExpression: 'set extension = :e',
    ExpressionAttributeValues: {
      ':e': callInfo.extension,
    },
  };
  console.log(params);
  try {
    const results = await documentClient.update(params).promise();
    console.log(results);
    return results;
  } catch (err) {
    console.log(err);
    return err;
  }
}

async function getCaller(callInfo) {
  var params = {
    TableName: callInfoTable,
    Key: { phoneNumber: callInfo },
  };

  console.log(params);
  try {
    const results = await documentClient.get(params).promise();
    console.log(results);
    if (results) {
      const callInfo = {
        phoneNumber: results.Item.phoneNumber,
        accountId: results.Item.accountId,
        id: results.Item.id,
      };
      console.log({ callInfo });
      return callInfo;
    } else {
      console.log('Account ID not found');
      return false;
    }
  } catch (err) {
    console.log(err);
    console.log('No phone found');
    return false;
  }
}
