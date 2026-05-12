import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const screenshotDir = path.join(repoRoot, "docs", "screenshots");
const host = "127.0.0.1";
const port = "4174";
const baseUrl = `http://${host}:${port}`;

function startVite() {
  const child = spawn("pnpm", ["exec", "vite", "--host", host, "--port", port, "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));

  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Vite at ${baseUrl}`);
}

async function capture(page, name) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    animations: "disabled",
    caret: "hide",
  });
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const server = startVite();

  const stopServer = () => {
    if (!server.killed) server.kill("SIGTERM");
  };

  process.on("SIGINT", stopServer);
  process.on("SIGTERM", stopServer);

  try {
    await waitForServer();

    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });

    await page.goto(`${baseUrl}/?demo=screenshot`, { waitUntil: "networkidle" });
    await page.waitForSelector('body[data-screenshot-ready="true"]');
    await capture(page, "workspace.png");

    await page.locator(".tab", { hasText: "Academic Theme.md" }).click();
    await page.waitForTimeout(250);
    await capture(page, "academic-theme.png");

    await page.click("#export-btn");
    await page.waitForSelector("#export-menu:not(.hidden)");
    await capture(page, "export-menu.png");

    await browser.close();
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
