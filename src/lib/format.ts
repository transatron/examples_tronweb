/** Convert a hex string to a UTF-8 string. */
export function hexToUnicode(hex: string | null | undefined): string {
  if (hex != null && hex.length > 0) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
  return '';
}

/** Format a SUN value to a human-readable decimal string (÷ 1_000_000). */
export function formatSun(sun: number): string {
  return (sun * 0.000001).toFixed(2);
}

/** Check if an object is null/undefined or empty `{}`. */
export function isObjectEmpty(obj: unknown): boolean {
  return obj == null || JSON.stringify(obj) === '{}';
}
