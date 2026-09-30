/** Trigger a browser download of `text` without touching any storage. */
export function downloadText(fileName: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type CopyOutcome = 'copied' | 'downloaded';

/**
 * Copy to the clipboard. Cribl Apps run in a sandboxed iframe where the Clipboard API can be
 * blocked, so fall back to downloading the snippet instead of failing silently.
 */
export async function copyOrDownload(text: string, fallbackFileName: string): Promise<CopyOutcome> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    downloadText(fallbackFileName, text);
    return 'downloaded';
  }
}
