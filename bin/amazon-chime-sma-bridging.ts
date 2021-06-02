//  “Copyright Amazon.com Inc. or its affiliates.” 
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { SmaBridgingDemo } from '../lib/amazon-chime-sma-bridging-stack';

const app = new cdk.App();
new SmaBridgingDemo(app, 'SmaBridgingDemo', {});
