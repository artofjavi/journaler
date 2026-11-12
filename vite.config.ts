import pkg from "./package.json";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.appName)
  },
  plugins: [
    vue(),
    tailwindcss(),
    tsconfigPaths(),
    Icons({
      compiler: "vue3"
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url))
    }
  },
  build: {
    outDir: "build/compiled/renderer",
    chunkSizeWarningLimit: 2500
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    watch: {
      ignored: ["**/build/compiled/**", "**/release/**", "**/node_modules/**"]
    }
  }
});
