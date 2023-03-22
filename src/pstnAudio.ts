import { Duration, Stack } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  ChimePhoneNumber,
  ChimeSipMediaApp,
  PhoneNumberType,
  PhoneProductType,
  TriggerType,
  ChimeSipRule,
} from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';

interface ChimeProps {
  callInfoTable: Table;
  wavFileBucket: Bucket;
}

export class PSTNAudio extends Construct {
  public readonly inboundPhoneNumber: string;

  constructor(scope: Construct, id: string, props: ChimeProps) {
    super(scope, id);

    const inboundPhoneNumber = new ChimePhoneNumber(
      this,
      'inboundPhoneNumber',
      {
        phoneState: 'IL',
        phoneNumberType: PhoneNumberType.LOCAL,
        phoneProductType: PhoneProductType.SMA,
      },
    );

    const salesPhoneNumber = new ChimePhoneNumber(this, 'salesPhoneNumber', {
      phoneState: 'IL',
      phoneNumberType: PhoneNumberType.LOCAL,
      phoneProductType: PhoneProductType.SMA,
    });

    const supportPhoneNumber = new ChimePhoneNumber(
      this,
      'supportPhoneNumber',
      {
        phoneState: 'IL',
        phoneNumberType: PhoneNumberType.LOCAL,
        phoneProductType: PhoneProductType.SMA,
      },
    );

    salesPhoneNumber.node.addDependency(inboundPhoneNumber);
    supportPhoneNumber.node.addDependency(salesPhoneNumber);

    const smaHandlerRole = new iam.Role(this, 'smaHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ['*'],
              actions: ['chime:*'],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const inboundSMALambda = new NodejsFunction(this, 'smaHandlerLambda', {
      entry: 'src/resources/inboundSMA/inboundSMA.js',
      bundling: {
        sourcesContent: true,
      },
      runtime: Runtime.NODEJS_16_X,
      role: smaHandlerRole,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(60),
      environment: {
        CALLINFO_TABLE_NAME: props.callInfoTable.tableName,
        WAVFILE_BUCKET: props.wavFileBucket.bucketName,
        SALES_PHONE_NUMBER: salesPhoneNumber.phoneNumber,
        SUPPORT_PHONE_NUMBER: supportPhoneNumber.phoneNumber,
      },
    });

    const emulatorSMALambda = new NodejsFunction(this, 'emulatorSMALambda', {
      entry: 'src/resources/emulatorSMA/emulatorSMA.js',
      bundling: {
        sourcesContent: true,
      },
      runtime: Runtime.NODEJS_16_X,
      role: smaHandlerRole,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(60),
      environment: {
        CALLINFO_TABLE_NAME: props.callInfoTable.tableName,
        WAVFILE_BUCKET: props.wavFileBucket.bucketName,
      },
    });

    props.callInfoTable.grantReadWriteData(inboundSMALambda);
    props.callInfoTable.grantReadWriteData(emulatorSMALambda);

    const inboundSipMediaApp = new ChimeSipMediaApp(
      this,
      'inboundSipMediaApp',
      {
        region: Stack.of(this).region,
        endpoint: inboundSMALambda.functionArn,
      },
    );

    const emulatorSipMediaApp = new ChimeSipMediaApp(
      this,
      'emulatorSipMediaApp',
      {
        region: Stack.of(this).region,
        endpoint: emulatorSMALambda.functionArn,
      },
    );

    new ChimeSipRule(this, 'inboundSipRule', {
      triggerType: TriggerType.TO_PHONE_NUMBER,
      triggerValue: inboundPhoneNumber.phoneNumber,
      targetApplications: [
        {
          region: Stack.of(this).region,
          priority: 1,
          sipMediaApplicationId: inboundSipMediaApp.sipMediaAppId,
        },
      ],
    });

    new ChimeSipRule(this, 'salesSipRule', {
      triggerType: TriggerType.TO_PHONE_NUMBER,
      triggerValue: salesPhoneNumber.phoneNumber,
      targetApplications: [
        {
          region: Stack.of(this).region,
          priority: 1,
          sipMediaApplicationId: emulatorSipMediaApp.sipMediaAppId,
        },
      ],
    });

    new ChimeSipRule(this, 'supportSipRule', {
      triggerType: TriggerType.TO_PHONE_NUMBER,
      triggerValue: supportPhoneNumber.phoneNumber,
      targetApplications: [
        {
          region: Stack.of(this).region,
          priority: 1,
          sipMediaApplicationId: emulatorSipMediaApp.sipMediaAppId,
        },
      ],
    });

    this.inboundPhoneNumber = inboundPhoneNumber.phoneNumber;
  }
}
