/**
 * The budget kill switch (cdk spec §8; backend spec §10): flips the runtime
 * extraction feature flag to 'false'. Subscribed to a dedicated SNS topic
 * that only the budget's kill-switch-threshold notification publishes to, so
 * arriving at all IS the signal: no message parsing, no thresholds in code.
 * Extraction and proxy Lambdas read the flag per invocation and answer with
 * the feature_disabled envelope the client already renders.
 */
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { SNSEvent } from 'aws-lambda';

let client: SSMClient | undefined;

export const handler = async (event: SNSEvent): Promise<{ flipped: string }> => {
  const parameterName = process.env['EXTRACTION_FLAG_PARAMETER'];
  if (!parameterName) throw new Error('EXTRACTION_FLAG_PARAMETER is not set');
  client ??= new SSMClient({});
  await client.send(
    new PutParameterCommand({ Name: parameterName, Value: 'false', Overwrite: true })
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
