/** Coerce a Node readable-stream chunk to a Buffer (string, Buffer, or Uint8Array). */
export function streamChunkToBuffer(chunk: string | Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}
