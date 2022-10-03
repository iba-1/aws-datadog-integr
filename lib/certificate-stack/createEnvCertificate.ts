// import * as route53 from "aws-cdk-lib/aws-route53";
// import * as acm from "aws-cdk-lib/aws-certificatemanager";
// import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
// import { Stack } from "aws-cdk-lib";
// import { ARecord } from "aws-cdk-lib/aws-route53";
// import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";

// const TENANTS = process.env.TENANTS!.split(",");

// const createEnvCertificate = (stack: Stack) => {
//   // TODO move hosted zone id to process.env
//   let zone = route53.HostedZone.fromHostedZoneAttributes(stack, "HostedZone", {
//     hostedZoneId: "Z00378911J9CER9M71PUA",
//     zoneName: "REDACTED.io",
//   });

//   const tenantDomains = TENANTS.map((tenant) => `${tenant}.REDACTED.io`);

//   const cert = new DnsValidatedCertificate(stack, "Certificate", {
//     hostedZone: zone,
//     domainName: "REDACTED.io",
//     region: "us-east-1",
//     subjectAlternativeNames: [
//       "staging.REDACTED.io",
//       "production.REDACTED.io",
//       "api.staging.REDACTED.io",
//       "api.production.REDACTED.io",
//       ...tenantDomains,
//     ],
//     validation: acm.CertificateValidation.fromDns(zone),
//   });

//   cert.metricDaysToExpiry().createAlarm(stack, "ExpireAlarm", {
//     comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
//     evaluationPeriods: 1,
//     threshold: 45, // Automatic rotation happens between 60 and 45 days before expiry
//   });

//   return cert;
// };

// export default createEnvCertificate;
