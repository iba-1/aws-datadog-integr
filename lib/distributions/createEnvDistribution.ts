import { Duration, Stack } from "aws-cdk-lib";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { Distribution, OriginAccessIdentity } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ARecord } from "aws-cdk-lib/aws-route53";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { EnvCdkStackProps } from "../cdk-stack";

const createEnvDistribution = (
  stack: Stack,
  env: EnvCdkStackProps["deploymentEnv"],
  bucket: Bucket,
  certificate: ICertificate
) => {
  const oai = new OriginAccessIdentity(stack, "EnvOriginAccessIdentity");

  const envBucketCloudfrontDistribution = new Distribution(
    stack,
    `${env}-bucket-frontend-REDACTED-io-distribution`,
    {
      defaultBehavior: {
        origin: new S3Origin(bucket, {
          originAccessIdentity: oai,
        }),
      },
      domainNames: [`${env}.REDACTED.io`],
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
    }
  );

  bucket.grantRead(oai);

  return envBucketCloudfrontDistribution;
};

export default createEnvDistribution;
