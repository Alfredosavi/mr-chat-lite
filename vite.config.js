import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "APP_");

    return {
        base: env.APP_BASE_PATH || "/",

        plugins: [svelte()],

        server: {
            host: "0.0.0.0",
            port: 5173,
            strictPort: true,

            watch: {
                usePolling: true,
            },
        },

        preview: {
            host: "0.0.0.0",
            port: 4173,
            strictPort: true,
        },

        esbuild:
            mode === "production"
                ? {
                      pure: ["console.log", "console.debug", "console.info"],
                  }
                : undefined,
    };
});
