# Local C++20 compiler assets

The browser runner uses a locally hosted WebAssembly compiler and WASI runtime.
No source code, test input, or program output is sent to a compilation API.

- `compiler/` contains `browsercc` 0.1.1, including Clang/LLVM and LLD WebAssembly binaries and its C/C++ sysroot. It is licensed under MIT; see `compiler-LICENSE.txt`.
- `wasi/` contains `@bjorn3/browser_wasi_shim` 0.4.2. It is licensed under MIT or Apache-2.0; see `wasi-LICENSE.txt`.

The compiler binaries and sysroot total about 95 MB. The service worker caches
these same-origin files when the compiler first loads them. To use the runner
offline later, open the site online once and run a program so the compiler
assets are downloaded and cached. Browsers can clear their cache when storage
is low. Serve the site over HTTPS or localhost; service workers do not run on
`file://` pages.

Programs run as WASI WebAssembly in a disposable Web Worker. The worker is
terminated after 1 second, which enforces the per-test time limit and stops
infinite loops. WASI does not provide native system APIs, threading, or full
native-machine compatibility.
