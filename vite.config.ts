import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "@mediapipe/pose": path.resolve(__dirname, "src/empty-mediapipe.ts"),
      },
    },
  },
});
