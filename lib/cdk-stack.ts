import { Duration, Stack, StackProps, Tags } from "aws-cdk-lib";
import { GatewayVpcEndpoint, Port, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import createEnvBuckets from "./buckets/createEnvBuckets";
import createTenantsBuckets from "./buckets/createTenantsBuckets";
import createTenantsDistributions from "./distributions/createTenantsDistributions";
import createEnvDistribution from "./distributions/createEnvDistribution";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import createEnvVpc from "./vpc/createEnvVpc";
import createSqs from "./sqs/createSqs";
import createLogGroups from "./logs/createLogGroups";
import {
  AnyPrincipal,
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import createDatabaseCredentialsSecret from "./secrets/createDatabaseCredentialsSecret";
import createAurora from "./rds/createAurora";
import createCluster from "./ecs/createCluster";
import createStreamAndGrantPermissions from "./stream/createStreamAndGrantPermissions";
import { KinesisDestination } from "aws-cdk-lib/aws-logs-destinations";
import { FilterPattern, SubscriptionFilter } from "aws-cdk-lib/aws-logs";
import { CnameRecord, HostedZone } from "aws-cdk-lib/aws-route53";

export interface EnvCdkStackProps extends StackProps {
  deploymentEnv: "unstable" | "staging" | "production";
}

const TENANTS = process.env.TENANTS!.split(",");

const addPolicies = (
  stack: Stack,
  bucket: Bucket,
  s3GatewayEndpoint: GatewayVpcEndpoint
) => {
  bucket.addToResourcePolicy(
    new PolicyStatement({
      effect: Effect.DENY,
      resources: [bucket.bucketArn],
      actions: ["s3:ListBucket"],
      principals: [new AnyPrincipal()],
      conditions: {
        StringNotEquals: {
          "aws:sourceVpce": [s3GatewayEndpoint.vpcEndpointId],
        },
      },
    })
  );

  bucket.addToResourcePolicy(
    new PolicyStatement({
      effect: Effect.DENY,
      resources: [bucket.arnForObjects("*")],
      actions: ["s3:PutObject", "s3:GetObject"],
      principals: [new AnyPrincipal()],
      conditions: {
        StringNotEquals: {
          "aws:sourceVpce": [s3GatewayEndpoint.vpcEndpointId],
        },
      },
    })
  );
};

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: EnvCdkStackProps) {
    super(scope, id, props);

    if (!props?.deploymentEnv) throw new Error("Specify which env to run!");

    const { deploymentEnv } = props;
    const isProduction = deploymentEnv === "production";
    const DATABASE_NAME = `${deploymentEnv}apiREDACTED`;
    const zone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: "Z00378911J9CER9M71PUA",
      zoneName: "REDACTED.io",
    });
    // import certificate generated in precedent certificate stack
    const frontendCertificate = Certificate.fromCertificateArn(
      this,
      "FrontendCertificate",
      "arn:aws:acm:us-east-1:289305276559:certificate/06ce905b-fb1f-4f5b-8f18-28d868f4075d"
    );

    const backendCertificate = Certificate.fromCertificateArn(
      this,
      "BackendCertificate",
      "arn:aws:acm:eu-central-1:289305276559:certificate/a70537bf-df3a-4124-b704-9e87f96ac6e4"
    );

    // create env bucket (both frontend and backend) and distribution for frontend bucket
    const envBucket = createEnvBuckets(this, props!.deploymentEnv);
    const envDistribution = createEnvDistribution(
      this,
      props!.deploymentEnv,
      envBucket.frontendBucket,
      frontendCertificate
    );

    const envCname = new CnameRecord(this, "EnvFrontendDistribution", {
      recordName: deploymentEnv,
      domainName: envDistribution.domainName,
      zone,
    });

    if (isProduction) {
      const tenantBuckets = createTenantsBuckets(this, TENANTS);
      const frontendTenantsBuckets = tenantBuckets.map(
        ({ frontend, tenant }) => ({ tenant, frontend })
      );
      const distributions = createTenantsDistributions(
        this,
        frontendTenantsBuckets,
        frontendCertificate
      );
    }

    const [vpc, s3GatewayEndpoint] = createEnvVpc(this);
    const [sqsQueue, sqsEndpoint] = createSqs(this, vpc);

    addPolicies(this, envBucket.backendBucket, s3GatewayEndpoint);

    const databaseCredentialsSecret = createDatabaseCredentialsSecret(
      this,
      deploymentEnv
    );
    const database = createAurora(
      this,
      DATABASE_NAME,
      vpc,
      databaseCredentialsSecret
    );

    const logGroups = createLogGroups(this, deploymentEnv);

    const [cluster, fargate] = createCluster(
      this,
      vpc,
      deploymentEnv,
      logGroups,
      databaseCredentialsSecret,
      envBucket.backendBucket,
      database,
      DATABASE_NAME,
      sqsQueue,
      sqsEndpoint,
      backendCertificate
    );

    envBucket.backendBucket.grantReadWrite(fargate.taskDefinition.taskRole);
    envBucket.backendBucket.grantPut(fargate.taskDefinition.taskRole);

    database.grantDataApiAccess(fargate.taskDefinition.taskRole);
    database.connections.allowFrom(fargate.service.connections, Port.tcp(5432));

    sqsQueue.grantSendMessages(fargate.taskDefinition.taskRole);
    sqsQueue.grantConsumeMessages(fargate.taskDefinition.taskRole);

    const envALBCname = new CnameRecord(this, "EnvALBDistribution", {
      recordName: `api.${deploymentEnv}`,
      domainName: fargate.loadBalancer.loadBalancerDnsName,
      zone,
    });

    const role = new Role(this, "CloudWatchLogsCanPutRecords", {
      assumedBy: new ServicePrincipal("logs.amazonaws.com"),
    });
    const stream = createStreamAndGrantPermissions(this, role, deploymentEnv);

    const writeGrant = stream.grantWrite(role);
    const passGrant = role.grantPassRole(role);

    // the fix (will emit a single DependsOn for SubscriptionFilter in CF template):

    const destination = new KinesisDestination(stream, {
      role: role,
    });

    const subDjango = new SubscriptionFilter(
      this,
      `djangoLogGroup-SubscriptionFilter`,
      {
        logGroup: logGroups.djangoLogGroup,
        filterPattern: FilterPattern.allEvents(),
        destination: destination,
      }
    );

    writeGrant.applyBefore(subDjango);
    passGrant.applyBefore(subDjango);

    const subMigrator = new SubscriptionFilter(
      this,
      `djangoMigratorLogGroup-SubscriptionFilter`,
      {
        logGroup: logGroups.djangoMigratorLogGroup,
        filterPattern: FilterPattern.allEvents(),
        destination: destination,
      }
    );

    writeGrant.applyBefore(subMigrator);
    passGrant.applyBefore(subMigrator);

    const subNginx = new SubscriptionFilter(
      this,
      `nginxLogGroup-SubscriptionFilter`,
      {
        logGroup: logGroups.nginxLogGroup,
        filterPattern: FilterPattern.allEvents(),
        destination: destination,
      }
    );

    writeGrant.applyBefore(subNginx);
    passGrant.applyBefore(subNginx);

    const subDog = new SubscriptionFilter(
      this,
      `datadogLogGroup-SubscriptionFilter`,
      {
        logGroup: logGroups.datadogLogGroup,
        filterPattern: FilterPattern.allEvents(),
        destination: destination,
      }
    );

    writeGrant.applyBefore(subDog);
    passGrant.applyBefore(subDog);

    Tags.of(this).add("env", props!.deploymentEnv);
  }
}
