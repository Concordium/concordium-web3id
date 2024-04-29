import { defineConfig } from 'vite';
// Uncomment commented code when @concordium/web-sdk is upgraded to v10
// import wasm from 'vite-plugin-wasm';
// import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig({
    // resolve: {
    //     alias: {
    //         '@concordium/rust-bindings': '@concordium/rust-bindings/bundler', // Resolve bundler-specific wasm entrypoints.
    //     }
    // },
    plugins: [
        // wasm(),
    ],
    define: {
        global: 'globalThis',
    },
});
