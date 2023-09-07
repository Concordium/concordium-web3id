import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { Config } from './src/types/global';
import { Platform } from './src/shared/types';

interface PlatformConfig {
  port: number;
}

interface HtmlPlaceholders {
  config: Config;
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

const transformHtml: (data: HtmlPlaceholders) => Plugin = data => ({
  name: 'transform-html',
  transformIndexHtml: {
    enforce: 'pre',
    handler(html, ctx) {
      if (!ctx.server) {
        // We building for production. Let production server do placeholder replacements
        return html;
      }

      return html.replace(
        /{{(\w+)}}/gi,
        (_, placeholder) => {
          const d = data[placeholder];
          if (d === undefined) {
            throw new Error(`No data supplied for placeholder: ${placeholder}`);
          }
          return JSON.stringify(d);
        }
      );
    }
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    transformHtml({
      config: { // TODO: from env...
        type: Platform.Telegram,
        network: 'testnet',
        telegramBotName: 'concordium_bot',
        contract: {
          index: '1234',
          subindex: '0'
        }
      }
    }),
  ],
  esbuild: false,
  server: {
    port,
    strictPort: true,
  },
})
