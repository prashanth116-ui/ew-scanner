import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server modules import "server-only", which throws outside a Server Component.
      // Stub it so their pure functions can be unit tested.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
