const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = process.env.BASE_URL
  ? `${process.env.BASE_URL.replace(/\/$/, "")}/index.html`
  : pathToFileURL(path.resolve(__dirname, "index.html")).href;

(async () => {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${root}?qa=share`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const wallText = await page.locator("#gallery").innerText();
  const publicTotals = await page.locator(".public-total").count();
  await page.locator(".story-cover").first().click();
  await page.waitForSelector("#story-detail:not(.is-hidden)");
  const detailText = await page.locator("#story-detail").innerText();
  const stageSummaries = await page.locator("#detail-stages .stage-summary").count();
  const shareLink = await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("stage", "9");
    return url.toString();
  });

  await page.goto(shareLink, { waitUntil: "load" });
  await page.waitForSelector(".tile");
  const detailTiles = await page.locator(".tile").count();

  await page.evaluate(() => {
    document.querySelectorAll(".tile").forEach((tile) => {
      tile.dataset.current = tile.dataset.position;
      tile.classList.add("is-correct");
    });
    window.updateProgress?.();
  });
  await page.waitForSelector("#unlock:not(.is-hidden)");
  await page.locator("#visitor-blessing").fill("分享链接打开后也能继续送祝福。");
  await page.locator("#visitor-name").fill("分享访客");
  await page.locator("#blessing-form button").click();
  await page.locator("#close-play").click();
  await page.waitForSelector("#story-detail:not(.is-hidden)");

  const updatedDetailText = await page.locator("#story-detail").innerText();
  await browser.close();

  console.log(JSON.stringify({
    stageSummaries,
    publicTotals,
    wallHidesPlayMetric: !wallText.includes("0次被拼起"),
    detailHasPlayMetric: detailText.includes("0次被拼起"),
    detailHasBlessingSender: detailText.includes("今天想念妈妈的人"),
    shareLinkHasParams: shareLink.includes("story=") && shareLink.includes("stage=9"),
    detailTiles,
    updatedHasPlayCount: updatedDetailText.includes("1次被拼起"),
    updatedHasSender: updatedDetailText.includes("分享访客"),
    errors,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
