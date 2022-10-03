import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { IRole, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { EnvCdkStackProps } from "../cdk-stack";

const createStreamAndGrantPermissions = (
  stack: Stack,
  role: IRole,
  env: EnvCdkStackProps["deploymentEnv"]
) => {
  const firehoseRole = new Role(stack, "firehoseRole", {
    roleName: "firehoseRoleToDatadog",
    assumedBy: new ServicePrincipal("firehose.amazonaws.com"),
  });

  const kinesisBackupBucket = new Bucket(stack, "KinesisBackupBucket", {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    bucketName: `kinesis-REDACTED-api-backup-bucket-${env}`,
    encryption: BucketEncryption.KMS_MANAGED,
    enforceSSL: false,
    publicReadAccess: false,
    removalPolicy: RemovalPolicy.DESTROY,
    versioned: false,
    autoDeleteObjects: false,
  });

  const stream = new kinesis.Stream(stack, "DatadogLogStream", {
    streamName: "datadog-log-stream",
    shardCount: 3,
    retentionPeriod: Duration.hours(48),
  });

  const deliveryStream = new firehose.CfnDeliveryStream(
    stack,
    "DatadogLogsforwarder",
    {
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: stream.streamArn,
        roleArn: firehoseRole.roleArn,
      },
      httpEndpointDestinationConfiguration: {
        endpointConfiguration: {
          accessKey: process.env.DATADOG_API_KEY,
          name: "Datadog EU Custom",
          url: "https://aws-kinesis-http-intake-logs.datadoghq.eu/v1/input",
        },
        bufferingHints: {
          sizeInMBs: 4,
        },
        retryOptions: {
          durationInSeconds: 60,
        },
        s3Configuration: {
          roleArn: firehoseRole.roleArn,
          bucketArn: kinesisBackupBucket.bucketArn,
        },
      },
    }
  );

  kinesisBackupBucket.grantReadWrite(firehoseRole);
  kinesisBackupBucket.grantPut(firehoseRole);
  stream.grantReadWrite(firehoseRole);

  return stream;
};

export default createStreamAndGrantPermissions;
