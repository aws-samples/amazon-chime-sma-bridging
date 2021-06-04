//  “Copyright Amazon.com Inc. or its affiliates.” 
import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import s3deploy = require('@aws-cdk/aws-s3-deployment')
import iam = require('@aws-cdk/aws-iam')
import dynamodb = require('@aws-cdk/aws-dynamodb');
import lambda = require('@aws-cdk/aws-lambda');
import { CustomResource, Duration } from '@aws-cdk/core';
import custom = require('@aws-cdk/custom-resources')
import { DynamoEventSource,SqsDlq } from '@aws-cdk/aws-lambda-event-sources';
import * as sqs from '@aws-cdk/aws-sqs';

export class SmaBridgingDemo extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const wavFiles = new s3.Bucket(this, 'wavFiles', {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true 
    });

    const wavFileBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:PutObjectAcl'
      ],
      resources: [
        wavFiles.bucketArn,
        `${wavFiles.bucketArn}/*`
      ],
      sid: 'SIPMediaApplicationRead',
    })

    wavFileBucketPolicy.addServicePrincipal('voiceconnector.chime.amazonaws.com')
    wavFiles.addToResourcePolicy(wavFileBucketPolicy)

    new s3deploy.BucketDeployment(this, 'WavDeploy', {
      sources: [s3deploy.Source.asset('./wav_files')],
      destinationBucket: wavFiles,
      contentType: 'audio/wav'
    });

    const callInfoTable = new dynamodb.Table(this, 'callInfo', {
      partitionKey: {
        name: 'phoneNumber',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,       
      stream: dynamodb.StreamViewType.NEW_IMAGE     
    });
    

      const smaLambdaRole = new iam.Role(this, 'smaLambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });
  
      smaLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));


      const inboundSMALambda = new lambda.Function(this, 'inboundSMALambda', {
        code: lambda.Code.fromAsset("src", {exclude: ["**", "!inboundSMA.js"]}),
        handler: 'inboundSMA.handler',
        runtime: lambda.Runtime.NODEJS_14_X,
        environment: {
          CALLINFO_TABLE_NAME: callInfoTable.tableName,
          WAVFILE_BUCKET: wavFiles.bucketName,
        },
        role: smaLambdaRole,
        timeout: Duration.seconds(60)
      });



      const emulatorSMALambda = new lambda.Function(this, 'emulatorSMALambda', {
        code: lambda.Code.fromAsset("src", {exclude: ["**", "!emulatorSMA.js"]}),
        handler: 'emulatorSMA.handler',
        runtime: lambda.Runtime.NODEJS_14_X,
        environment: {
          CALLINFO_TABLE_NAME: callInfoTable.tableName,
          WAVFILE_BUCKET: wavFiles.bucketName,
        },
        role: smaLambdaRole,
        timeout: Duration.seconds(60)
      });



      const chimeCreateRole = new iam.Role(this, 'createChimeLambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: {
          ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
            resources: ['*'],
            actions: ['chime:*']})]})
        },
        managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
      })


    const createSMALambda = new lambda.Function(this, 'createSMALambda', {
      code: lambda.Code.fromAsset("src", {exclude: ["**", "!createChimeResources.py"]}),
      handler: 'createChimeResources.on_event',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: chimeCreateRole,
      timeout: Duration.seconds(60)
    });

    const createWavRole = new iam.Role(this, 'createWavRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
          resources: ['*'],
          actions: ['chime:*',
                    'polly:*']})]})
      },
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
    })

    const createWavLambda = new lambda.Function(this, 'createWav', {
      code: lambda.Code.fromAsset("src", {exclude: ["**", "!createWav.py"]}),
      handler: 'createWav.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: createWavRole,
      timeout: cdk.Duration.seconds(60),
      environment: {
        WAVFILE_BUCKET: wavFiles.bucketName,
      }
    });

    wavFiles.grantReadWrite(createWavLambda)

    const deadLetterQueue = new sqs.Queue(this, 'deadLetterQueue');

    createWavLambda.addEventSource(new DynamoEventSource(callInfoTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5,
      bisectBatchOnError: true,
      onFailure: new SqsDlq(deadLetterQueue),
      retryAttempts: 10

    }))

    const chimeProvider = new custom.Provider(this, 'chimeProvider', {
      onEventHandler: createSMALambda
    })

    const inboundSMA = new CustomResource(this, 'inboundSMA', { 
      serviceToken: chimeProvider.serviceToken,
      properties: { 'lambdaArn': inboundSMALambda.functionArn,
                    'region': this.region,
                    'smaName': this.stackName + '-inbound',
                    'ruleName': this.stackName + '-inbound',
                    'createSMA': true,
                    'smaID': '',                    
                    'phoneNumberRequired': true}
    })
    
    const inboundPhoneNumber = inboundSMA.getAttString('phoneNumber')
    new cdk.CfnOutput(this, 'inboundPhoneNumber', { value: inboundPhoneNumber });

    const salesEmulatorSMA = new CustomResource(this, 'salesEmulatorSMA', { 
      serviceToken: chimeProvider.serviceToken,
      properties: { 'lambdaArn': emulatorSMALambda.functionArn,
                    'region': this.region,
                    'smaName': this.stackName + '-emulator',
                    'ruleName': this.stackName + '-sales',                    
                    'createSMA': true,
                    'smaID': '',
                    'phoneNumberRequired': true}
    })

    const emulatorSMAId = salesEmulatorSMA.getAttString('smaID')
    const salesPhoneNumber = salesEmulatorSMA.getAttString('phoneNumber')
    
    new cdk.CfnOutput(this, 'salesPhoneNumber', { value: salesPhoneNumber });

    const supportEmulatorSMA = new CustomResource(this, 'supportEmulatorSMA', { 
      serviceToken: chimeProvider.serviceToken,
      properties: { 'lambdaArn': emulatorSMALambda.functionArn,
                    'region': this.region,
                    'smaName': this.stackName + '-emulator',
                    'ruleName': this.stackName + '-support',                    
                    'createSMA': false,
                    'smaID': emulatorSMAId,
                    'phoneNumberRequired': true}
    })

    const supportPhoneNumber = supportEmulatorSMA.getAttString('phoneNumber')
    new cdk.CfnOutput(this, 'supportPhoneNumber', { value: supportPhoneNumber });

    inboundSMALambda.addEnvironment('SALES_PHONE_NUMBER', salesPhoneNumber)
    inboundSMALambda.addEnvironment('SUPPORT_PHONE_NUMBER', supportPhoneNumber)

    callInfoTable.grantFullAccess(emulatorSMALambda)
    callInfoTable.grantFullAccess(inboundSMALambda)
    
  }
}
