import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { EnvCdkStackProps } from "../cdk-stack";

const createLogGroups = (
  stack: Stack,
  env: EnvCdkStackProps["deploymentEnv"]
) => {
  const djangoLogGroup = new LogGroup(stack, "APILogGroup", {
    logGroupName: `/ecs/${env}.REDACTED.io/django-api`,
    retention: RetentionDays.SIX_MONTHS,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const djangoMigratorLogGroup = new LogGroup(stack, "MigratorLogGroup", {
    logGroupName: `/ecs/${env}.REDACTED.io/django-migrator`,
    retention: RetentionDays.SIX_MONTHS,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const nginxLogGroup = new LogGroup(stack, "NginxLogGroup", {
    logGroupName: `/ecs/${env}.REDACTED.io/nginx`,
    retention: RetentionDays.SIX_MONTHS,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  const datadogLogGroup = new LogGroup(stack, "DatadogLogGroup", {
    logGroupName: `/ecs/${env}.REDACTED.io/datadog`,
    retention: RetentionDays.SIX_MONTHS,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  return {
    djangoLogGroup,
    djangoMigratorLogGroup,
    nginxLogGroup,
    datadogLogGroup,
  };
};

export default createLogGroups;
