import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { ServicePrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class Storage extends Construct {
  public wavFileBucket: Bucket;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.wavFileBucket = new Bucket(this, 'wavFileBucket', {
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
    });

    const wavFileBucketPolicy = new PolicyStatement({
      principals: [new ServicePrincipal('voiceconnector.chime.amazonaws.com')],
      sid: 'AWSChimeMediaCaptureBucketPolicy',
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:GetObject',
        's3:ListBucket',
      ],
      effect: Effect.ALLOW,
      resources: [
        `${this.wavFileBucket.bucketArn}/*`,
        `${this.wavFileBucket.bucketArn}`,
      ],
      conditions: {
        StringEquals: {
          'aws:SourceAccount': Stack.of(this).account,
        },
        ArnLike: {
          'aws:SourceArn': `arn:aws:chime:*:${Stack.of(this).account}:*`,
        },
      },
    });

    this.wavFileBucket.addToResourcePolicy(wavFileBucketPolicy);

    new BucketDeployment(this, 'wavFileBucketDeployment', {
      sources: [Source.asset('./wav_files')],
      destinationBucket: this.wavFileBucket,
      contentType: 'audio/wav',
    });
  }
}
