import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("SUPABASE_") || key === "CRM_PUBLIC_URL") process.env[key] ??= value;
  }
  return {
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({ server: { entry: "server" } }),
      ...(command === "build" ? [nitro({ preset: "node-server", noExternals: true })] : []),
      react(),
    ],
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  };
});
