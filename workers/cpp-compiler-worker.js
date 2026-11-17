import { compile } from "../vendor/cpp-compiler/compiler/index.js";

// VI: Biên dịch C++20 trong worker để không khóa giao diện. EN: Compile C++20 in a worker to keep the UI responsive.

self.onmessage = async (event) => {
  if (event.data?.type !== "compile") return;

  try {
    const result = await compile({
      source: event.data.source,
      fileName: "/main.cpp",
      // Browsercc's WASI sysroot does not ship the C++ exception runtime.
      // VI: WASI compiler nay khong co runtime exception; vo hieu hoa exceptions de iostream link duoc.
      flags: ["-std=c++20", "-O2", "-fno-exceptions", "-Wl,--max-memory=268435456"],
    });

    if (!result.module) {
      self.postMessage({
        type: "compile-error",
        message: result.compileOutput || "Biên dịch thất bại.",
      });
      return;
    }

    self.postMessage({ type: "compiled", module: result.module });
  } catch (error) {
    self.postMessage({
      type: "compile-error",
      message: error?.message || String(error),
    });
  }
};
