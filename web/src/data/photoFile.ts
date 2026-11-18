import { PHOTO_QUALITY_STEPS, fitWithin, photoTooBig } from './photos';

/**
 * Turning the file somebody picked into something a card can carry.
 *
 * This is the browser half of photos.ts — canvas and ImageBitmap, so it lives
 * apart from the rules it follows, which are plain arithmetic and tested.
 */

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // from-image matters more than it looks: a photo taken on a phone held
  // upright is usually stored on its side with an EXIF flag saying so. Drawn
  // to a canvas without this, every portrait comes out lying down.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to the <img> path below
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

/**
 * A picked file as a JPEG data URL inside the size cap.
 *
 * Quality is stepped down rather than the picture being shrunk further: a
 * slightly softer 480px photo prints better on a 23mm box than a sharp 200px
 * one blown up to fill it.
 */
export async function fileToCardPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image. A JPEG or PNG photo is what is wanted here.');
  }

  const source = await load(file);
  const w = 'width' in source ? source.width : 0;
  const h = 'height' in source ? source.height : 0;
  const size = fitWithin(w, h);
  if (!size.width || !size.height) throw new Error('That image could not be read.');

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize the photo.');
  // White behind it: a PNG with a transparent background would otherwise turn
  // black the moment it became a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);

  for (const quality of PHOTO_QUALITY_STEPS) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (!photoTooBig(url)) return url;
  }
  throw new Error('That photo is too detailed to store. Try a smaller crop of it.');
}
