import type { Scale } from '@plainsight/calc-engine';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react';

import {
  caretAfterReformat,
  formatEntryText,
  isValidTyping,
  parseEntryText,
  reformatTyping,
  type EntryUnit
} from './moneyEntry';
import * as styles from './moneyField.css';

/** What a field can hold: stored units, unknown, or the not-reported-zero assertion. */
export type FieldValue = number | null | 'zero';

const textFromValue = (value: FieldValue, scale: Scale, unit: EntryUnit): string =>
  typeof value === 'number' ? formatEntryText(value, { scale, unit }) : '';

/**
 * The numeric entry input (frontend spec §5): thousands separators as you
 * type, sign rules per the sign-convention policy, and the not-reported-zero
 * affordance in each field's overflow menu (data-model spec §8). Holds its
 * own text while focused and commits on blur or Enter; a derived figure
 * renders grey as the placeholder, which entering a value overrides
 * (as-reported precedence, data-model spec §4).
 */
export function MoneyField({
  value,
  scale,
  unit,
  signed,
  label,
  onCommit,
  derivedMinor,
  dataRow,
  dataCol
}: {
  value: FieldValue;
  scale: Scale;
  unit: EntryUnit;
  signed: boolean;
  label: string;
  onCommit: (next: FieldValue) => void;
  derivedMinor?: number;
  dataRow?: number;
  dataCol?: number;
}): ReactElement {
  const [text, setText] = useState(() => textFromValue(value, scale, unit));
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const caretRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  // What this field last sent upward. Enter commits and the focus move then
  // blurs before the store's round trip refreshes the prop; without this
  // baseline the blur would commit the same value again.
  const lastSentRef = useRef<FieldValue | undefined>(undefined);
  const format = { scale, unit, signed };

  // External writes re-display, but never under an editing cursor.
  useEffect(() => {
    lastSentRef.current = undefined;
    if (!focusedRef.current) setText(textFromValue(value, scale, unit));
  }, [value, scale, unit]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caretRef.current !== null && input !== null && document.activeElement === input) {
      input.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  }, [text]);

  useEffect(() => {
    if (menuOpen) {
      wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [menuOpen]);

  function handleBeforeInput(event: FormEvent<HTMLInputElement>): void {
    const native = event.nativeEvent as InputEvent;
    if (native.data == null) return;
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const predicted = input.value.slice(0, start) + native.data + input.value.slice(end);
    if (!isValidTyping(predicted, format)) event.preventDefault();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value;
    // The belt behind beforeinput: React restores a controlled input when
    // state does not change, so refusing here reverts the edit.
    if (!isValidTyping(raw, format)) return;
    const caret = event.target.selectionStart ?? raw.length;
    const formatted = reformatTyping(raw);
    caretRef.current = caretAfterReformat(raw, caret, formatted);
    setText(formatted);
  }

  /** The value this field currently stands for: the last commit it sent, else the prop. */
  function baselineValue(): FieldValue {
    return lastSentRef.current !== undefined ? lastSentRef.current : value;
  }

  function commit(): void {
    const parsed = parseEntryText(text, format);
    if (!parsed.ok) {
      setText(textFromValue(baselineValue(), scale, unit));
      return;
    }
    const baseline = baselineValue();
    if (parsed.minor !== (typeof baseline === 'number' ? baseline : null)) {
      lastSentRef.current = parsed.minor;
      onCommit(parsed.minor);
    }
    setText(parsed.minor === null ? '' : formatEntryText(parsed.minor, { scale, unit }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setText(textFromValue(baselineValue(), scale, unit));
  }

  function handleWrapBlur(event: FocusEvent<HTMLSpanElement>): void {
    if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
  }

  function chooseZero(): void {
    setMenuOpen(false);
    lastSentRef.current = 'zero';
    onCommit('zero');
  }

  function clearZero(): void {
    setMenuOpen(false);
    lastSentRef.current = null;
    onCommit(null);
    triggerRef.current?.focus();
  }

  return (
    <span className={styles.wrap} ref={wrapRef} onBlur={handleWrapBlur}>
      {value === 'zero' ? (
        <button
          type="button"
          ref={triggerRef}
          className={styles.zeroChip}
          aria-label={`${label}, not reported, counted as zero`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-row={dataRow}
          data-col={dataCol}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ∅0
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={styles.input}
            aria-label={label}
            value={text}
            placeholder={
              derivedMinor === undefined ? undefined : formatEntryText(derivedMinor, { scale, unit })
            }
            data-row={dataRow}
            data-col={dataCol}
            onBeforeInput={handleBeforeInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onBlur={() => {
              focusedRef.current = false;
              commit();
            }}
          />
          <button
            type="button"
            ref={triggerRef}
            className={styles.menuButton}
            aria-label={`${label}, options`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
        </>
      )}
      {menuOpen ? (
        <div
          role="menu"
          className={styles.menu}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          {value === 'zero' ? (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={clearZero}>
              Clear not reported
            </button>
          ) : (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={chooseZero}>
              Not reported → 0
            </button>
          )}
        </div>
      ) : null}
    </span>
  );
}
