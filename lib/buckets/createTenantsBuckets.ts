import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";

const createTenantsBuckets = (stack: Stack, tenants: string[]) => {
  const tenantsBuckets = tenants.map((tenant) => {
    const tenantMediaBucket = new Bucket(stack, `${tenant}MediaBucket`, {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: `${tenant}-media-bucket-REDACTED-io`,
      encryption: BucketEncryption.KMS_MANAGED,
      enforceSSL: false,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: false,
      autoDeleteObjects: false,
    });

    const tenantFrontendBucket = new Bucket(stack, `${tenant}FrontendBucket`, {
      bucketName: `${tenant}-frontend-bucket-REDACTED-io`,
      enforceSSL: false,
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: false,
      autoDeleteObjects: false,
    });

    return {
      tenant: tenant,
      media: tenantMediaBucket,
      frontend: tenantFrontendBucket,
    };
  });

  return tenantsBuckets;
};

export default createTenantsBuckets;
