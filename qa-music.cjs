const { chromium } = require("playwright");

const baseUrl = process.env.BASE_URL || "http://localhost:4173";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${baseUrl}/index.html?music=${Date.now()}`, { waitUntil: "load" });
  const audioExists = await page.locator("#site-music").count();
  const toggleExists = await page.locator("#music-toggle").count();
  await page.locator("#music-toggle").click();
  const pressed = await page.locator("#music-toggle").getAttribute("aria-pressed");
  const paused = await page.locator("#site-music").evaluate((audio) => audio.paused);
  await browser.close();

  console.log(JSON.stringify({ audioExists, toggleExists, pressed, paused, errors }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
