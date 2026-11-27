export function decodeMmdTgaTexture(
  bytes: ArrayBuffer | ArrayLike<number>
): { data: Uint8Array; width: number; height: number; hasAlpha: boolean } | undefined {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  if (data.length < 18) {
    return undefined;
  }
  const idLength = data[0] ?? 0;
  const colorMapType = data[1] ?? 0;
  const imageType = data[2] ?? 0;
  const width = (data[12] ?? 0) | ((data[13] ?? 0) << 8);
  const height = (data[14] ?? 0) | ((data[15] ?? 0) << 8);
  const bitsPerPixel = data[16] ?? 0;
  const descriptor = data[17] ?? 0;
  if (
    colorMapType !== 0 ||
    (imageType !== 2 && imageType !== 10) ||
    width <= 0 ||
    height <= 0 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32)
  ) {
    return undefined;
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const pixelOffset = 18 + idLength;
  if (data.length < pixelOffset) {
    return undefined;
  }
  const output = new Uint8Array(width * height * 4);
  const topOrigin = (descriptor & 0x20) !== 0;
  let hasAlpha = false;
  const writePixel = (sourcePixelIndex: number, source: number): boolean => {
    if (source + bytesPerPixel > data.length) {
      return false;
    }
    const sourceY = Math.floor(sourcePixelIndex / width);
    const x = sourcePixelIndex % width;
    const targetY = topOrigin ? sourceY : height - 1 - sourceY;
    const target = (targetY * width + x) * 4;
    output[target] = data[source + 2] ?? 0;
    output[target + 1] = data[source + 1] ?? 0;
    output[target + 2] = data[source] ?? 0;
    const alpha = bitsPerPixel === 32 ? (data[source + 3] ?? 255) : 255;
    output[target + 3] = alpha;
    hasAlpha ||= alpha < 255;
    return true;
  };
  const pixelCount = width * height;
  if (imageType === 2) {
    const pixelByteLength = pixelCount * bytesPerPixel;
    if (data.length < pixelOffset + pixelByteLength) {
      return undefined;
    }
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (!writePixel(pixelIndex, pixelOffset + pixelIndex * bytesPerPixel)) {
        return undefined;
      }
    }
  } else {
    let source = pixelOffset;
    let pixelIndex = 0;
    while (pixelIndex < pixelCount) {
      if (source >= data.length) {
        return undefined;
      }
      const packet = data[source++] ?? 0;
      const count = (packet & 0x7f) + 1;
      if ((packet & 0x80) !== 0) {
        if (source + bytesPerPixel > data.length) {
          return undefined;
        }
        for (let i = 0; i < count && pixelIndex < pixelCount; i += 1, pixelIndex += 1) {
          if (!writePixel(pixelIndex, source)) {
            return undefined;
          }
        }
        source += bytesPerPixel;
      } else {
        for (let i = 0; i < count && pixelIndex < pixelCount; i += 1, pixelIndex += 1) {
          if (!writePixel(pixelIndex, source)) {
            return undefined;
          }
          source += bytesPerPixel;
        }
      }
    }
  }
  return { data: output, width, height, hasAlpha };
}
