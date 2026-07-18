import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactElement } from 'react';

import { beginSignIn, signOut } from '../../auth/session';
import { SegmentedControl } from '../../components/SegmentedControl';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { db, setMeta, type MetaValue } from '../../db';
import * as styles from './settings.css';

type ThemeSetting = MetaValue<'theme'>;

const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
] as const;

/**
 * The settings root (frontend spec §3): appearance, providers, data and
 * storage, and about, each behind its row. Both appearance settings live in
 * meta and apply live: the theme through the shell's data-theme attribute,
 * the Owner's lens through every detail sheet.
 */
export function SettingsScreen(): ReactElement {
  // Raw reads keep the queriers pure; a malformed row reads as the default.
  const themeRow = useLiveQuery(() => db.meta.get('theme'), []);
  const educationRow = useLiveQuery(() => db.meta.get('educationLayerOff'), []);
  const sessionRow = useLiveQuery(() => db.meta.get('authSession'), []);

  const themeValue = themeRow?.value;
  const theme: ThemeSetting =
    themeValue === 'light' || themeValue === 'dark' ? themeValue : 'auto';
  const lensOn = educationRow?.value !== true;
  const sessionEmail =
    sessionRow !== undefined &&
    typeof sessionRow.value === 'object' &&
    sessionRow.value !== null &&
    'email' in sessionRow.value &&
    typeof sessionRow.value.email === 'string'
      ? sessionRow.value.email
      : null;

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/" className={styles.back}>
          ‹ Library
        </Link>
        <h1 className={styles.title}>Settings</h1>
        <span />
      </header>

      <section className={styles.group} aria-label="Appearance">
        <h2 className={styles.groupTitle}>Appearance</h2>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>Theme</span>
            <span className={styles.rowNote}>Auto follows this device.</span>
          </div>
          <SegmentedControl
            label="Theme"
            options={THEME_OPTIONS}
            value={theme}
            onChange={(next) => void setMeta(db, 'theme', next)}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>Owner&apos;s lens</span>
            <span className={styles.rowNote}>Plain-language context beside every number.</span>
          </div>
          <ToggleSwitch
            label="Owner's lens"
            checked={lensOn}
            onChange={(on) => void setMeta(db, 'educationLayerOff', !on)}
          />
        </div>
      </section>

      <section className={styles.group} aria-label="Providers">
        <Link to="/settings/providers" className={styles.rowLink}>
          <span className={styles.rowLabel}>Providers</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      </section>

      <section className={styles.group} aria-label="Data">
        <Link to="/settings/data" className={styles.rowLink}>
          <span className={styles.rowLabel}>Data &amp; storage</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      </section>

      <section className={styles.group} aria-label="Sync">
        <h2 className={styles.groupTitle}>Sync</h2>
        {sessionEmail === null ? (
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Sign in</span>
              <span className={styles.rowNote}>
                Everything works on this device without it; signing in lets your devices keep
                each other in step.
              </span>
            </div>
            {navigator.onLine ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void beginSignIn()}
              >
                Sign in
              </button>
            ) : (
              <span className={styles.rowNote}>Available when online.</span>
            )}
          </div>
        ) : (
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Signed in</span>
              <span className={styles.rowNote}>{sessionEmail}</span>
            </div>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </section>

      <section className={styles.group} aria-label="About">
        <h2 className={styles.groupTitle}>About</h2>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Version</span>
          <span className={styles.rowNote}>{__APP_VERSION__}</span>
        </div>
        <Link to="/onboarding" className={styles.rowLink}>
          <span className={styles.rowLabel}>Replay the welcome</span>
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </Link>
      </section>
    </>
  );
}
