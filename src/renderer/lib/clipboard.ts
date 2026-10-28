/**
 * Copies text to the clipboard and returns whether it worked.
 *
 * `navigator.clipboard` is avoided (FE-04): it's unreliable in Electron's
 * context-isolated renderer.
 *
 * The usual textarea + `select()` fallback doesn't work while an MUI Menu,
 * Dialog or Popover is open: their focus trap pulls focus back into the
 * overlay as soon as the textarea is focused, the selection is lost, and
 * `execCommand('copy')` copies nothing. Instead, this writes the text in a
 * `copy` event listener, which needs no focus or selection.
 *
 * The browser fires that `copy` event at wherever the page selection last
 * was. After the user has typed or pasted in Monaco, that's Monaco's hidden
 * textarea, and Monaco's own copy handler would overwrite our text with the
 * current editor line (often just "\n"). So the listener runs first (window,
 * capture phase) and stops the event before Monaco sees it.
 */
export const copyText = (text: string): boolean => {
  let copied = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    event.stopImmediatePropagation();
    copied = true;
  };

  window.addEventListener('copy', onCopy, true);
  try {
    document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    window.removeEventListener('copy', onCopy, true);
  }
  return copied;
};
