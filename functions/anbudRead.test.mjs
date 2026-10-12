import assert from 'node:assert/strict';
import { MAX_PUBLIC_READ_BYTES, takeBody } from './anbudRead.js';

assert.equal(MAX_PUBLIC_READ_BYTES, 25 * 1024 * 1024);

{
  const small = new Response(new Uint8Array([1, 2, 3, 4]), {
    headers: { 'content-length': '4' },
  });
  const buf = await takeBody(small, 8);
  assert.equal(buf.length, 4);
}

{
  const declared = new Response(new Uint8Array(4), {
    headers: { 'content-length': '20' },
  });
  assert.equal(await takeBody(declared, 8), null);
}

{
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
      controller.close();
    },
  });
  assert.equal(await takeBody(new Response(stream), 8), null);
}

{
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5));
      controller.enqueue(new Uint8Array(3));
      controller.close();
    },
  });
  const buf = await takeBody(new Response(stream), 8);
  assert.equal(buf.length, 8);
}

console.log('anbudRead ok');
