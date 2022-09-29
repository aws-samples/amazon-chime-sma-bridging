import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  StreamViewType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class Database extends Construct {
  public callInfoTable: Table;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.callInfoTable = new Table(this, 'callInfoTable', {
      partitionKey: {
        name: 'phoneNumber',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
    });
  }
}
