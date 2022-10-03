#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkStack } from "../lib/cdk-stack";
import { CertificateCdkStack } from "../lib/certificate-stack/certificate-stack";

const app = new cdk.App();

new CertificateCdkStack(app, "certificates-REDACTED-stack", {
  stackName: "certificates-REDACTED-stack",
});

new CdkStack(app, "staging-REDACTED-stack", {
  stackName: "staging-REDACTED-stack",
  deploymentEnv: "staging",
});

new CdkStack(app, "production-REDACTED-stack", {
  stackName: "production-REDACTED-stack",
  deploymentEnv: "production",
});
