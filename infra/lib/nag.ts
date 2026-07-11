import { Validations } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

/**
 * Acknowledge a cdk-nag finding on a construct (covers descendants, since
 * cdk-nag walks ancestor scopes when matching).
 *
 * Plain rule ids go through the first-class Validations API. Granular finding
 * ids (for example IAM5's 'AwsSolutions-IAM5[Resource::...]') embed '::',
 * which `Validations.acknowledge()` rejects as a reserved delimiter in
 * aws-cdk-lib 2.261 / cdk-nag 3.0.1; for those this writes the identical
 * metadata entry the API would have written (cdk-nag's matcher reads the raw
 * key), keeping the reason in the audit trail. Remove the branch when the two
 * libraries reconcile the granular-id format.
 */
export function acknowledgeNagFinding(scope: IConstruct, id: string, reason: string): void {
  if (id.includes('::')) {
    scope.node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, { [id]: reason });
    return;
  }
  Validations.of(scope).acknowledge({ id, reason });
}
