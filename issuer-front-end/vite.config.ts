import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
// @ts-ignore
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@concordium/rust-bindings': '@concordium/rust-bindings/bundler', // Resolve bundler-specific wasm entrypoints.
    }
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait(), // For legacy browser compatibility
  ],
  define: {
    global: 'globalThis',
  },
});
