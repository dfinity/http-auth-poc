// Code adapted from https://github.com/dfinity/icp-js-core/blob/0bf4b1b5683bcb53dda3630715e35e78b111f361/packages/candid/src/utils/leb128.ts

import { PipeArrayBuffer as Pipe } from './buffer';

/**
 * Encode a positive number (or bigint) into a Buffer. The number will be floored to the
 * nearest integer.
 * @param value The number to encode.
 */
export function lebEncode(value: bigint | number): Uint8Array {
  if (typeof value === 'number') {
    value = BigInt(value);
  }

  if (value < BigInt(0)) {
    throw new Error('Cannot leb encode negative values.');
  }

  const byteLength = (value === BigInt(0) ? 0 : ilog2(value)) + 1;
  const pipe = new Pipe(new Uint8Array(byteLength), 0);
  while (true) {
    const i = Number(value & BigInt(0x7f));
    value /= BigInt(0x80);
    if (value === BigInt(0)) {
      pipe.write(new Uint8Array([i]));
      break;
    } else {
      pipe.write(new Uint8Array([i | 0x80]));
    }
  }

  return pipe.buffer;
}

/**
 * Equivalent to `Math.log2(n)` with support for `BigInt` values
 * @param n bigint or integer
 * @returns integer
 */
function ilog2(n: bigint | number): number {
  const nBig = BigInt(n);
  if (n <= 0) {
    throw new RangeError('Input must be positive');
  }
  return nBig.toString(2).length - 1;
}
