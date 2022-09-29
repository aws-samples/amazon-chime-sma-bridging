import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Database, Storage, PSTNAudio } from './index';

export class AmazonChimeSDKPSTNAudioBridging extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const database = new Database(this, 'database');
    const storage = new Storage(this, 'storage');
    const pstnAudio = new PSTNAudio(this, 'pstnAudio', {
      callInfoTable: database.callInfoTable,
      wavFileBucket: storage.wavFileBucket,
    });

    new CfnOutput(this, 'phoneNumber', { value: pstnAudio.inboundPhoneNumber });
  }
}
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AmazonChimeSDKPSTNAudioBridging(app, 'AmazonChimeSDKPSTNAudioBridging', {
  env: devEnv,
});

app.synth();
