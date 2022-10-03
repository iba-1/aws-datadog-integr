import { Duration, Stack } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import {
  AuroraCapacityUnit,
  AuroraPostgresEngineVersion,
  Credentials,
  DatabaseClusterEngine,
  ServerlessCluster,
} from "aws-cdk-lib/aws-rds";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

const createAurora = (
  stack: Stack,
  databaseName: string,
  vpc: Vpc,
  databaseCredentialsSecret: Secret
) => {
  const auroraServerlessCluster = new ServerlessCluster(
    stack,
    "AuroraServerlessCluster",
    {
      defaultDatabaseName: databaseName,
      enableDataApi: true,
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_10_18,
      }),
      credentials: Credentials.fromSecret(databaseCredentialsSecret),
      vpc,
      scaling: {
        autoPause: Duration.minutes(10),
        minCapacity: AuroraCapacityUnit.ACU_2,
        maxCapacity: AuroraCapacityUnit.ACU_8,
      },
    }
  );

  return auroraServerlessCluster;
};

export default createAurora;
