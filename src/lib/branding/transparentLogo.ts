/** Converts a flat background connected to an image corner into transparency. */
export async function makeLogoBackgroundTransparent(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();

    const maxDimension = 1600;
    const scale = Math.min(maxDimension / Math.max(image.naturalWidth, image.naturalHeight), 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;
    const corners = [
      [Math.min(2, width - 1), Math.min(2, height - 1)],
      [Math.max(0, width - 3), Math.min(2, height - 1)],
      [Math.min(2, width - 1), Math.max(0, height - 3)],
      [Math.max(0, width - 3), Math.max(0, height - 3)],
    ];
    const seeds = corners
      .map(([x, y]) => {
        const offset = (y * width + x) * 4;
        return { x, y, color: [data[offset], data[offset + 1], data[offset + 2]], alpha: data[offset + 3] };
      })
      .filter((seed) => seed.alpha > 220);

    // An already-transparent PNG needs no background removal.
    if (seeds.length < 4) return file;

    const near = (a: number[], b: number[]) => {
      const dr = a[0] - b[0];
      const dg = a[1] - b[1];
      const db = a[2] - b[2];
      return dr * dr + dg * dg + db * db <= 55 * 55;
    };
    let seedIndex = -1;
    let seedMatches = 0;
    seeds.forEach((seed, index) => {
      const matches = seeds.reduce((count, other) => count + (near(seed.color, other.color) ? 1 : 0), 0);
      if (matches > seedMatches) {
        seedIndex = index;
        seedMatches = matches;
      }
    });

    // Avoid guessing when the image has no clear, shared corner background.
    if (seedIndex < 0 || seedMatches < 2) return file;
    const background = seeds[seedIndex].color;
    const pixelCount = width * height;
    const queue = new Int32Array(pixelCount);
    const seen = new Uint8Array(pixelCount);
    let readIndex = 0;
    let writeIndex = 0;
    for (const seed of seeds) {
      if (!near(seed.color, background)) continue;
      const index = seed.y * width + seed.x;
      if (!seen[index]) {
        seen[index] = 1;
        queue[writeIndex++] = index;
      }
    }

    while (readIndex < writeIndex) {
      const pixel = queue[readIndex++];
      const offset = pixel * 4;
      const color = [data[offset], data[offset + 1], data[offset + 2]];
      if (near(color, background)) {
        const distance = Math.sqrt(
          (color[0] - background[0]) ** 2 +
          (color[1] - background[1]) ** 2 +
          (color[2] - background[2]) ** 2
        );
        data[offset + 3] = Math.round(data[offset + 3] * Math.min(1, Math.max(0, (distance - 18) / 37)));
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const neighbors = [x > 0 ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y + 1 < height ? pixel + width : -1];
        for (const neighbor of neighbors) {
          if (neighbor >= 0 && !seen[neighbor]) {
            seen[neighbor] = 1;
            queue[writeIndex++] = neighbor;
          }
        }
      }
    }

    context.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]+$/, "") || "shop-logo"}.png`;
    return new File([blob], name, { type: "image/png", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
