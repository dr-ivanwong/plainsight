/**
 * Provider-credential repository: the BYOK keys, one per provider, in the
 * one table the export format's allowlist can never reach (data-model spec
 * §5). Keys live on this device and nowhere else; deleting the row is the
 * whole story of revocation on our side, and the key-hygiene copy on the
 * providers screen tells the owner to rotate provider-side too.
 */
import type { PlainsightDb } from './db';
import { providerCredentialRecordSchema, type ProviderCredentialRecord } from './records';

export interface CredentialWrite {
  providerId: string;
  key: string;
  label?: string;
}

export async function putCredential(
  db: PlainsightDb,
  input: CredentialWrite
): Promise<ProviderCredentialRecord> {
  const record = providerCredentialRecordSchema.parse({
    providerId: input.providerId,
    key: input.key,
    label: input.label ?? '',
    addedAt: new Date().toISOString()
  });
  await db.providerCredentials.put(record);
  return record;
}

export async function deleteCredential(db: PlainsightDb, providerId: string): Promise<void> {
  await db.providerCredentials.delete(providerId);
}
