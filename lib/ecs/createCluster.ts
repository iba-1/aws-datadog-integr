import { Duration, Stack } from "aws-cdk-lib";
import { InterfaceVpcEndpoint, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import {
  Cluster,
  ContainerImage,
  FargateTaskDefinition,
  LogDrivers,
  Secret as EcsSecret,
  Protocol as ECSProtocol,
} from "aws-cdk-lib/aws-ecs";
import { SqsQueue } from "aws-cdk-lib/aws-events-targets";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Credentials, ServerlessCluster } from "aws-cdk-lib/aws-rds";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { EnvCdkStackProps } from "../cdk-stack";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import {
  ApplicationProtocol,
  ListenerCertificate,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

const createCluster = (
  stack: Stack,
  vpc: Vpc,
  env: EnvCdkStackProps["deploymentEnv"],
  logGroups: {
    djangoLogGroup: LogGroup;
    djangoMigratorLogGroup: LogGroup;
    nginxLogGroup: LogGroup;
    datadogLogGroup: LogGroup;
  },
  databaseCredentialsSecret: ISecret,
  backendBucket: Bucket,
  auroraServerlessCluster: ServerlessCluster,
  databaseName: string,
  sqsQueue: Queue,
  sqsEndpoint: InterfaceVpcEndpoint,
  certificate: ICertificate
): [Cluster, ApplicationLoadBalancedFargateService] => {
  const {
    djangoLogGroup,
    djangoMigratorLogGroup,
    nginxLogGroup,
    datadogLogGroup,
  } = logGroups;

  const apiRepository = Repository.fromRepositoryName(
    stack,
    "api",
    `${env}/api`
  );
  const apiImage = ContainerImage.fromEcrRepository(apiRepository, "latest");

  const nginxRepository = Repository.fromRepositoryName(
    stack,
    "nginx",
    `${env}/nginx`
  );
  const nginxImage = ContainerImage.fromEcrRepository(
    nginxRepository,
    "latest"
  );

  const datadogImage = ContainerImage.fromRegistry(
    "public.ecr.aws/datadog/agent:latest"
  );

  const cluster = new Cluster(stack, "Cluster", {
    clusterName: `ecs-cl-api-${env}`,
    vpc: vpc,
  });

  const taskDefinition = new FargateTaskDefinition(stack, "taskDefinition", {
    memoryLimitMiB: 2048,
    cpu: 1024,
  });

  // ORDER MATTERS? WHEN SWITCHING ORDER OF "ADDCONTAINER"
  /*
    REDACTED.io/infra on  wip/terraform [!] is 📦 v0.1.0 via  v14.19.0 on ☁️  REDACTED
    ❯ cdk deploy

    ✨  Synthesis time: 7.24s

    This deployment will make potentially sensitive changes according to your current security approval level (--require-approval broadening).
    Please confirm you intend to make the following modifications:

    Security Group Changes
    ┌───┬─────────────────────────────────────────────────┬─────┬──────────┬─────────────────────────────────────────────────┐
    │   │ Group                                           │ Dir │ Protocol │ Peer                                            │
    ├───┼─────────────────────────────────────────────────┼─────┼──────────┼─────────────────────────────────────────────────┤
    │ - │ ${FargateService/LB/SecurityGroup.GroupId}      │ Out │ TCP 5000 │ ${FargateService/Service/SecurityGroup.GroupId} │
    ├───┼─────────────────────────────────────────────────┼─────┼──────────┼─────────────────────────────────────────────────┤
    │ - │ ${FargateService/Service/SecurityGroup.GroupId} │ In  │ TCP 5000 │ ${FargateService/LB/SecurityGroup.GroupId}      │
    ├───┼─────────────────────────────────────────────────┼─────┼──────────┼─────────────────────────────────────────────────┤
    │ + │ ${FargateService/LB/SecurityGroup.GroupId}      │ Out │ TCP 80   │ ${FargateService/Service/SecurityGroup.GroupId} │
    ├───┼─────────────────────────────────────────────────┼─────┼──────────┼─────────────────────────────────────────────────┤
    │ + │ ${FargateService/Service/SecurityGroup.GroupId} │ In  │ TCP 80   │ ${FargateService/LB/SecurityGroup.GroupId}      │
    └───┴─────────────────────────────────────────────────┴─────┴──────────┴─────────────────────────────────────────────────┘
   
    */
  taskDefinition.addContainer("nginx", {
    image: nginxImage,
    memoryReservationMiB: 256,
    logging: LogDrivers.awsLogs({
      streamPrefix: env,
      logGroup: nginxLogGroup,
    }),
    portMappings: [
      {
        containerPort: 80,
        hostPort: 80,
      },
      {
        containerPort: 443,
        hostPort: 443,
      },
    ],
  });

  taskDefinition.addContainer("django", {
    image: apiImage,
    memoryReservationMiB: 512,
    logging: LogDrivers.awsLogs({
      streamPrefix: "django-logs",
      logGroup: djangoLogGroup,
    }),
    command: [
      "ddtrace-run",
      "/usr/local/bin/gunicorn",
      "config.wsgi",
      "--bind",
      "127.0.0.1:5000",
      "--chdir=/app",
    ],
    portMappings: [
      {
        containerPort: 5000,
      },
    ],
    environment: {
      USE_DOCKER: "yes",
      DJANGO_SETTINGS_MODULE: "config.settings.production",
      DJANGO_SECRET_KEY: "ASADASDASDASDASDASD",
      DJANGO_AWS_ACCESS_KEY_ID: process.env.DJANGO_AWS_ACCESS_KEY_ID!,
      DJANGO_AWS_SECRET_ACCESS_KEY: process.env.DJANGO_AWS_SECRET_ACCESS_KEY!,
      DJANGO_AWS_STORAGE_BUCKET_NAME: backendBucket.bucketName,
      DJANGO_AWS_S3_REGION_NAME: "eu-central-1",
      DJANGO_ADMIN_URL: process.env.DJANGO_ADMIN_URL!,
      DJANGO_SUPERUSER_EMAIL: process.env.DJANGO_SUPERUSER_EMAIL!,
      DJANGO_SUPERUSER_PASSWORD: process.env.DJANGO_SUPERUSER_PASSWORD!,
      DJANGO_SUPERUSER_DATABASE: process.env.DJANGO_SUPERUSER_DATABASE!,
      DJANGO_DEBUG: process.env.DJANGO_DEBUG!,
      AWS_ACCESS_KEY_FOR_ANYMAIL_SES: process.env.EMAIL_HOST_USER!,
      AWS_SECRET_KEY_FOR_ANYMAIL_SES: process.env.EMAIL_HOST_PASSWORD!,
      DATABASE_URL: `postgres://${
        Credentials.fromSecret(databaseCredentialsSecret).username
      }:${
        Credentials.fromSecret(
          databaseCredentialsSecret
        ).password?.unsafeUnwrap() ?? ""
      }@${
        auroraServerlessCluster.clusterEndpoint.hostname
      }:5432/${databaseName}`,
      DJANGO_ALLOWED_HOSTS:
        ".eu-central-1.elb.amazonaws.com,.REDACTED.io,unstable.REDACTED.io,staging.REDACTED.io",
      // DJANGO_AWS_S3_CUSTOM_DOMAIN: s3GatewayEndpoint.vpcEndpointDnsEntries.,
      SENTRY_DSN: process.env.SENTRY_DSN!,
      secretArn: databaseCredentialsSecret.secretArn,
      dbClusterArn: auroraServerlessCluster.clusterArn,
      bucketName: backendBucket.bucketName,
      CELERY_BROKER_URL: sqsQueue.queueUrl,
      region: process.env.CDK_DEFAULT_REGION!,
      POSTGRES_DB: databaseName,
      REDIS_URL: "redis://redis:6379/0",
      POSTGRES_HOST: auroraServerlessCluster.clusterEndpoint.hostname,
      POSTGRES_USER: Credentials.fromSecret(databaseCredentialsSecret).username,
      POSTGRES_PASSWORD:
        Credentials.fromSecret(
          databaseCredentialsSecret
        ).password?.unsafeUnwrap() ?? "",
      POSTGRES_PORT: "5432",
    },
  });

  taskDefinition.addContainer("django-migrator", {
    image: apiImage,
    logging: LogDrivers.awsLogs({
      streamPrefix: "django-migrator-logs",
      logGroup: djangoMigratorLogGroup,
    }),
    portMappings: [
      {
        containerPort: 5001,
      },
    ],
    memoryReservationMiB: 256,
    essential: false,
    command: ["python", "manage.py", "migrate"],
    environment: {
      USE_DOCKER: "yes",
      DJANGO_SETTINGS_MODULE: "config.settings.production",
      DJANGO_SECRET_KEY: "ASADASDASDASDASDASD",
      DJANGO_AWS_ACCESS_KEY_ID: process.env.DJANGO_AWS_ACCESS_KEY_ID!,
      DJANGO_AWS_SECRET_ACCESS_KEY: process.env.DJANGO_AWS_SECRET_ACCESS_KEY!,
      DJANGO_AWS_STORAGE_BUCKET_NAME: backendBucket.bucketName,
      DJANGO_AWS_S3_REGION_NAME: "eu-central-1",
      DJANGO_ADMIN_URL: process.env.DJANGO_ADMIN_URL!,
      DJANGO_DEBUG: process.env.DJANGO_DEBUG!,
      DJANGO_SUPERUSER_EMAIL: process.env.DJANGO_SUPERUSER_EMAIL!,
      DJANGO_SUPERUSER_PASSWORD: process.env.DJANGO_SUPERUSER_PASSWORD!,
      DJANGO_SUPERUSER_DATABASE: process.env.DJANGO_SUPERUSER_DATABASE!,
      AWS_ACCESS_KEY_FOR_ANYMAIL_SES: process.env.EMAIL_HOST_USER!,
      AWS_SECRET_KEY_FOR_ANYMAIL_SES: process.env.EMAIL_HOST_PASSWORD!,
      DJANGO_ALLOWED_HOSTS:
        ".eu-central-1.elb.amazonaws.com,.REDACTED.io,unstable.REDACTED.io,staging.REDACTED.io",
      // DJANGO_AWS_S3_CUSTOM_DOMAIN: s3GatewayEndpoint.vpcEndpointDnsEntries.,
      SENTRY_DSN: process.env.SENTRY_DSN!,
      secretArn: databaseCredentialsSecret.secretArn,
      dbClusterArn: auroraServerlessCluster.clusterArn,
      bucketName: backendBucket.bucketName,
      CELERY_BROKER_URL: sqsQueue.queueUrl,
      region: process.env.CDK_DEFAULT_REGION!,
      POSTGRES_DB: databaseName,
      REDIS_URL: "redis://redis:6379/0",
      POSTGRES_HOST: auroraServerlessCluster.clusterEndpoint.hostname,
      POSTGRES_USER: Credentials.fromSecret(databaseCredentialsSecret).username,
      POSTGRES_PASSWORD:
        Credentials.fromSecret(
          databaseCredentialsSecret
        ).password?.unsafeUnwrap() ?? "",
      POSTGRES_PORT: "5432",
    },
  });

  taskDefinition.addContainer("Datadog", {
    image: datadogImage,
    memoryLimitMiB: 256,
    containerName: "datadog",
    logging: LogDrivers.awsLogs({
      streamPrefix: "datadog",
      logGroup: datadogLogGroup,
    }),
    portMappings: [
      {
        hostPort: 8126,
        protocol: ECSProtocol.TCP,
        containerPort: 8126,
      },
    ],
    environment: {
      ECS_FARGATE: "true",
      DD_SITE: "datadoghq.eu",
      DD_APM_ENABLED: "true",
      DD_APM_NON_LOCAL_TRAFFIC: "true",
      // DO NOT UNSET THIS AS THIS PUNKASS DEFAULTS TO 5000 AND CONFLICTS WITH GUNICORN
      DD_EXPVAR_PORT: "5002",
    },
    secrets: {
      DD_API_KEY: EcsSecret.fromSecretsManager(
        Secret.fromSecretCompleteArn(
          stack,
          "DDApiKeySecret",
          "arn:aws:secretsmanager:eu-central-1:289305276559:secret:DdApiKeySecret-QC5YJzXBCamv-k6aXpw"
        )
      ),
    },
  });

  const fargate = new ApplicationLoadBalancedFargateService(
    stack,
    "FargateService",
    {
      serviceName: `ecs-cl-service-${env}`,
      cluster: cluster,
      cpu: 1024,
      desiredCount: 1,
      taskDefinition,
      assignPublicIp: true,
      memoryLimitMiB: 2048,
      openListener: true,
      listenerPort: 80,
      enableExecuteCommand: true,
      protocol: ApplicationProtocol.HTTP,
      publicLoadBalancer: true,
    }
  );

  // TODO: add sg from fargate to aurora
  fargate.targetGroup.configureHealthCheck({
    path: "/heartbeat",
    port: "80",
    interval: Duration.seconds(120),
    unhealthyThresholdCount: 5,
  });

  fargate.loadBalancer
    .addListener("HTTPS", {
      port: 443,
      open: true,
      protocol: ApplicationProtocol.HTTPS,
      certificates: [ListenerCertificate.fromArn(certificate.certificateArn)],
    })
    .addTargets("fargateTarget", {
      targets: [fargate.service],
      port: 80,
      protocol: ApplicationProtocol.HTTP,
    })
    .configureHealthCheck({
      path: "/heartbeat",
      port: "80",
      interval: Duration.seconds(120),
      unhealthyThresholdCount: 5,
    });

  fargate.taskDefinition.addToTaskRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ["*"],
      actions: ["ses:SendEmail", "ses:SendTemplatedEmail", "ses:SendRawEmail"],
      conditions: {
        ArnEquals: {
          "aws:PrincipalArn": `${fargate.taskDefinition.taskRole.roleArn}`,
        },
      },
    })
  );

  sqsEndpoint.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      actions: ["sqs:SendMessage", "sqs:ReceiveMessage"],
      resources: [sqsQueue.queueArn],
      conditions: {
        ArnEquals: {
          "aws:PrincipalArn": `${fargate.taskDefinition.taskRole.roleArn}`,
        },
      },
    })
  );

  return [cluster, fargate];
};

export default createCluster;
