/**
 * The budget kill switch (cdk spec §8; backend spec §10): flips the runtime
 * extraction feature flag to 'false'. Subscribed to a dedicated SNS topic
 * that only the budget's kill-switch-threshold notification publishes to, so
 * arriving at all IS the signal: no message parsing, no thresholds in code.
 * Extraction and proxy Lambdas read the flag per invocation and answer with
 * the feature_disabled envelope the client already renders.
 *
 * After flipping, the handler tells the alert topic in plain words: AWS
 * Budgets allows one SNS subscriber per notification, so the kill threshold
 * cannot also notify the alert topic directly; this relay is how the owner
 * still hears about it, along with the more useful fact that the switch has
 * already been thrown.
 */
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { SNSEvent } from 'aws-lambda';

let ssm: SSMClient | undefined;
let sns: SNSClient | undefined;

export const handler = async (event: SNSEvent): Promise<{ flipped: string }> => {
  const parameterName = process.env['EXTRACTION_FLAG_PARAMETER'];
  if (!parameterName) throw new Error('EXTRACTION_FLAG_PARAMETER is not set');
  const alertTopicArn = process.env['ALERT_TOPIC_ARN'];
  if (!alertTopicArn) throw new Error('ALERT_TOPIC_ARN is not set');
  ssm ??= new SSMClient({});
  await ssm.send(
    new PutParameterCommand({ Name: parameterName, Value: 'false', Overwrite: true })
  );
  sns ??= new SNSClient({});
  await sns.send(
    new PublishCommand({
      TopicArn: alertTopicArn,
      Subject: 'Plainsight: extraction disabled at the budget kill threshold',
      Message:
        'The monthly budget crossed its kill threshold, and the runtime extraction flag is now ' +
        'false: nothing extraction-shaped spends until the flag is reset. The reset procedure ' +
        'is in the runbook under kill-switch reset.'
    })
  );
  console.log(
    JSON.stringify({
      route: 'killSwitchFlipper',
      outcome: 'flipped_off',
      parameter: parameterName,
      messages: event.Records.length
    })
  );
  return { flipped: parameterName };
};
