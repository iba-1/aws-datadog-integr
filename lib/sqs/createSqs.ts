import { Stack } from "aws-cdk-lib";
import {
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";

const createSqs = (stack: Stack, vpc: Vpc): [Queue, InterfaceVpcEndpoint] => {
  const sqsQueue = new Queue(stack, "Queue", {
    encryption: QueueEncryption.KMS_MANAGED,
  });

  const sqsEndpoint = vpc.addInterfaceEndpoint("SqsInterfaceEndpoint", {
    service: InterfaceVpcEndpointAwsService.SQS,
  });

  sqsQueue.addToResourcePolicy(
    new PolicyStatement({
      effect: Effect.DENY,
      resources: [sqsQueue.queueArn],
      actions: ["sqs:SendMessage", "sqs:ReceiveMessage"],
      principals: [new AnyPrincipal()],
      conditions: {
        StringNotEquals: {
          "aws:sourceVpce": [sqsEndpoint.vpcEndpointId],
        },
      },
    })
  );

  return [sqsQueue, sqsEndpoint];
};

export default createSqs;
