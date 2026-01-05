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
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React and React DOM
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // UI component library (shadcn/ui dependencies)
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-vendor';
            }
            // Other large vendor libraries
            if (id.includes('@tanstack') || id.includes('zod') || id.includes('date-fns')) {
              return 'utils-vendor';
            }
            // All other node_modules
            return 'vendor';
          }
          // Route-based chunks for pages
          if (id.includes('/src/pages/')) {
            const pageName = id.split('/src/pages/')[1]?.split('/')[0];
            if (pageName) {
              return `page-${pageName.toLowerCase()}`;
            }
          }
          // Feature-based chunks
          if (id.includes('/src/components/kanban/')) {
            return 'kanban';
          }
          if (id.includes('/src/components/admin/')) {
            return 'admin';
          }
          if (id.includes('/src/components/import/')) {
            return 'import';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
