import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { pipeReadableToServerResponse } from '../src/server/utils/pipeReadableToServerResponse.js';

describe('pipeReadableToServerResponse', () => {
  test('destroys source stream when client closes before response finishes', () => {
    const req = new EventEmitter();
    const res = new PassThrough();
    const source = new PassThrough();
    let destroyed = false;
    source.destroy = ((...args: Parameters<PassThrough['destroy']>) => {
      destroyed = true;
      return PassThrough.prototype.destroy.apply(source, args);
    }) as PassThrough['destroy'];

    pipeReadableToServerResponse(req, res, source);
    req.emit('close');

    expect(destroyed).toBe(true);
  });
});
