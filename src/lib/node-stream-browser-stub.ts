// Browser stub for `node:stream` / `node:stream/web`.
//
// `@tanstack/react-start` (pulled in by the PDF server-function module) carries
// side-effect-only `import "node:stream"` statements. Marking `node:*` external
// left those specifiers untouched in the production client bundle, so the
// browser tried to fetch a `node:` URL, failed with a CORS/scheme error, and
// the whole app rendered a blank page.
//
// Some browser-reachable deps (e.g. `e2b`) do `import stream from "node:stream"`,
// so the stub must also provide a default export plus the usual named classes.
// None of them are actually exercised in the browser — they exist so bundling
// resolves.

class StubStream {
  on() {
    return this;
  }
  once() {
    return this;
  }
  off() {
    return this;
  }
  emit() {
    return false;
  }
  pipe<T>(destination: T): T {
    return destination;
  }
  write() {
    return false;
  }
  end() {
    return this;
  }
  destroy() {
    return this;
  }
}

export class Readable extends StubStream {}
export class Writable extends StubStream {}
export class Duplex extends StubStream {}
export class Transform extends StubStream {}
export class PassThrough extends StubStream {}
export class Stream extends StubStream {}
export class ReadableStream extends StubStream {}
export class WritableStream extends StubStream {}
export class TransformStream extends StubStream {}

export function pipeline(...args: unknown[]) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") (cb as (e: unknown) => void)(null);
}

export function finished(...args: unknown[]) {
  const cb = args[args.length - 1];
  if (typeof cb === "function") (cb as (e: unknown) => void)(null);
}

const streamDefault = {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  Stream,
  ReadableStream,
  WritableStream,
  TransformStream,
  pipeline,
  finished,
};

export default streamDefault;
