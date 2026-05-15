export class BinaryReader {
  readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  ensure(length: number): void {
    if (this.remaining < length) {
      throw new Error(`Unexpected end of buffer at ${this.offset}; need ${length} bytes`);
    }
  }

  bytes(length: number): Uint8Array {
    this.ensure(length);
    const start = this.view.byteOffset + this.offset;
    this.offset += length;
    return new Uint8Array(this.view.buffer, start, length);
  }

  skip(length: number): void {
    this.ensure(length);
    this.offset += length;
  }

  u8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  i8(): number {
    this.ensure(1);
    return this.view.getInt8(this.offset++);
  }

  u16(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16(): number {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(): number {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  index(size: number): number {
    switch (size) {
      case 1:
        return this.i8();
      case 2:
        return this.i16();
      case 4:
        return this.i32();
      default:
        throw new Error(`Unsupported PMX index size: ${size}`);
    }
  }
}

export function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
