/**
 * Copies text to the clipboard using the execCommand fallback that works
 * reliably inside Electron's context-isolated renderer (see FE-04 convention).
 *
 * navigator.clipboard.writeText() is intentionally avoided here because it
 * silently fails in certain Electron security contexts.
 */
export const copyText = (text: string): void => {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy'); // eslint-disable-line
  document.body.removeChild(el);
};
