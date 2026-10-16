/** Converts a shop logo URL to the ESC/POS GS v 0 monochrome raster format. */
export async function loadLogoRaster(url: string, maxWidthDots: number): Promise<Uint8Array | undefined> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const scale = Math.min(maxWidthDots / image.naturalWidth, 180 / image.naturalHeight, 1);
    const width = Math.max(1, Math.floor(image.naturalWidth * scale));
    const height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const widthBytes = Math.ceil(width / 8);
    const command = [
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
    ];

    let opaqueBrightness = 0;
    let opaqueCount = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 32) {
        opaqueBrightness += pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
        opaqueCount++;
      }
    }
    const lightArtwork = opaqueCount > 0 && opaqueBrightness / opaqueCount > 150;

    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < widthBytes; byteX++) {
        let value = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x >= width) continue;
          const index = (y * width + x) * 4;
          const alpha = pixels[index + 3] / 255;
          const luminance = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
          const isInk = lightArtwork ? alpha > 0.2 : alpha > 0.2 && luminance < 170;
          if (isInk) value |= 0x80 >> bit;
        }
        command.push(value);
      }
    }

    return new Uint8Array(command);
  } catch {
    // A logo load/CORS issue should never stop a receipt from printing.
    return undefined;
  }
}
