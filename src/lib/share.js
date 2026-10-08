/** Share via the phone's share sheet when asked to (and available), otherwise copy. */
export async function shareOrCopy(text, { title, preferShare = false } = {}) {
  if (preferShare && navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.className = 'sr-only';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copied' : 'failed';
  }
}

export const shareMessage = (result) =>
  result === 'copied' ? 'Copied to clipboard' : result === 'failed' ? 'Could not copy — select it and copy manually' : null;
