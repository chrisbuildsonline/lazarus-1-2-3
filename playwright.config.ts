import { defineConfig, devices } from "@playwright/test";

// PORT picks the preview port (default 4173). BASE_URL points the suite at an app that is already
// running, such as the Docker image (README "Run in Docker"); then no preview is started.
const port = Number(process.env.PORT) || 4173;
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: "bun run build && bun run preview",
        env: { PORT: String(port) },
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
      },
});
