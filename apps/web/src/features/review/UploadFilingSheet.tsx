import { Link } from '@tanstack/react-router';
import { useRef, useState, type DragEvent, type ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import * as buttons from '../../styles/buttons.css';
import type { KeyedProvider } from '../settings/providers';
import * as styles from './uploadFiling.css';

/** Annual reports run a few megabytes; anything past this is a scan bundle, not a filing. */
export const MAX_FILING_BYTES = 25 * 1024 * 1024;

/** The inline validation line (frontend spec §3), or null for a usable file. */
export function validateFiling(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Choose a PDF: the annual report as the company filed it.';
  if (file.size > MAX_FILING_BYTES) {
    return 'That file is over 25 MB. Choose the report PDF itself, not a scan bundle.';
  }
  return null;
}

/** Paid, no-training rungs only: the confidential filter (main plan §6), by provider. */
export function confidentialEligible(provider: KeyedProvider): boolean {
  return provider.rungs.some(
    (rung) => rung.costTier !== 'free' && !rung.dataPolicy.trainsOnInputs
  );
}

/**
 * The file-upload picker (frontend spec §3): drop or browse a filing,
 * validation inline, a provider select wearing the data-policy words, and
 * the confidential toggle that filters the list to paid, no-training
 * endpoints. Kickoff hands the file to the in-page job and review mode
 * takes the entry layout over.
 */
export function UploadFilingSheet({
  open,
  onClose,
  providers,
  onStart
}: {
  open: boolean;
  onClose: () => void;
  /** Key-owning providers that actually hold a key on this device. */
  providers: readonly KeyedProvider[];
  onStart: (choice: { file: File; providerId: string; confidential: boolean }) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [confidential, setConfidential] = useState(false);
  const [dragging, setDragging] = useState(false);

  const offered = confidential ? providers.filter(confidentialEligible) : providers;
  const selected =
    providerId !== null && offered.some((provider) => provider.id === providerId)
      ? providerId
      : null;

  function take(candidate: File | undefined): void {
    if (candidate === undefined) return;
    const problem = validateFiling(candidate);
    setError(problem);
    setFile(problem === null ? candidate : null);
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files[0]);
  }

  return (
    <SheetShell open={open} onClose={onClose} label="Import a file">
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h2 className={styles.title}>Import a file</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        {providers.length === 0 ? (
          <p className={styles.noKeys}>
            Extraction runs with your own provider key, and none is stored on this device yet. Add
            one under{' '}
            <Link to="/settings/providers" className={styles.noKeysLink}>
              Settings, then Providers
            </Link>
            , and the filing goes straight from this browser to the provider you pick.
          </p>
        ) : (
          <>
            <div
              className={dragging ? styles.dropzoneActive : styles.dropzone}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {file === null ? (
                <span>Drop the annual report here, or</span>
              ) : (
                <span className={styles.fileName}>{file.name}</span>
              )}
              <button
                type="button"
                className={styles.browse}
                onClick={() => inputRef.current?.click()}
              >
                {file === null ? 'Browse for a PDF' : 'Choose a different PDF'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className={styles.hiddenInput}
                aria-label="Annual report PDF"
                onChange={(event) => take(event.target.files?.[0])}
              />
            </div>
            {error === null ? null : <p className={styles.error}>{error}</p>}

            <span className={styles.groupLabel} id="upload-provider-label">
              Provider
            </span>
            <div
              className={styles.providerList}
              role="radiogroup"
              aria-labelledby="upload-provider-label"
            >
              {offered.map((provider) => (
                <label key={provider.id} className={styles.providerOption}>
                  <span className={styles.providerName}>
                    <input
                      type="radio"
                      name="upload-provider"
                      value={provider.id}
                      checked={selected === provider.id}
                      onChange={() => setProviderId(provider.id)}
                    />
                    {provider.name}
                  </span>
                  <span className={styles.providerPolicy}>{provider.policyWords}</span>
                </label>
              ))}
            </div>

            <div className={styles.confidentialRow}>
              <span className={styles.confidentialText}>
                <span className={styles.confidentialLabel}>This document is confidential</span>
                <span className={styles.confidentialNote}>
                  Offers paid, no-training endpoints only.
                </span>
              </span>
              <ToggleSwitch
                label="This document is confidential"
                checked={confidential}
                onChange={setConfidential}
              />
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                className={buttons.primaryAction}
                disabled={file === null || selected === null}
                onClick={() => {
                  if (file !== null && selected !== null) {
                    onStart({ file, providerId: selected, confidential });
                  }
                }}
              >
                Extract
              </button>
            </div>
          </>
        )}
      </div>
    </SheetShell>
  );
}
