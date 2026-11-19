import {
  WASI,
  WASIProcExit,
  File,
  OpenFile,
  ConsoleStdout,
} from "../vendor/cpp-compiler/wasi/index.js";

// VI: Thực thi chương trình trong WASI worker và cô lập với giao diện. EN: Run programs in an isolated WASI worker, away from the UI thread.

let compiledModule = null;

self.onmessage = async (event) => {
  if (event.data?.type === "init") {
    compiledModule = event.data.module || null;
    self.postMessage({ type: "ready" });
    return;
  }
  if (event.data?.type !== "run") return;

  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  let stdout = "";
  let stderr = "";

  const stdinBytes = new TextEncoder().encode(event.data.input || "");
  const stdinBuffer = stdinBytes.buffer.slice(
    stdinBytes.byteOffset,
    stdinBytes.byteOffset + stdinBytes.byteLength,
  );
  const fds = [
    new OpenFile(new File(stdinBuffer)),
    new ConsoleStdout((chunk) => {
      stdout += stdoutDecoder.decode(chunk, { stream: true });
    }),
    new ConsoleStdout((chunk) => {
      stderr += stderrDecoder.decode(chunk, { stream: true });
    }),
  ];

  try {
    const wasi = new WASI(["main.wasm"], [], fds);
    const module = event.data.module || compiledModule;
    if (!module) throw new Error("Không nhận được module đã biên dịch.");
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    self.postMessage({ type: "started" });
    wasi.start(instance);
    stdout += stdoutDecoder.decode();
    stderr += stderrDecoder.decode();
    self.postMessage({ type: "finished", stdout, stderr, exitCode: 0 });
  } catch (error) {
    stdout += stdoutDecoder.decode();
    stderr += stderrDecoder.decode();
    const exitCode = Number.isInteger(error?.code) ? error.code : 1;
    const isProcessExit = error instanceof WASIProcExit;
    self.postMessage({
      type: "finished",
      stdout,
      stderr,
      exitCode,
      runtimeError: isProcessExit ? "" : error?.message || String(error),
    });
  }
};
