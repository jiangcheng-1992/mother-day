import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const dataFile = resolve(root, process.env.DATA_FILE || "data/stories.json");
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);

const stageMeta = [
  { grid: 3, label: "9片拼图", pieces: 9 },
  { grid: 4, label: "16片拼图", pieces: 16 },
  { grid: 5, label: "25片拼图", pieces: 25 },
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
};

let writeQueue = Promise.resolve();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sanitizeText(value, maxLength, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeImage(value) {
  const image = String(value || "");
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(image) && image.length <= 3_200_000) {
    return image;
  }
  if (/^assets\/[-\w./]+$/i.test(image)) return image;
  return "assets/hero-mothers-day.png";
}

function sanitizeBlessing(blessing) {
  return {
    name: sanitizeText(blessing?.name, 20, "一位朋友"),
    text: sanitizeText(blessing?.text, 120, "送上祝福。"),
    createdAt: Number(blessing?.createdAt || Date.now()),
  };
}

function hydrateStory(input) {
  return {
    id: sanitizeText(input?.id, 80) || randomUUID(),
    motherName: sanitizeText(input?.motherName, 20, "妈妈"),
    childName: sanitizeText(input?.childName, 20, "一位孩子"),
    mainBlessing: sanitizeText(input?.mainBlessing, 120, "母亲节快乐。"),
    createdAt: Number(input?.createdAt || Date.now()),
    stages: stageMeta.map((meta, index) => {
      const savedStage = input?.stages?.[index] || {};
      return {
        ...meta,
        image: sanitizeImage(savedStage.image),
        playCount: Math.max(0, Math.floor(Number(savedStage.playCount || 0))),
        blessings: Array.isArray(savedStage.blessings)
          ? savedStage.blessings.slice(0, 200).map(sanitizeBlessing)
          : [],
      };
    }),
  };
}

async function readStories() {
  try {
    const content = await readFile(dataFile, "utf8");
    const stories = JSON.parse(content);
    return Array.isArray(stories) ? stories.map(hydrateStory) : [];
  } catch {
    return [];
  }
}

async function writeStories(stories) {
  await mkdir(dirname(dataFile), { recursive: true });
  const tmpFile = `${dataFile}.${Date.now()}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(stories.map(hydrateStory), null, 2)}\n`, "utf8");
  await rename(tmpFile, dataFile);
}

function mutateStories(mutator) {
  writeQueue = writeQueue.then(async () => {
    const stories = await readStories();
    const result = await mutator(stories);
    await writeStories(stories);
    return result;
  });
  return writeQueue;
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Payload too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function findStage(story, pieces) {
  return story?.stages.find((stage) => stage.pieces === Number(pieces));
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, storage: "json-file" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/stories") {
    sendJson(res, 200, { stories: await readStories() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/stories") {
    const body = await readJsonBody(req);
    const story = hydrateStory({
      ...body,
      id: randomUUID(),
      createdAt: Date.now(),
      stages: stageMeta.map((meta, index) => ({
        ...meta,
        image: body.images?.[index] || body.stages?.[index]?.image,
        playCount: 0,
        blessings: [
          {
            name: body.childName,
            text: body.mainBlessing,
            createdAt: Date.now(),
          },
        ],
      })),
    });
    const saved = await mutateStories((stories) => {
      stories.unshift(story);
      return story;
    });
    sendJson(res, 201, { story: saved });
    return true;
  }

  const playMatch = url.pathname.match(/^\/api\/stories\/([^/]+)\/stages\/(\d+)\/play$/);
  if (req.method === "POST" && playMatch) {
    const [, storyId, pieces] = playMatch;
    const saved = await mutateStories((stories) => {
      const story = stories.find((item) => item.id === storyId);
      const stage = findStage(story, pieces);
      if (!story || !stage) return null;
      stage.playCount = (stage.playCount || 0) + 1;
      return story;
    });
    sendJson(res, saved ? 200 : 404, saved ? { story: saved } : { error: "Story not found" });
    return true;
  }

  const blessingMatch = url.pathname.match(/^\/api\/stories\/([^/]+)\/stages\/(\d+)\/blessings$/);
  if (req.method === "POST" && blessingMatch) {
    const [, storyId, pieces] = blessingMatch;
    const body = await readJsonBody(req);
    const blessing = sanitizeBlessing({ ...body, createdAt: Date.now() });
    const saved = await mutateStories((stories) => {
      const story = stories.find((item) => item.id === storyId);
      const stage = findStage(story, pieces);
      if (!story || !stage) return null;
      stage.blessings.unshift(blessing);
      return story;
    });
    sendJson(res, saved ? 201 : 404, saved ? { story: saved } : { error: "Story not found" });
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found" });
    return true;
  }

  return false;
}

async function handleStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

  if (pathname === "/config.js" && process.env.SERVE_STATIC_CONFIG !== "1") {
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "text/javascript; charset=utf-8",
    });
    res.end('window.MOTHERS_DAY_API_BASE = "";\n');
    return;
  }

  const file = resolve(root, `.${pathname}`);

  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const body = await readFile(file);
  res.writeHead(200, {
    "Cache-Control": pathname === "/index.html" ? "no-cache" : "public, max-age=3600",
    "Content-Type": mime[extname(file)] || "application/octet-stream",
  });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (await handleApi(req, res, url)) return;
    await handleStatic(req, res, url);
  } catch (error) {
    if (url.pathname.startsWith("/api/")) {
      sendJson(res, error.status || 500, { error: error.message || "Server error" });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`Mother's Day puzzle site running at http://${host}:${port}`);
});
