import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AmazonChimeSDKPSTNAudioBridging } from '../src/amazon-chime-sma-bridging';

test('Snapshot', () => {
  const app = new App();
  const stack = new AmazonChimeSDKPSTNAudioBridging(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
