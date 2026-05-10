const targets = [
  {
    name: "GitHub Pages",
    baseUrl: "https://jiangcheng-1992.github.io/mother-day",
    apiUrl: "https://mother-day-f0lj.onrender.com",
  },
  {
    name: "Render",
    baseUrl: "https://mother-day-f0lj.onrender.com",
    apiUrl: "https://mother-day-f0lj.onrender.com",
  },
];

const requiredAssets = [
  { path: "/index.html", type: "text/html" },
  { path: "/styles.css", type: "text/css" },
  { path: "/app.js", type: "javascript" },
  { path: "/config.js", type: "javascript" },
  { path: "/assets/hero-mothers-day.png", type: "image/png" },
  { path: "/assets/site-music.mp3", type: "audio/" },
];

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function checkUrl(label, url, expectedType) {
  const response = await fetch(url, { redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  const ok = response.ok && (!expectedType || contentType.includes(expectedType));

  return {
    label,
    url,
    status: response.status,
    contentType,
    ok,
  };
}

async function checkApi(target) {
  const health = await checkUrl(`${target.name} API health`, joinUrl(target.apiUrl, "/api/health"), "application/json");
  const stories = await checkUrl(`${target.name} API stories`, joinUrl(target.apiUrl, "/api/stories"), "application/json");
  return [health, stories];
}

(async () => {
  const results = [];

  for (const target of targets) {
    for (const asset of requiredAssets) {
      results.push(await checkUrl(`${target.name} ${asset.path}`, joinUrl(target.baseUrl, asset.path), asset.type));
    }
    results.push(...await checkApi(target));
  }

  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    const marker = result.ok ? "OK" : "FAIL";
    console.log(`${marker} ${result.label} -> ${result.status} ${result.contentType}`);
    if (!result.ok) console.log(`     ${result.url}`);
  }

  if (failed.length) {
    console.error(`\nDeploy QA failed: ${failed.length} check(s) did not pass.`);
    process.exit(1);
  }

  console.log("\nDeploy QA passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
