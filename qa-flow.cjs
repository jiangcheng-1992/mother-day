const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = process.env.BASE_URL
  ? `${process.env.BASE_URL.replace(/\/$/, "")}/index.html`
  : pathToFileURL(path.resolve(__dirname, "index.html")).href;
const photo = path.resolve("assets/hero-mothers-day.png");

async function solveByClicks(page) {
  const total = await page.locator(".tile").count();
  for (let target = 0; target < total; target += 1) {
    const currentAtTarget = await page.locator(`.tile[data-position="${target}"]`).getAttribute("data-current");
    if (Number(currentAtTarget) === target) continue;
    const sourcePosition = await page.locator(`.tile[data-current="${target}"]`).getAttribute("data-position");
    await page.locator(`.tile[data-position="${target}"]`).click();
    await page.locator(`.tile[data-position="${sourcePosition}"]`).click();
  }
}

async function swapByGesture(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  const first = page.locator('.tile[data-position="0"]');
  const second = page.locator('.tile[data-position="1"]');
  const beforeFirst = await first.getAttribute("data-current");
  const beforeSecond = await second.getAttribute("data-current");
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (!firstBox || !secondBox) throw new Error("Missing tile box");

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 8 });
  await page.mouse.up();

  const afterFirst = await first.getAttribute("data-current");
  const afterSecond = await second.getAttribute("data-current");
  await page.setViewportSize({ width: 1360, height: 980 });
  return afterFirst === beforeSecond && afterSecond === beforeFirst;
}

async function clickAnchorAndMeasure(page, hash) {
  await page.locator(`.nav-links a[href="${hash}"]`).click();
  await page.waitForFunction((selector) => {
    const target = document.querySelector(selector);
    const topbar = document.querySelector(".topbar");
    if (!target || !topbar) return false;
    const expectedTop = topbar.getBoundingClientRect().height + 16;
    const actualTop = target.getBoundingClientRect().top;
    return Math.abs(actualTop - expectedTop) <= 12;
  }, hash);
  await page.waitForTimeout(200);

  return page.evaluate((selector) => {
    const target = document.querySelector(selector);
    const topbar = document.querySelector(".topbar");
    return {
      actualTop: Math.round(target.getBoundingClientRect().top),
      expectedTop: Math.round(topbar.getBoundingClientRect().height + 16),
    };
  }, hash);
}

async function measureMobileLayout(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector("#story-detail:not(.is-hidden)");

  const detail = await page.evaluate(() => {
    const stages = document.querySelector("#detail-stages");
    const columns = getComputedStyle(stages).gridTemplateColumns.split(" ").filter(Boolean).length;
    return { stageColumns: columns };
  });

  await page.locator("#close-detail").click();
  await page.waitForSelector(".hero:not(.is-hidden)");
  await page.locator('.nav-links a[href="#ranking"]').click();
  await page.waitForSelector("#ranking");

  const home = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar").getBoundingClientRect();
    const statTops = [...document.querySelectorAll("#stats article")]
      .map((item) => Math.round(item.getBoundingClientRect().top));
    const rankingCard = document.querySelector(".ranking-card")?.getBoundingClientRect();
    const rankingCount = document.querySelector(".ranking-count")?.getBoundingClientRect();
    return {
      topbarHeight: Math.round(topbar.height),
      statsSameRow: new Set(statTops).size === 1,
      rankingCountCompact: Boolean(rankingCard && rankingCount && rankingCount.width <= 48 && rankingCount.top < rankingCard.bottom),
    };
  });

  await page.setViewportSize({ width: 1360, height: 980 });
  if (detail.stageColumns !== 1) throw new Error("Mobile detail stages should be single column");
  if (home.topbarHeight > 96) throw new Error("Mobile topbar is too tall");
  if (!home.statsSameRow) throw new Error("Mobile stats should stay in one compact row");
  if (!home.rankingCountCompact) throw new Error("Mobile ranking card count should stay compact");
  return { ...detail, ...home };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(root, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const result = {};
  result.load = await page.locator("h1").innerText();

  await page.locator("text=制作给妈妈的拼图").click();
  result.createVisible = await page.locator("#create").isVisible();

  await page.locator("#mother-name").fill("测试妈妈");
  await page.locator("#child-name").fill("测试孩子");
  await page.locator("#main-blessing").fill("愿你永远被认真珍惜。");
  await page.locator("button", { hasText: "发布这份祝福" }).click();
  result.missingPhotoStatus = await page.locator("#form-status").innerText();

  await page.locator("#photo-0").setInputFiles(photo);
  await page.locator("#photo-1").setInputFiles(photo);
  await page.locator("#photo-2").setInputFiles(photo);
  await page.locator("button", { hasText: "发布这份祝福" }).click();
  await page.waitForSelector(".story-card");
  result.storyCards = await page.locator(".story-card").count();

  async function ensureDetail() {
    const visible = await page.locator("#story-detail:not(.is-hidden)").count();
    if (!visible) {
      await page.locator(".story-cover").first().click();
      await page.waitForSelector("#story-detail:not(.is-hidden)");
    }
  }

  for (const pieces of [9, 16, 25]) {
    await ensureDetail();
    await page.locator("#detail-stages").locator("button", { hasText: `拼${pieces}片` }).click();
    await page.waitForSelector(".tile");
    result[`tiles${pieces}`] = await page.locator(".tile").count();
    await page.locator("#close-play").click();
  }

  await ensureDetail();
  await page.locator("#detail-stages").locator("button", { hasText: "拼9片" }).click();
  await page.waitForSelector(".tile");
  await page.locator("#peek-image").click();
  result.peekCaption = await page.locator("#preview-caption").innerText();
  await page.locator("#shuffle-puzzle").click();
  result.afterShuffleTiles = await page.locator(".tile").count();
  result.gestureSwapWorks = await swapByGesture(page);
  if (!result.gestureSwapWorks) throw new Error("Mobile gesture swap failed");
  await page.waitForTimeout(400);
  await solveByClicks(page);
  await page.waitForSelector("#unlock:not(.is-hidden)");
  result.unlockTitle = await page.locator("#unlock-title").innerText();

  await page.locator("#visitor-blessing").fill("愿妈妈今天拥有很多很多被看见的幸福。");
  await page.locator("#visitor-name").fill("测试访客");
  await page.locator("#blessing-form button").click();
  await page.waitForSelector("#story-detail:not(.is-hidden)");
  result.afterBlessingDetailVisible = await page.locator("#story-detail").isVisible();
  result.blessingListHasVisitor = (await page.locator("#story-detail").innerText()).includes("测试访客");
  result.completedButtonText = await page.locator('#detail-stages [data-stage-pieces="9"] .stage-play-button').innerText();
  await page.locator('#detail-stages [data-stage-pieces="9"] .stage-play-button').click();
  await page.waitForSelector(".tile");
  result.reopenedPuzzleSolved = await page.locator(".tile").evaluateAll((tiles) =>
    tiles.every((tile) => tile.dataset.current === tile.dataset.position)
  );
  result.reopenedCaption = await page.locator("#preview-caption").innerText();
  await page.locator("#close-play").click();
  result.mobileLayout = await measureMobileLayout(page);
  result.rankingAnchor = await clickAnchorAndMeasure(page, "#ranking");
  result.statsAnchor = await clickAnchorAndMeasure(page, "#stats");
  result.stats = await page.locator("#stats").innerText();
  result.errors = errors;
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
