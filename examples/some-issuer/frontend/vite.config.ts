import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { replaceCodePlugin } from "vite-plugin-replace";

type PlatformConfig = {
  port: number;
};

const enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

const SUPPORTED_PLATFORMS = [Platform.Discord, Platform.Telegram];

const platform: Platform = process.env.VITE_SOME_ISSUER_PLATFORM as Platform;

if (!SUPPORTED_PLATFORMS.includes(platform)) {
  throw new Error(`Please specify environment variable "VITE_SOME_ISSUER_PLATFORM" to be one of: ${SUPPORTED_PLATFORMS.join(',')}`)
}

const configs: { [p in Platform]: PlatformConfig } = {
  [Platform.Telegram]: {
    port: 8080,
  },
  [Platform.Discord]: {
    port: 8081,
  },
}

const { port } = configs[platform];


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    replaceCodePlugin({ replacements: [{ from: "{{platform}}", to: platform }] })
  ],
  esbuild: false,
  server: {
    port,
    strictPort: true,
  },
})
