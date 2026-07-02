import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";
import { nitro } from "nitro/vite";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
      }),
    ],
    resolve: {
      alias: {
        "@mediapipe/pose": path.resolve(__dirname, "src/empty-mediapipe.ts"),
      },
    },
  },
});
