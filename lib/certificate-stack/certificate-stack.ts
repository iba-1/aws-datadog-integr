import { CfnOutput, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { ARecord } from "aws-cdk-lib/aws-route53";
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";

const TENANTS = process.env.TENANTS!.split(",");

export class CertificateCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    let zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: "Z00378911J9CER9M71PUA",
      zoneName: "REDACTED.io",
    });

    const tenantDomains = TENANTS.map((tenant) => `${tenant}.REDACTED.io`);

    const frontendCert = new DnsValidatedCertificate(
      this,
      "FrontendCertificate",
      {
        hostedZone: zone,
        domainName: "REDACTED.io",
        region: "us-east-1",
        subjectAlternativeNames: [
          "staging.REDACTED.io",
          "production.REDACTED.io",
          ...tenantDomains,
        ],
        validation: acm.CertificateValidation.fromDns(zone),
      }
    );

    frontendCert.metricDaysToExpiry().createAlarm(this, "ExpireAlarm", {
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 45, // Automatic rotation happens between 60 and 45 days before expiry
    });

    const backendCert = new DnsValidatedCertificate(
      this,
      "BackendCertificate",
      {
        hostedZone: zone,
        domainName: "REDACTED.io",
        region: "eu-central-1",
        subjectAlternativeNames: [
          "api.staging.REDACTED.io",
          "api.production.REDACTED.io",
        ],
        validation: acm.CertificateValidation.fromDns(zone),
      }
    );

    const coveredDomains = [
      "staging.REDACTED.io",
      "production.REDACTED.io",
      ...tenantDomains,
    ].join(", ");

    new CfnOutput(this, "FrontendCertArn", {
      value: frontendCert.certificateArn,
      description: `Certificate arn for ${coveredDomains}`,
      exportName: "frontendCertArns",
    });

    new CfnOutput(this, "BackendCertArn", {
      value: backendCert.certificateArn,
      description: `Certificate arn for api.staging.REDACTED.io, api.production.REDACTED.io`,
      exportName: "backendCertArns",
    });
  }
}
