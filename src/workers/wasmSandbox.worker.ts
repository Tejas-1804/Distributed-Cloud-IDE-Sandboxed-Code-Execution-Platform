/// <reference lib="webworker" />

/**
 * Isolated WebAssembly Worker Sandbox:
 * 1) Instantiates genuine .wasm binaries (with WASI fd_write & proc_exit bindings)
 * 2) Compiles a clean integer-arithmetic + control-flow + printf C subset directly into
 *    a valid WASM binary module executed inside WebAssembly.instantiate().
 */

interface WasmRunMessage {
  type: 'run-wasm' | 'run-c';
  executionId: string;
  wasmBase64?: string;
  code?: string;
}

// WASM opcodes
const OP_UNREACHABLE = 0x00;
const OP_BLOCK = 0x02;
const OP_LOOP = 0x03;
const OP_IF = 0x04;
const OP_ELSE = 0x05;
const OP_END = 0x0b;
const OP_BR = 0x0c;
const OP_BR_IF = 0x0d;
const OP_RETURN = 0x0f;
const OP_CALL = 0x10;
const OP_DROP = 0x1a;
const OP_LOCAL_GET = 0x20;
const OP_LOCAL_SET = 0x21;
const OP_LOCAL_TEE = 0x22;
const OP_I32_STORE = 0x36;
const OP_I32_CONST = 0x41;
const OP_I32_EQZ = 0x45;
const OP_I32_EQ = 0x46;
const OP_I32_NE = 0x47;
const OP_I32_LT_S = 0x48;
const OP_I32_GT_S = 0x4a;
const OP_I32_LE_S = 0x4c;
const OP_I32_GE_S = 0x4e;
const OP_I32_ADD = 0x6a;
const OP_I32_SUB = 0x6b;
const OP_I32_MUL = 0x6c;
const OP_I32_DIV_S = 0x6d;
const OP_I32_REM_S = 0x6f;

function encodeULEB128(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return bytes;
}

function encodeSLEB128(value: number): number[] {
  const bytes: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    const byte = v & 0x7f;
    v >>= 7;
    const signBit = (byte & 0x40) !== 0;
    if ((v === 0 && !signBit) || (v === -1 && signBit)) {
      more = false;
      bytes.push(byte);
    } else {
      bytes.push(byte | 0x80);
    }
  }
  return bytes;
}

function section(id: number, payload: number[]): number[] {
  return [id, ...encodeULEB128(payload.length), ...payload];
}

function encodeString(str: string): number[] {
  const utf8 = Array.from(new TextEncoder().encode(str));
  return [...encodeULEB128(utf8.length), ...utf8];
}

type TokenType = 'num' | 'ident' | 'str' | 'op' | 'punct' | 'eof';
interface Token {
  type: TokenType;
  value: string;
}

function tokenizeC(source: string): Token[] {
  const stripped = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*#.*$/gm, '');
  const tokens: Token[] = [];
  let i = 0;

  while (i < stripped.length) {
    const ch = stripped[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      let s = '';
      while (i < stripped.length && stripped[i] !== '"') {
        if (stripped[i] === '\\' && i + 1 < stripped.length) {
          const next = stripped[i + 1];
          if (next === 'n') s += '\n';
          else if (next === 't') s += '\t';
          else s += next;
          i += 2;
        } else {
          s += stripped[i];
          i += 1;
        }
      }
      i += 1;
      tokens.push({ type: 'str', value: s });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < stripped.length && /[0-9]/.test(stripped[i])) {
        num += stripped[i++];
      }
      tokens.push({ type: 'num', value: num });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < stripped.length && /[A-Za-z0-9_]/.test(stripped[i])) {
        id += stripped[i++];
      }
      tokens.push({ type: 'ident', value: id });
      continue;
    }
    const two = stripped.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--'].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if ('+-*/%<>=!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if ('(){};,'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unsupported character "${ch}" in local C-to-WASM compiler.`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function compileCSubsetToWasm(source: string): Uint8Array {
  const tokens = tokenizeC(source);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];
  const expect = (value: string) => {
    const t = consume();
    if (t.value !== value) {
      throw new Error(`Expected "${value}" but found "${t.value || t.type}".`);
    }
    return t;
  };

  // Expect optional `int main(...) { ... }`
  if (peek().value === 'int') {
    consume();
  }
  if (peek().value === 'main') {
    consume();
    expect('(');
    while (peek().value !== ')' && peek().type !== 'eof') consume();
    expect(')');
    expect('{');
  } else {
    throw new Error('Local C-to-WASM compiler requires an `int main()` entrypoint.');
  }

  // Locals: index 0 reserved for scratch temp register; user variables start at index 1
  const locals = new Map<string, number>();
  let nextLocal = 1;
  const getOrAllocLocal = (name: string): number => {
    const idx = locals.get(name);
    if (idx !== undefined) return idx;
    const allocated = nextLocal++;
    locals.set(name, allocated);
    return allocated;
  };

  // Data segment starting at offset 64 (0..32 reserved for WASI iov + nwritten)
  const stringOffsets: Array<{ offset: number; length: number; bytes: number[] }> = [];
  let dataCursor = 64;
  const internString = (text: string): { offset: number; length: number } => {
    const encoded = Array.from(new TextEncoder().encode(text));
    const offset = dataCursor;
    dataCursor += encoded.length + 1;
    stringOffsets.push({ offset, length: encoded.length, bytes: [...encoded, 0] });
    return { offset, length: encoded.length };
  };

  const body: number[] = [];

  // Function indices:
  // 0: imported env.fd_write(fd, iovs, iovs_len, nwritten) -> i32
  // 1: imported env.print_i32(value) -> void (or converted inside worker import)
  // Using 0 = wasi fd_write and 1 = env.print_i32 keeps printed numbers crisp while strings go through WASI fd_write!
  const FN_FD_WRITE = 0;
  const FN_PRINT_I32 = 1;

  const emitWriteString = (str: string) => {
    const { offset, length } = internString(str);
    // iov at addr 0: ptr (i32) = offset, len (i32) = length
    body.push(OP_I32_CONST, ...encodeSLEB128(0));
    body.push(OP_I32_CONST, ...encodeSLEB128(offset));
    body.push(OP_I32_STORE, 0x02, 0x00);

    body.push(OP_I32_CONST, ...encodeSLEB128(4));
    body.push(OP_I32_CONST, ...encodeSLEB128(length));
    body.push(OP_I32_STORE, 0x02, 0x00);

    // call fd_write(1, 0, 1, 8)
    body.push(OP_I32_CONST, ...encodeSLEB128(1));
    body.push(OP_I32_CONST, ...encodeSLEB128(0));
    body.push(OP_I32_CONST, ...encodeSLEB128(1));
    body.push(OP_I32_CONST, ...encodeSLEB128(8));
    body.push(OP_CALL, ...encodeULEB128(FN_FD_WRITE));
    body.push(OP_DROP);
  };

  const emitExpr = () => emitLogicalOr();

  const emitLogicalOr = () => {
    emitLogicalAnd();
    while (peek().value === '||') {
      consume();
      // Store normalized left truthy value (0 or 1) in scratch local 0
      body.push(OP_I32_CONST, 0, OP_I32_NE);
      body.push(OP_LOCAL_SET, 0);
      emitLogicalAnd();
      body.push(OP_I32_CONST, 0, OP_I32_NE);
      body.push(OP_LOCAL_GET, 0);
      body.push(OP_I32_ADD, OP_I32_CONST, 0, OP_I32_NE);
    }
  };

  const emitLogicalAnd = () => {
    emitEquality();
    while (peek().value === '&&') {
      consume();
      body.push(OP_I32_CONST, 0, OP_I32_NE);
      body.push(OP_LOCAL_SET, 0);
      emitEquality();
      body.push(OP_I32_CONST, 0, OP_I32_NE);
      body.push(OP_LOCAL_GET, 0);
      body.push(OP_I32_MUL);
    }
  };

  const emitEquality = () => {
    emitRelational();
    while (peek().value === '==' || peek().value === '!=') {
      const op = consume().value;
      emitRelational();
      body.push(op === '==' ? OP_I32_EQ : OP_I32_NE);
    }
  };

  const emitRelational = () => {
    emitAdditive();
    while (['<', '>', '<=', '>='].includes(peek().value)) {
      const op = consume().value;
      emitAdditive();
      if (op === '<') body.push(OP_I32_LT_S);
      else if (op === '>') body.push(OP_I32_GT_S);
      else if (op === '<=') body.push(OP_I32_LE_S);
      else body.push(OP_I32_GE_S);
    }
  };

  const emitAdditive = () => {
    emitMultiplicative();
    while (peek().value === '+' || peek().value === '-') {
      const op = consume().value;
      emitMultiplicative();
      body.push(op === '+' ? OP_I32_ADD : OP_I32_SUB);
    }
  };

  const emitMultiplicative = () => {
    emitUnary();
    while (peek().value === '*' || peek().value === '/' || peek().value === '%') {
      const op = consume().value;
      emitUnary();
      if (op === '*') body.push(OP_I32_MUL);
      else if (op === '/') body.push(OP_I32_DIV_S);
      else body.push(OP_I32_REM_S);
    }
  };

  const emitUnary = () => {
    if (peek().value === '-') {
      consume();
      body.push(OP_I32_CONST, 0);
      emitUnary();
      body.push(OP_I32_SUB);
      return;
    }
    if (peek().value === '!') {
      consume();
      emitUnary();
      body.push(OP_I32_EQZ);
      return;
    }
    emitPrimary();
  };

  const emitPrimary = () => {
    const t = peek();
    if (t.type === 'num') {
      consume();
      body.push(OP_I32_CONST, ...encodeSLEB128(parseInt(t.value, 10)));
      return;
    }
    if (t.type === 'ident') {
      consume();
      const idx = locals.get(t.value);
      if (idx === undefined) {
        throw new Error(`Undeclared variable "${t.value}".`);
      }
      body.push(OP_LOCAL_GET, ...encodeULEB128(idx));
      return;
    }
    if (t.value === '(') {
      consume();
      emitExpr();
      expect(')');
      return;
    }
    throw new Error(`Unexpected token "${t.value || t.type}" in expression.`);
  };

  const emitPrintf = () => {
    expect('(');
    const fmtTok = consume();
    if (fmtTok.type !== 'str') {
      throw new Error('printf first argument must be a format string.');
    }
    const argParts = fmtTok.value.split(/(%d)/g);
    const argsStarted = peek().value === ',';
    const hasSpecifiers = argParts.some((p) => p === '%d');

    if (!hasSpecifiers && !argsStarted) {
      emitWriteString(fmtTok.value);
    } else {
      for (const part of argParts) {
        if (!part) continue;
        if (part === '%d') {
          expect(',');
          emitExpr();
          body.push(OP_CALL, ...encodeULEB128(FN_PRINT_I32));
        } else {
          emitWriteString(part);
        }
      }
    }
    expect(')');
  };

  const emitStatement = () => {
    const t = peek();
    if (t.value === '{') {
      consume();
      while (peek().value !== '}' && peek().type !== 'eof') {
        emitStatement();
      }
      expect('}');
      return;
    }
    if (t.value === 'int') {
      consume();
      const nameTok = consume();
      if (nameTok.type !== 'ident') throw new Error('Expected variable name after int.');
      const idx = getOrAllocLocal(nameTok.value);
      if (peek().value === '=') {
        consume();
        emitExpr();
        body.push(OP_LOCAL_SET, ...encodeULEB128(idx));
      } else {
        body.push(OP_I32_CONST, 0, OP_LOCAL_SET, ...encodeULEB128(idx));
      }
      expect(';');
      return;
    }
    if (t.value === 'printf') {
      consume();
      emitPrintf();
      expect(';');
      return;
    }
    if (t.value === 'return') {
      consume();
      emitExpr();
      expect(';');
      body.push(OP_RETURN);
      return;
    }
    if (t.value === 'if') {
      consume();
      expect('(');
      emitExpr();
      expect(')');
      body.push(OP_IF, 0x40);
      emitStatement();
      if (peek().value === 'else') {
        consume();
        body.push(OP_ELSE);
        emitStatement();
      }
      body.push(OP_END);
      return;
    }
    if (t.value === 'while') {
      consume();
      expect('(');
      body.push(OP_BLOCK, 0x40, OP_LOOP, 0x40);
      emitExpr();
      expect(')');
      body.push(OP_I32_EQZ, OP_BR_IF, 1);
      emitStatement();
      body.push(OP_BR, 0, OP_END, OP_END);
      return;
    }
    if (t.type === 'ident') {
      const name = consume().value;
      const idx = locals.get(name);
      if (idx === undefined) throw new Error(`Undeclared variable "${name}".`);
      if (peek().value === '++') {
        consume();
        body.push(OP_LOCAL_GET, ...encodeULEB128(idx), OP_I32_CONST, 1, OP_I32_ADD, OP_LOCAL_SET, ...encodeULEB128(idx));
        expect(';');
        return;
      }
      if (peek().value === '--') {
        consume();
        body.push(OP_LOCAL_GET, ...encodeULEB128(idx), OP_I32_CONST, 1, OP_I32_SUB, OP_LOCAL_SET, ...encodeULEB128(idx));
        expect(';');
        return;
      }
      expect('=');
      emitExpr();
      body.push(OP_LOCAL_SET, ...encodeULEB128(idx));
      expect(';');
      return;
    }
    if (t.value === ';') {
      consume();
      return;
    }
    throw new Error(`Unsupported C syntax near "${t.value}" inside local WASM subset compiler.`);
  };

  while (peek().value !== '}' && peek().type !== 'eof') {
    emitStatement();
  }
  expect('}');

  // Default fallback return 0 if execution reaches end of main
  body.push(OP_I32_CONST, 0, OP_RETURN, OP_UNREACHABLE);

  // Build WASM sections:
  // Type 0: (i32,i32,i32,i32) -> i32   [wasi fd_write]
  // Type 1: (i32) -> void              [print_i32]
  // Type 2: () -> i32                  [main]
  const typeSection = section(1, [
    3,
    0x60, 4, 0x7f, 0x7f, 0x7f, 0x7f, 1, 0x7f,
    0x60, 1, 0x7f, 0,
    0x60, 0, 1, 0x7f,
  ]);

  const importSection = section(2, [
    2,
    ...encodeString('wasi_snapshot_preview1'),
    ...encodeString('fd_write'),
    0x00,
    0,
    ...encodeString('env'),
    ...encodeString('print_i32'),
    0x00,
    1,
  ]);

  const funcSection = section(3, [1, 2]);
  const memorySection = section(5, [1, 0x00, 1]); // min 1 page (64KB)
  const exportSection = section(7, [
    2,
    ...encodeString('memory'),
    0x02,
    0,
    ...encodeString('main'),
    0x00,
    2,
  ]);

  const totalLocals = nextLocal;
  const codeBody = [
    1,
    ...encodeULEB128(totalLocals),
    0x7f, // i32 locals
    ...body,
    OP_END,
  ];
  const codeSection = section(10, [1, ...encodeULEB128(codeBody.length), ...codeBody]);

  const dataSegmentsPayload: number[] = [...encodeULEB128(stringOffsets.length)];
  for (const seg of stringOffsets) {
    dataSegmentsPayload.push(
      0x00,
      OP_I32_CONST,
      ...encodeSLEB128(seg.offset),
      OP_END,
      ...encodeULEB128(seg.bytes.length),
      ...seg.bytes,
    );
  }
  const dataSection = stringOffsets.length > 0 ? section(11, dataSegmentsPayload) : [];

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic \0asm
    0x01, 0x00, 0x00, 0x00, // version 1
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...memorySection,
    ...exportSection,
    ...codeSection,
    ...dataSection,
  ]);
}

self.onmessage = async (event: MessageEvent<WasmRunMessage>) => {
  const msg = event.data;
  if (!msg) return;

  const { executionId } = msg;
  const startedAt = performance.now();
  const emit = (stream: 'stdout' | 'stderr', text: string) => {
    self.postMessage({ type: stream, executionId, chunk: text });
  };

  try {
    let wasmBytes: Uint8Array;
    if (msg.type === 'run-c') {
      wasmBytes = compileCSubsetToWasm(msg.code ?? '');
    } else {
      const binStr = atob(msg.wasmBase64 ?? '');
      wasmBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        wasmBytes[i] = binStr.charCodeAt(i);
      }
    }

    let instanceRef: WebAssembly.Instance | null = null;
    let procExitCode: number | null = null;

    const getMem = () => {
      const mem = instanceRef?.exports.memory;
      return mem instanceof WebAssembly.Memory ? mem : null;
    };

    const imports: WebAssembly.Imports = {
      wasi_snapshot_preview1: {
        fd_write: (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
          const mem = getMem();
          if (!mem) return 0;
          const view = new DataView(mem.buffer);
          const u8 = new Uint8Array(mem.buffer);
          let totalWritten = 0;
          const decoder = new TextDecoder();

          for (let i = 0; i < iovsLen; i++) {
            const ptr = view.getUint32(iovsPtr + i * 8, true);
            const len = view.getUint32(iovsPtr + i * 8 + 4, true);
            const text = decoder.decode(u8.slice(ptr, ptr + len));
            emit(fd === 2 ? 'stderr' : 'stdout', text);
            totalWritten += len;
          }

          view.setUint32(nwrittenPtr, totalWritten, true);
          return 0;
        },
        proc_exit: (code: number) => {
          procExitCode = code;
          throw new Error(`__WASI_EXIT_${code}__`);
        },
      },
      env: {
        print_i32: (val: number) => {
          emit('stdout', String(val | 0));
        },
      },
    };

    const { instance } = await WebAssembly.instantiate(
      wasmBytes.buffer as ArrayBuffer,
      imports,
    );
    instanceRef = instance;

    let exitCode = 0;
    try {
      const entry =
        (instance.exports._start as (() => unknown) | undefined) ??
        (instance.exports.main as (() => unknown) | undefined);
      if (typeof entry === 'function') {
        const ret = entry();
        if (typeof ret === 'number') exitCode = ret | 0;
      }
    } catch (execErr) {
      if (procExitCode !== null) {
        exitCode = procExitCode;
      } else {
        throw execErr;
      }
    }

    self.postMessage({
      type: 'complete',
      executionId,
      exitCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (err) {
    emit('stderr', `${err instanceof Error ? err.message : String(err)}\n`);
    self.postMessage({
      type: 'complete',
      executionId,
      exitCode: 1,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
};
