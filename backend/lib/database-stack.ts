import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB users table
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'users',
      partitionKey: {
        name: 'internalUserId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add Global Secondary Index for cognitoUserId lookups
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'cognitoUserIdIndex',
      partitionKey: {
        name: 'cognitoUserId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Export table name and ARN for cross-stack reference
    new cdk.CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      description: 'DynamoDB users table name',
      exportName: 'UsersTableName',
    });

    new cdk.CfnOutput(this, 'UsersTableArn', {
      value: this.usersTable.tableArn,
      description: 'DynamoDB users table ARN',
      exportName: 'UsersTableArn',
    });
  }
}
