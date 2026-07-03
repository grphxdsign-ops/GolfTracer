/**
 * Pure-TS base64 decoder. `atob` is not guaranteed on Hermes, so the frame
 * bridge decodes luma payloads with this instead.
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CHAR_TO_BITS: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  CHAR_TO_BITS[ALPHABET.charAt(i)] = i;
}

/**
 * Decodes a standard (RFC 4648) base64 string, with or without `=` padding.
 * Throws on any character outside the standard alphabet or an impossible
 * length (a single trailing sextet cannot encode a byte).
 */
export function decodeBase64(input: string): Uint8Array {
  let end = input.length;
  while (end > 0 && input.charAt(end - 1) === '=') {
    end--;
  }
  if (input.length - end > 2) {
    throw new Error('Invalid base64: too much padding');
  }
  const rem = end % 4;
  if (rem === 1) {
    throw new Error('Invalid base64: dangling character');
  }

  const outLength = Math.floor((end * 3) / 4);
  const out = new Uint8Array(outLength);
  let outPos = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < end; i++) {
    const c = input.charAt(i);
    const value = CHAR_TO_BITS[c];
    if (value === undefined) {
      throw new Error(`Invalid base64 character: ${JSON.stringify(c)}`);
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outPos++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}
