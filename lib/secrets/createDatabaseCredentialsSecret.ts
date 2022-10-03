import { Stack } from "aws-cdk-lib";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { EnvCdkStackProps } from "../cdk-stack";

const createDatabaseCredentialsSecret = (
  stack: Stack,
  env: EnvCdkStackProps["deploymentEnv"]
) => {
  const databaseCredentialsSecret = new Secret(stack, "DBCredentialsSecret", {
    secretName: `${env}-database-credentials-api`,
    description:
      "RDS database auto-generated user password for staging environment, service API",
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: `REDACTED${env}` }),
      generateStringKey: "password",
      passwordLength: 16,
      excludePunctuation: true,
    },
  });

  return databaseCredentialsSecret;
};
export default createDatabaseCredentialsSecret;
