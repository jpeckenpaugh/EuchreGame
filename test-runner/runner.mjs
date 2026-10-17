import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = process.env.WORKSPACE_DIR || "/game";
const artifactsDir = process.env.ARTIFACTS_DIR || "/artifacts";
const galleryDir = path.join(artifactsDir, "gallery");

fs.mkdirSync(galleryDir, { recursive: true });

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".whl": "application/zip",
  ".zip": "application/zip",
  ".task": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/html/";
  let filePath = path.join(rootDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(4173, "127.0.0.1", async () => {
  console.log("Static server running at http://127.0.0.1:4173");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: artifactsDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  try {
    console.log("Navigating to EuchreGame sandbox...");
    await page.goto("http://127.0.0.1:4173/html/", { waitUntil: "networkidle" });

    console.log("Waiting for Pyodide to bootstrap (#new-match-button)...");
    await page.waitForSelector("#new-match-button:not([disabled])", { timeout: 60000 });
    await page.waitForTimeout(1500);

    console.log("Capturing 01-pyodide-ready-god-view.png");
    await page.screenshot({ path: path.join(galleryDir, "01-pyodide-ready-god-view.png") });

    console.log("Setting seed to 42 and starting new match...");
    await page.fill("#seed-input", "42");
    await page.click("#new-match-button");
    await page.waitForTimeout(1000);

    // Scroll down so both the control toolbar and the 4-seat Euchre card table + Game Log are centered!
    await page.evaluate(() => window.scrollTo({ top: 380, behavior: "smooth" }));
    await page.waitForTimeout(900);

    console.log("Capturing 02-bidding-and-upcard.png");
    await page.screenshot({ path: path.join(galleryDir, "02-bidding-and-upcard.png") });

    console.log("Stepping #next-move-button 4 times...");
    for (let i = 0; i < 4; i++) {
      await page.click("#next-move-button");
      await page.waitForTimeout(1100);
    }

    console.log("Capturing 03-trump-called-trick-play.png");
    await page.screenshot({ path: path.join(galleryDir, "03-trump-called-trick-play.png") });

    console.log("Changing view to seat:0 (Player 0 masked view)...");
    await page.selectOption("#view-select", "seat:0");
    await page.waitForTimeout(1800);

    console.log("Capturing 04-masked-seat-view.png");
    await page.screenshot({ path: path.join(galleryDir, "04-masked-seat-view.png") });

    console.log("Changing view back to god, speed to 350 (Fast), and triggering Auto Play...");
    await page.selectOption("#view-select", "god");
    await page.selectOption("#speed-select", "350");
    await page.click("#auto-play-button");
    await page.waitForTimeout(6500);

    console.log("Capturing 05-fast-autoplay-tricks.png");
    await page.screenshot({ path: path.join(galleryDir, "05-fast-autoplay-tricks.png") });

    // Scroll down slightly more to showcase the JSON state / Trick History & Scoring
    await page.evaluate(() => window.scrollTo({ top: 640, behavior: "smooth" }));
    await page.waitForTimeout(2200);

    console.log("Capturing 06-hand-scoring-and-log.png");
    await page.screenshot({ path: path.join(galleryDir, "06-hand-scoring-and-log.png") });

    // Pad total time to ~30.5s
    await page.waitForTimeout(4500);

    console.log("Showcase completed successfully!");
  } catch (err) {
    console.error("Error during showcase execution:", err);
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    server.close();

    try {
      const videoPath = await video?.path();
      if (videoPath && fs.existsSync(videoPath)) {
        const targetVideo = path.join(artifactsDir, "demo.webm");
        fs.copyFileSync(videoPath, targetVideo);
        try {
          fs.unlinkSync(videoPath);
        } catch {}
        console.log(`Saved demo video to ${targetVideo}`);
      }
    } catch (e) {
      console.warn("Could not save video:", e);
    }
  }
});
