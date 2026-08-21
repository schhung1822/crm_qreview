import "server-only";

import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Converts a validated raster image to a browser-friendly WebP buffer.
 * Animated GIF/WebP inputs retain their frames; regular photos are also
 * auto-oriented from EXIF metadata before that metadata is discarded.
 */
export async function convertRasterToWebp(input: Buffer) {
  const inspector = sharp(input, {
    animated: true,
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  });
  const metadata = await inspector.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions could not be read");
  }

  const isAnimated = (metadata.pages ?? 1) > 1;
  let pipeline = sharp(input, {
    animated: isAnimated,
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  });

  if (!isAnimated) {
    pipeline = pipeline.rotate();
  }

  return pipeline
    .webp({
      quality: 84,
      alphaQuality: 90,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}
