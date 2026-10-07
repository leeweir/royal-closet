import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { game: "index.html", princessPreview: "princess-preview.html" },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
