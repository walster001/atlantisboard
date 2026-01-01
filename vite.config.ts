import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// Note: Using 127.0.0.1 instead of localhost for WebSocket compatibility
// WebSocket connections require consistent hostname usage (127.0.0.1 vs localhost)
// to avoid connection issues with Supabase Realtime
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1", // Use 127.0.0.1 for WebSocket compatibility
    port: 8080,
    strictPort: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
