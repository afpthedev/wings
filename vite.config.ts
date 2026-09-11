import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

function wingsFsPlugin() {
  return {
    name: "wings-fs-plugin",
    configureServer(server: any) {
      import("./server/schedulerService.ts")
        .then((mod) => mod.initScheduler())
        .catch(() => {});

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith("/api/")) {
          try {
            const { handleFsApi } = await import("./server/apiRouter.ts");
            const handled = await handleFsApi(req, res);
            if (!handled) next();
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err?.message }));
          }
        } else {
          next();
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
    },
  },
  envPrefix: ["VITE_", "GEMINI_", "GOOGLE_"],
  plugins: [react(), tailwindcss(), wingsFsPlugin()],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    include: ["mermaid"],
    exclude: ["@huggingface/transformers"],
  },
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
      "@tiptap/core",
      "@tiptap/pm",
      "@tiptap/suggestion",
    ],
  },
});
