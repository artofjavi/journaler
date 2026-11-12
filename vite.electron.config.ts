import baseConfig from "./vite.config";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import electron from "vite-plugin-electron";

export default mergeConfig(
  baseConfig,
  defineConfig({
    base: "./",
    plugins: [
      electron([
        {
          entry: "electron/main.ts",
          onstart({ startup }) {
            void startup();
          },
          vite: {
            resolve: {
              alias: {
                "@shared": fileURLToPath(new URL("./shared", import.meta.url))
              }
            },
            build: {
              outDir: "build/compiled/electron",
              rollupOptions: {
                external: ["archiver"]
              }
            }
          }
        },
        {
          entry: "electron/preload.ts",
          onstart({ reload }) {
            reload();
          },
          vite: {
            resolve: {
              alias: {
                "@shared": fileURLToPath(new URL("./shared", import.meta.url))
              }
            },
            build: {
              outDir: "build/compiled/electron",
              lib: {
                entry: "electron/preload.ts",
                formats: ["cjs"],
                fileName: () => "preload"
              },
              rollupOptions: {
                output: {
                  entryFileNames: "preload.cjs"
                }
              }
            }
          }
        }
      ])
    ]
  })
);
