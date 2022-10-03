import { Duration, Stack } from "aws-cdk-lib";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { Distribution, OriginAccessIdentity } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Bucket } from "aws-cdk-lib/aws-s3";

const createTenantsDistributions = (
  stack: Stack,
  tenantBucketSpecs: { tenant: string; frontend: Bucket }[],
  certificate: ICertificate
) => {
  const frontendTenantsDistributions = tenantBucketSpecs.map(
    ({ tenant, frontend: frontendBucket }) => {
      const oai = new OriginAccessIdentity(
        stack,
        `${tenant}OriginAccessIdentity`
      );
      const distribution = new Distribution(stack, "TenantDistribution", {
        defaultBehavior: {
          origin: new S3Origin(frontendBucket),
        },
        domainNames: [`${tenant}.REDACTED.io`],
        certificate: certificate,
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: Duration.minutes(10),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: Duration.minutes(10),
          },
        ],
      });
      frontendBucket.grantRead(oai);

      return distribution;
    }
  );

  return frontendTenantsDistributions;
};

export default createTenantsDistributions;
