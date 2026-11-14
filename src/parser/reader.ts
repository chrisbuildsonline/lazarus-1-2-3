// Bounds-checked little-endian reader. Every read checks pos + size <= end first and
// returns null instead of throwing; a failed read leaves pos where it was.

export class ByteReader {
  pos: number;
  readonly end: number;
  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array, pos = 0, end = bytes.length) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
    this.end = Math.min(end, bytes.length);
  }

  remaining(): number {
    return Math.max(0, this.end - this.pos);
  }

  private take(size: number): number | null {
    if (size > this.remaining()) return null;
    const at = this.pos;
    this.pos += size;
    return at;
  }

  u8(): number | null {
    const at = this.take(1);
    return at === null ? null : this.view.getUint8(at);
  }

  u16(): number | null {
    const at = this.take(2);
    return at === null ? null : this.view.getUint16(at, true);
  }

  i16(): number | null {
    const at = this.take(2);
    return at === null ? null : this.view.getInt16(at, true);
  }

  f64(): number | null {
    const at = this.take(8);
    return at === null ? null : this.view.getFloat64(at, true);
  }

  /** A copy of the next n bytes. */
  slice(n: number): Uint8Array | null {
    const at = this.take(n);
    return at === null ? null : this.bytes.slice(at, at + n);
  }

  /** A reader over the next n bytes that cannot read past them. */
  sub(n: number): ByteReader | null {
    const at = this.take(n);
    return at === null ? null : new ByteReader(this.bytes, at, at + n);
  }
}
