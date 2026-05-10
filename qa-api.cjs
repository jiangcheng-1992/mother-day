const { chromium } = require("playwright");
const path = require("node:path");

const baseUrl = process.env.BASE_URL || "http://localhost:4173";

(async () => {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${baseUrl}/index.html?qa=api`, { waitUntil: "load" });
  await page.locator("#mother-name").fill("测试妈妈");
  await page.locator("#child-name").fill("测试孩子");
  await page.locator("#main-blessing").fill("愿妈妈每天都被温柔照亮。");

  const image = path.resolve(__dirname, "assets/hero-mothers-day.png");
  await page.locator("#photo-0").setInputFiles(image);
  await page.locator("#photo-1").setInputFiles(image);
  await page.locator("#photo-2").setInputFiles(image);
  await page.locator("#create-form button[type='submit']").click();
  await page.waitForSelector(".story-card", { timeout: 15000 });

  const apiData = await page.evaluate(() => fetch("/api/stories").then((response) => response.json()));
  const story = apiData.stories[0];
  const shareUrl = `${baseUrl}/index.html?story=${story.id}`;

  const secondPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await secondPage.goto(shareUrl, { waitUntil: "load" });
  await secondPage.waitForSelector("#story-detail:not(.is-hidden)", { timeout: 15000 });
  const detailText = await secondPage.locator("#story-detail").innerText();
  const formStatus = await page.locator("#form-status").innerText();

  await browser.close();

  console.log(JSON.stringify({
    apiStories: apiData.stories.length,
    persistedMother: story.motherName,
    detailOpenedFromPublicLink: detailText.includes("测试妈妈"),
    hasPublicNotice: formStatus.includes("公开"),
    errors,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
