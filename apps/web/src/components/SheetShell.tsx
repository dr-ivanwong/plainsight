import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

import { RegionBoundary } from './RegionBoundary';
import * as styles from './sheetShell.css';

/**
 * The sheet primitive (frontend spec §5). A native dialog carries the heavy
 * accessibility lifting: focus moves in on open and returns to the trigger on
 * close, Escape cancels, and the page behind is inert. The route owns the
 * query param that opens it; this shell only mirrors `open` into the dialog
 * and reports every close (Escape, scrim tap, cancel button) through onClose
 * so the route can clear the param.
 */
export function SheetShell({
  open,
  onClose,
  label,
  children
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // Only the scrim (the dialog element itself) dismisses; the panel's
        // content never bubbles a close.
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      {/* Every sheet body is a feature region (frontend spec section 2): a
          crash inside stays inside the dialog, which still closes natively. */}
      {open ? <RegionBoundary region="This sheet">{children}</RegionBoundary> : null}
    </dialog>
  );
}
