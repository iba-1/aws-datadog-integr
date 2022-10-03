import { Stack } from "aws-cdk-lib";
import {
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  Vpc,
} from "aws-cdk-lib/aws-ec2";

const createEnvVpc = (stack: Stack): [Vpc, GatewayVpcEndpoint] => {
  const vpc = new Vpc(stack, "Vpc", {
    maxAzs: 3,
  });

  const s3GatewayEndpoint = vpc.addGatewayEndpoint("s3GatewayEndpoint", {
    service: GatewayVpcEndpointAwsService.S3,
  });

  return [vpc, s3GatewayEndpoint];
};

export default createEnvVpc;
