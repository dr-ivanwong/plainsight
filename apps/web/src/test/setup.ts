// Registers the jest-dom matchers (toBeVisible and friends) with Vitest's
// expect. Testing Library's automatic cleanup between tests relies on the
// global afterEach that `test.globals: true` provides (vitest.config.ts).
import '@testing-library/jest-dom/vitest';

// jsdom implements none of the dialog element's methods, but the sheet
// primitive leans on the real contract (open attribute, close event). A
// minimal stand-in fills the gap for component tests; browsers use the native
// implementation.
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
