import { decodeBase64 } from '../base64';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reference encoder used only to build round-trip fixtures. */
const encodeBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const n = bytes.length - i;
    out += ALPHABET.charAt(b0 >> 2);
    out += ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    out += n > 1 ? ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '=';
    out += n > 2 ? ALPHABET.charAt(b2 & 0x3f) : '=';
  }
  return out;
};

describe('decodeBase64', () => {
  it('decodes an empty string', () => {
    expect(decodeBase64('')).toEqual(new Uint8Array(0));
  });

  it('decodes known vectors', () => {
    expect(decodeBase64('SGVsbG8=')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
    );
    expect(decodeBase64('AAEC/w==')).toEqual(new Uint8Array([0, 1, 2, 255]));
    expect(decodeBase64('+/8=')).toEqual(new Uint8Array([0xfb, 0xff]));
  });

  it.each([
    [1, 'AA=='],
    [2, 'AAE='],
    [3, 'AAEC'],
    [4, 'AAECAw=='],
    [5, 'AAECAwQ='],
    [6, 'AAECAwQF'],
  ])('handles a %i-byte payload (tail handling)', (n, encoded) => {
    const expected = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      expected[i] = i;
    }
    expect(decodeBase64(encoded)).toEqual(expected);
  });

  it('accepts unpadded input', () => {
    expect(decodeBase64('AA')).toEqual(new Uint8Array([0]));
    expect(decodeBase64('AAE')).toEqual(new Uint8Array([0, 1]));
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      bytes[i] = i;
    }
    const encoded = encodeBase64(bytes);
    expect(decodeBase64(encoded)).toEqual(bytes);
  });

  it('throws on characters outside the standard alphabet', () => {
    expect(() => decodeBase64('AA$A')).toThrow('Invalid base64 character');
    expect(() => decodeBase64('AA-_')).toThrow('Invalid base64 character'); // url-safe alphabet rejected
    expect(() => decodeBase64('AA\nA')).toThrow('Invalid base64 character');
  });

  it('throws on impossible lengths and stray padding', () => {
    expect(() => decodeBase64('A')).toThrow('dangling');
    expect(() => decodeBase64('AAECA')).toThrow('dangling');
    expect(() => decodeBase64('A===')).toThrow('too much padding');
  });
});
