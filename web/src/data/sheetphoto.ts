/**
 * Turning a photographed mark sheet into something small enough to send.
 *
 * The opposite problem to photoFile.ts, which shrinks a portrait to fit on an
 * ID card. Here the picture IS the data: shrink it too far and a 2 becomes a
 * 7. So the long edge is kept generous and the quality high, and the only
 * thing actually thrown away is the slack in a modern phone camera, where a
 * sheet of A4 arrives at 4000px and reads no better than at 2200.
 *
 * This file has a twin: android/.../data/SheetPhoto.kt.
 */

/** Long edge, in pixels, of the picture that is sent to be read. */
export const SHEET_LONG_EDGE = 2200;

/** High: this is handwriting, and JPEG artefacts land on the thin strokes. */
export const SHEET_QUALITY = 0.92;

export type SheetShot = {
  mimeType: string;
  /** Base64 of the JPEG, with no data: prefix — the API wants the bare bytes. */
  base64: string;
  /** A data URL for showing it back on screen. */
  preview: string;
  width: number;
  height: number;
};

/** The size to draw at: never bigger than it came, never longer than the cap. */
export function fitSheet(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long === 0) return { width: 0, height: 0 };
  // Never scaled UP: enlarging a small photo invents detail that is not
  // there, and gives the reader more pixels to be confident about.
  const scale = Math.min(1, SHEET_LONG_EDGE / long);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // A sheet photographed on a phone held upright is stored sideways with a
  // flag saying so. Drawn without this, the reader is handed a page on its
  // side — which it will gamely try to read.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That image could not be read.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToSheetShot(file: File): Promise<SheetShot> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not a photograph.`);
  }
  const source = await load(file);
  const w = 'width' in source ? source.width : 0;
  const h = 'height' in source ? source.height : 0;
  const size = fitSheet(w, h);
  if (!size.width || !size.height) throw new Error('That image could not be read.');

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize the photograph.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);

  const preview = canvas.toDataURL('image/jpeg', SHEET_QUALITY);
  return {
    mimeType: 'image/jpeg',
    base64: preview.slice(preview.indexOf(',') + 1),
    preview,
    width: size.width,
    height: size.height,
  };
}

/**
 * How big this picture is on the wire, in megabytes.
 *
 * Shown beside the photograph because the upload is the slow part of reading
 * a sheet, and a teacher on a weak line should be able to see that before
 * spending two minutes finding out.
 *
 * Base64 carries three bytes in every four characters.
 */
export function sheetMegabytes(base64: string): number {
  return (base64.length * 3) / 4 / 1_000_000;
}

/** The same, rounded the way it is shown. */
export const sheetSizeLabel = (base64: string) => `${sheetMegabytes(base64).toFixed(1)} MB`;
