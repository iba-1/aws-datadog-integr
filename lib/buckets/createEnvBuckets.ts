import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { EnvCdkStackProps } from "../cdk-stack";

const createEnvBuckets = (
  stack: Stack,
  env: EnvCdkStackProps["deploymentEnv"]
) => {
  const envBucketFrontend = new Bucket(
    stack,
    `${env}-bucket-frontend-REDACTED-io`,
    {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: `${env}-bucket-frontend-REDACTED-io`,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: false,
      autoDeleteObjects: true,
    }
  );

  const envBucketApi = new Bucket(stack, `${env}-bucket-api-REDACTED-io`, {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    bucketName: `${env}-bucket-api-REDACTED-io`,
    encryption: BucketEncryption.KMS_MANAGED,
    enforceSSL: false,
    publicReadAccess: false,
    removalPolicy: RemovalPolicy.DESTROY,
    versioned: false,
    autoDeleteObjects: false,
  });

  return {
    env,
    frontendBucket: envBucketFrontend,
    backendBucket: envBucketApi,
  };
};

export default createEnvBuckets;
