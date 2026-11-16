import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { cardCode } from './documents';
import { parseCode } from './attendance';

/**
 * THE ID CARD MUST SCAN.
 *
 * The card's QR is generated from the student number, and the gate scanner
 * parses it back. Those are two different pieces of code in two different
 * screens, and nothing else checks that they agree — so this test encodes a
 * card the way IdCards.tsx does, decodes it with an INDEPENDENT decoder (the
 * generator must not be allowed to mark its own homework), and feeds the
 * result through the scanner's own parser.
 *
 * A printed card that will not scan is discovered at the gate, with a queue
 * behind it, which is the worst possible moment.
 */
async function decode(text: string): Promise<string | null> {
  const buffer = await QRCode.toBuffer(text, { margin: 0, width: 220 });
  const png = PNG.sync.read(buffer);
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code ? code.data : null;
}

describe('ID card QR', () => {
  it('decodes back to the card code', async () => {
    for (const studentId of ['76', '94', '1', '1234']) {
      const text = cardCode(studentId);
      expect(await decode(text)).toBe(text);
    }
  });

  it('decodes to something the gate scanner accepts', async () => {
    const decoded = await decode(cardCode('76'));
    expect(decoded).not.toBeNull();
    expect(parseCode(decoded as string)).toBe('76');
  });

  it('survives a long student number', async () => {
    const text = cardCode('999999');
    expect(await decode(text)).toBe(text);
    expect(parseCode(text)).toBe('999999');
  });
});
