const STORAGE_KEY = "mothersDayPuzzleStories";
const MUSIC_PREF_KEY = "mothersDayPuzzleMusic";
const API_ENABLED = typeof window.MOTHERS_DAY_API_BASE === "string";
const API_BASE = API_ENABLED ? window.MOTHERS_DAY_API_BASE.replace(/\/$/, "") : "";
const LIVE_REFRESH_MS = 12000;
const STAGE_META = [
  { grid: 3, label: "9片拼图", pieces: 9 },
  { grid: 4, label: "16片拼图", pieces: 16 },
  { grid: 5, label: "25片拼图", pieces: 25 },
];

const state = {
  stories: [],
  previews: [null, null, null],
  active: null,
  activeDetail: null,
  carouselIndex: 0,
  selectedTile: null,
  solved: false,
  musicFade: null,
  musicStarted: false,
  storageMode: "local",
  liveRefreshTimer: null,
  liveRefreshInFlight: false,
  storiesSignature: "",
  suppressTileClickUntil: 0,
  drag: {
    tile: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
  },
};

function normalizeHomeHash() {
  if (window.location.hash === "#home") {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
}

const elements = {
  form: document.querySelector("#create-form"),
  formStatus: document.querySelector("#form-status"),
  wall: document.querySelector("#puzzle-wall"),
  detail: document.querySelector("#story-detail"),
  detailKicker: document.querySelector("#detail-kicker"),
  detailTitle: document.querySelector("#detail-title"),
  closeDetail: document.querySelector("#close-detail"),
  detailImage: document.querySelector("#detail-image"),
  detailCaption: document.querySelector("#detail-caption"),
  detailCarousel: document.querySelector("#detail-carousel"),
  detailBlessingTotal: document.querySelector("#detail-blessing-total"),
  detailBlessingBoard: document.querySelector("#detail-blessing-board"),
  detailStages: document.querySelector("#detail-stages"),
  rankingList: document.querySelector("#ranking-list"),
  stats: {
    mothers: document.querySelector('[data-stat="mothers"]'),
    children: document.querySelector('[data-stat="children"]'),
    blessings: document.querySelector('[data-stat="blessings"]'),
  },
  play: document.querySelector("#play"),
  playKicker: document.querySelector("#play-kicker"),
  playTitle: document.querySelector("#play-title"),
  closePlay: document.querySelector("#close-play"),
  boardName: document.querySelector("#board-name"),
  boardMeta: document.querySelector("#board-meta"),
  board: document.querySelector("#puzzle-board"),
  progressBar: document.querySelector("#progress-bar"),
  shuffle: document.querySelector("#shuffle-puzzle"),
  peek: document.querySelector("#peek-image"),
  sidePreview: document.querySelector("#side-preview"),
  sideFigure: document.querySelector(".photo-preview"),
  previewCaption: document.querySelector("#preview-caption"),
  playCarousel: document.querySelector("#play-carousel"),
  stageBlessingCount: document.querySelector("#stage-blessing-count"),
  stagePlayCount: document.querySelector("#stage-play-count"),
  unlock: document.querySelector("#unlock"),
  unlockImage: document.querySelector("#unlock-image"),
  unlockBlessing: document.querySelector("#unlock-blessing"),
  blessingForm: document.querySelector("#blessing-form"),
  blessingStatus: document.querySelector("#blessing-status"),
  visitorBlessing: document.querySelector("#visitor-blessing"),
  visitorName: document.querySelector("#visitor-name"),
  music: document.querySelector("#site-music"),
  musicToggle: document.querySelector("#music-toggle"),
  homeSections: [...document.querySelectorAll(".hero, .ranking-section, .create-section, .gallery-section")],
};

function demoStories() {
  return [
    {
      id: crypto.randomUUID(),
      motherName: "所有温柔的妈妈",
      childName: "今天想念妈妈的人",
      mainBlessing: "愿你今天不用坚强，只被鲜花、拥抱和一句句谢谢包围。",
      createdAt: Date.now(),
      stages: STAGE_META.map((meta, index) => ({
        ...meta,
        image: "assets/hero-mothers-day.webp",
        blessings: [
          {
            name: "今天想念妈妈的人",
            text: index === 0
              ? "妈妈，谢谢你把普通日子也照顾得热气腾腾。"
              : index === 1
                ? "愿你慢一点老去，也愿我更早懂你。"
                : "拼完才发现，想说的话一直都在照片里。",
            createdAt: Date.now() - index * 1000,
          },
        ],
      })),
    },
  ];
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json();
}

function loadLocalStories() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : demoStories();
  } catch {
    return demoStories();
  }
}

function storiesSignature(stories = state.stories) {
  return JSON.stringify(stories.map((story) => ({
    id: story.id,
    updated: story.stages.map((stage) => ({
      pieces: stage.pieces,
      playCount: stage.playCount || 0,
      blessings: stage.blessings.length,
      latestBlessing: stage.blessings[0]?.createdAt || 0,
    })),
  })));
}

async function loadStories() {
  if (API_ENABLED) {
    try {
      const data = await apiRequest("/api/stories");
      state.storageMode = "api";
      state.stories = Array.isArray(data.stories) ? data.stories : [];
      hydrateStories();
      state.storiesSignature = storiesSignature();
      return;
    } catch {
      state.storageMode = "local";
    }
  }

  state.stories = loadLocalStories();
  hydrateStories();
  state.storiesSignature = storiesSignature();
}

function saveStories() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stories));
    return true;
  } catch {
    return false;
  }
}

function hydrateStories() {
  state.stories.forEach((story) => {
    story.id ||= crypto.randomUUID();
    story.stages = STAGE_META.map((meta, index) => {
      const savedStage = story.stages?.[index] || {};
      return {
        ...meta,
        image: savedStage.image || "assets/hero-mothers-day.webp",
        blessings: Array.isArray(savedStage.blessings) ? savedStage.blessings : [],
        playCount: Number(savedStage.playCount || 0),
      };
    });
  });
}

function replaceStory(savedStory) {
  const story = savedStory;
  const index = state.stories.findIndex((item) => item.id === story.id);
  if (index >= 0) {
    state.stories[index] = story;
  } else {
    state.stories.unshift(story);
  }
  hydrateStories();
  state.storiesSignature = storiesSignature();
  return state.stories.find((item) => item.id === story.id);
}

async function publishStory(story) {
  if (state.storageMode !== "api") {
    state.stories.unshift(story);
    if (!saveStories()) {
      state.stories.shift();
      throw new Error("local-save-failed");
    }
    return story;
  }

  const data = await apiRequest("/api/stories", {
    method: "POST",
    body: JSON.stringify({
      motherName: story.motherName,
      childName: story.childName,
      mainBlessing: story.mainBlessing,
      images: story.stages.map((stage) => stage.image),
    }),
  });
  return replaceStory(data.story);
}

async function syncStagePlay(story, stage) {
  if (state.storageMode !== "api") {
    saveStories();
    return story;
  }
  const data = await apiRequest(`/api/stories/${story.id}/stages/${stage.pieces}/play`, {
    method: "POST",
    body: "{}",
  });
  return replaceStory(data.story);
}

async function publishBlessing(story, stage, blessing) {
  if (state.storageMode !== "api") {
    stage.blessings.unshift(blessing);
    if (!saveStories()) {
      stage.blessings.shift();
      throw new Error("local-save-failed");
    }
    return story;
  }

  const data = await apiRequest(`/api/stories/${story.id}/stages/${stage.pieces}/blessings`, {
    method: "POST",
    body: JSON.stringify(blessing),
  });
  return replaceStory(data.story);
}

function allBlessings() {
  return state.stories.flatMap((story) =>
    story.stages.flatMap((stage) => stage.blessings.map((blessing) => ({
      ...blessing,
      motherName: story.motherName,
    })))
  );
}

function updateStats() {
  const blessings = allBlessings();
  const mothers = new Set(blessings.map((item) => item.motherName.trim()).filter(Boolean));
  const children = new Set(blessings.map((item) => item.name.trim()).filter(Boolean));

  elements.stats.mothers.textContent = mothers.size;
  elements.stats.children.textContent = children.size;
  elements.stats.blessings.textContent = blessings.length;
}

function blessingLine(blessing) {
  const name = (blessing?.name || "").trim() || "一位朋友";
  const text = (blessing?.text || "").trim() || "送上祝福。";
  return `来自${name}：“${text}”`;
}

function stageBlessingText(stage) {
  if (!stage.blessings.length) {
    return "拼好这张图，就能送上第一句祝福。";
  }
  const blessing = stage.blessings[state.carouselIndex % stage.blessings.length];
  return blessingLine(blessing);
}

function storyBlessings(story) {
  return story.stages.flatMap((stage) => stage.blessings);
}

function storyTotalBlessings(story) {
  return storyBlessings(story).length;
}

function storyBlessingItems(story) {
  return story.stages.flatMap((stage) =>
    stage.blessings.map((blessing) => ({
      ...blessing,
      stageLabel: stage.label,
      pieces: stage.pieces,
    }))
  ).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function motherRankings() {
  return [...state.stories]
    .map((story) => ({
      story,
      total: storyTotalBlessings(story),
      unlocked: storyIsUnlocked(story),
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total || Number(b.story.createdAt || 0) - Number(a.story.createdAt || 0));
}

function unlockedStages(story) {
  return story.stages.filter((stage) => (stage.playCount || 0) > 0);
}

function storyIsUnlocked(story) {
  return unlockedStages(story).length > 0;
}

function publicCoverStage(story) {
  const stages = unlockedStages(story);
  if (!stages.length) return story.stages[0];
  return stages[state.carouselIndex % stages.length];
}

function stageShareUrl(storyId, pieces) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}index.html`;
  }
  url.searchParams.set("story", storyId);
  url.searchParams.set("stage", pieces);
  return url.toString();
}

function updateDetailUrl(storyId, pieces) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("story", storyId);
  url.searchParams.set("stage", pieces);
  window.history.replaceState(null, "", url);
}

function updateStoryUrl(storyId) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("story", storyId);
  window.history.replaceState(null, "", url);
}

function clearDetailUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("story");
  url.searchParams.delete("stage");
  url.hash = "gallery";
  window.history.replaceState(null, "", url);
}

function setStandaloneMode(isStandalone) {
  elements.homeSections.forEach((section) => {
    section.classList.toggle("is-hidden", isStandalone);
  });
  document.body.classList.toggle("detail-mode", isStandalone);
}

function showHomeView(hash = "#gallery") {
  state.activeDetail = null;
  elements.detail.classList.add("is-hidden");
  elements.play.classList.add("is-hidden");
  elements.unlock.classList.add("is-hidden");
  setStandaloneMode(false);

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = hash.replace("#", "");
  window.history.replaceState(null, "", url);
  document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setMusicUi(isPlaying) {
  elements.musicToggle.classList.toggle("is-playing", isPlaying);
  elements.musicToggle.setAttribute("aria-pressed", String(isPlaying));
  elements.musicToggle.setAttribute("aria-label", isPlaying ? "暂停音乐" : "开启音乐");
  elements.musicToggle.title = isPlaying ? "暂停音乐" : "开启音乐";
}

function fadeMusicTo(targetVolume, onDone) {
  window.clearInterval(state.musicFade);
  const audio = elements.music;
  const startVolume = audio.volume;
  const steps = 18;
  let step = 0;

  state.musicFade = window.setInterval(() => {
    step += 1;
    const progress = step / steps;
    audio.volume = startVolume + (targetVolume - startVolume) * progress;

    if (step >= steps) {
      window.clearInterval(state.musicFade);
      audio.volume = targetVolume;
      onDone?.();
    }
  }, 45);
}

async function playMusic() {
  if (!elements.music.paused) return;
  elements.music.volume = 0;
  try {
    await elements.music.play();
    localStorage.setItem(MUSIC_PREF_KEY, "on");
    state.musicStarted = true;
    setMusicUi(true);
    fadeMusicTo(0.28);
  } catch {
    setMusicUi(false);
  }
}

function pauseMusic() {
  localStorage.setItem(MUSIC_PREF_KEY, "off");
  fadeMusicTo(0, () => {
    elements.music.pause();
    setMusicUi(false);
  });
}

function setupMusic() {
  elements.music.volume = 0;
  setMusicUi(false);

  elements.musicToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (elements.music.paused) {
      playMusic();
    } else {
      pauseMusic();
    }
  });

  const startAfterGesture = (event) => {
    if (event.target?.closest?.("#music-toggle")) {
      return;
    }
    if (!state.musicStarted && localStorage.getItem(MUSIC_PREF_KEY) !== "off") {
      playMusic();
    }
  };

  window.addEventListener("pointerdown", startAfterGesture, { once: true });
  window.addEventListener("keydown", startAfterGesture, { once: true });
}

async function copyStageLink(storyId, pieces, statusElement) {
  const link = stageShareUrl(storyId, pieces);
  try {
    await navigator.clipboard.writeText(link);
    statusElement.textContent = "链接已复制，可以发给家人朋友。";
  } catch {
    statusElement.textContent = link;
  }
}

function carouselTextForStory(story) {
  const blessings = storyBlessings(story);
  if (!blessings.length) {
    return "等一个人拼好它，再把祝福送到这里。";
  }
  const blessing = blessings[state.carouselIndex % blessings.length];
  return blessingLine(blessing);
}

function renderWall() {
  elements.wall.innerHTML = "";

  if (!state.stories.length) {
    elements.wall.innerHTML = '<div class="empty-state">还没有拼图。上传三张照片，把第一份祝福放进这里。</div>';
    return;
  }

  const template = document.querySelector("#story-template");

  state.stories.forEach((story) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const coverWrap = card.querySelector(".story-cover");
    const cover = card.querySelector(".story-cover img");
    const title = card.querySelector("h3");
    const label = card.querySelector(".story-label");
    const difficultyRow = card.querySelector(".difficulty-row");
    const carousel = card.querySelector(".blessing-carousel");
    const counts = card.querySelector(".story-counts");
    const unlocked = storyIsUnlocked(story);
    const coverStage = publicCoverStage(story);

    cover.src = coverStage.image;
    cover.alt = `${story.motherName}的拼图封面`;
    coverWrap.classList.toggle("is-locked", !unlocked);
    coverWrap.classList.toggle("is-unlocked", unlocked);
    coverWrap.setAttribute("role", "button");
    coverWrap.setAttribute("tabindex", "0");
    coverWrap.setAttribute("aria-label", `查看${story.motherName}的拼图详情`);
    coverWrap.addEventListener("click", () => openStoryDetail(story.id));
    coverWrap.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openStoryDetail(story.id);
      }
    });
    label.textContent = `${story.childName}送给${story.motherName}`;
    title.textContent = `给${story.motherName}的三段心意`;
    carousel.textContent = carouselTextForStory(story);

    const coverHint = document.createElement("span");
    coverHint.className = "cover-hint";
    coverHint.textContent = unlocked ? "已解锁，正在轮播照片" : "拼好后解锁照片";
    difficultyRow.appendChild(coverHint);

    const total = document.createElement("button");
    total.className = "public-total";
    total.type = "button";
    total.textContent = `累计 ${storyTotalBlessings(story)} 句祝福`;
    total.addEventListener("click", () => openStoryDetail(story.id));
    counts.appendChild(total);

    elements.wall.appendChild(card);
  });
}

function renderRanking() {
  elements.rankingList.innerHTML = "";
  const rankings = motherRankings();

  if (!rankings.length) {
    elements.rankingList.innerHTML = '<div class="empty-state">还没有排行榜。送出第一句祝福后，这里会出现最受祝福的妈妈。</div>';
    return;
  }

  rankings.slice(0, 8).forEach(({ story, total }, index) => {
    const item = document.createElement("article");
    item.className = "ranking-card";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-label", `查看${story.motherName}收到的祝福`);

    const rank = document.createElement("strong");
    rank.className = "ranking-number";
    rank.textContent = `No.${index + 1}`;

    const body = document.createElement("div");
    body.className = "ranking-body";
    const title = document.createElement("h3");
    title.textContent = story.motherName;
    const meta = document.createElement("p");
    meta.textContent = `${story.childName}发起 · ${total}句祝福`;
    body.append(title, meta);

    const count = document.createElement("span");
    count.className = "ranking-count";
    count.textContent = `${total}`;

    const open = () => openStoryDetail(story.id);
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    item.append(rank, body, count);
    elements.rankingList.appendChild(item);
  });
}

function appendBlessingListItem(list, blessing, metaText = "") {
  const item = document.createElement("li");
  const name = document.createElement("strong");
  name.textContent = blessing.name || "一位朋友";
  const text = document.createElement("span");
  text.textContent = blessing.text || "送上祝福。";
  item.append(name, text);
  if (metaText) {
    const meta = document.createElement("small");
    meta.textContent = metaText;
    item.appendChild(meta);
  }
  list.appendChild(item);
}

function renderDetailBlessingBoard(story) {
  const blessings = storyBlessingItems(story);
  elements.detailBlessingBoard.innerHTML = "";

  const title = document.createElement("div");
  title.className = "detail-board-head";
  const heading = document.createElement("strong");
  heading.textContent = "全部祝福";
  const count = document.createElement("span");
  count.textContent = `${blessings.length}句`;
  title.append(heading, count);

  const list = document.createElement("ul");
  list.className = "stage-blessing-list detail-blessing-list";
  if (blessings.length) {
    blessings.forEach((blessing) => appendBlessingListItem(list, blessing, blessing.stageLabel));
  } else {
    appendBlessingListItem(list, { text: "还在等待第一句祝福。" });
  }

  elements.detailBlessingBoard.append(title, list);
}

function createStageDetail(story, stage) {
  const summary = document.createElement("section");
  summary.className = "stage-summary stage-detail-card";
  summary.dataset.stagePieces = String(stage.pieces);
  const isUnlocked = (stage.playCount || 0) > 0;

  const figure = document.createElement("figure");
  figure.className = "stage-detail-photo";
  figure.classList.toggle("is-locked", !isUnlocked);
  figure.classList.toggle("is-unlocked", isUnlocked);
  const image = document.createElement("img");
  image.src = stage.image;
  image.alt = `${stage.label}照片`;
  const caption = document.createElement("figcaption");
  caption.textContent = isUnlocked
    ? "照片已完整展示"
    : "完成拼图后照片完整展示";
  if (!isUnlocked) {
    const lockBadge = document.createElement("span");
    lockBadge.className = "lock-badge";
    lockBadge.setAttribute("aria-hidden", "true");
    figure.appendChild(lockBadge);
  }
  figure.append(image, caption);

  const header = document.createElement("div");
  header.className = "stage-summary-head";
  const stageTitle = document.createElement("strong");
  stageTitle.textContent = stage.label;
  header.append(stageTitle);

  const metrics = document.createElement("div");
  metrics.className = "stage-metrics";
  const playMetric = document.createElement("span");
  playMetric.textContent = `${stage.playCount || 0}次被拼起`;
  const blessingMetric = document.createElement("span");
  blessingMetric.textContent = `${stage.blessings.length}句祝福`;
  metrics.append(playMetric, blessingMetric);

  const list = document.createElement("ul");
  list.className = "stage-blessing-list";
  if (stage.blessings.length) {
    stage.blessings.forEach((blessing) => appendBlessingListItem(list, blessing));
  } else {
    appendBlessingListItem(list, { text: "还在等待第一句祝福。" });
  }

  const inlineActions = document.createElement("div");
  inlineActions.className = "stage-inline-actions";
  const playButton = document.createElement("button");
  playButton.className = "stage-play-button";
  playButton.type = "button";
  playButton.textContent = isUnlocked ? "查看拼图" : `开始拼${stage.pieces}片`;
  playButton.addEventListener("click", () => startPuzzle(story.id, stage.pieces));

  const shareButton = document.createElement("button");
  shareButton.className = "stage-pill share-pill";
  shareButton.type = "button";
  shareButton.textContent = "复制链接";

  const shareStatus = document.createElement("p");
  shareStatus.className = "share-status";
  shareStatus.setAttribute("role", "status");
  shareStatus.setAttribute("aria-live", "polite");
  shareButton.addEventListener("click", () => copyStageLink(story.id, stage.pieces, shareStatus));

  inlineActions.append(playButton, shareButton);
  summary.append(figure, header, metrics, list, inlineActions, shareStatus);
  return summary;
}

function renderStoryDetail(story) {
  const unlocked = storyIsUnlocked(story);
  const coverStage = publicCoverStage(story);

  elements.detailKicker.textContent = `${story.childName}送给${story.motherName}`;
  elements.detailTitle.textContent = `给${story.motherName}的三段心意`;
  elements.detailImage.src = coverStage.image;
  elements.detailImage.alt = `${story.motherName}的拼图照片`;
  elements.detailCaption.textContent = unlocked ? "照片已解锁，会随着祝福慢慢轮播。" : "完成任意一张拼图后，这里会展示解锁后的照片。";
  elements.detail.querySelector(".detail-cover").classList.toggle("is-locked", !unlocked);
  elements.detail.querySelector(".detail-cover").classList.toggle("is-unlocked", unlocked);
  elements.detailCarousel.textContent = carouselTextForStory(story);
  elements.detailBlessingTotal.textContent = storyTotalBlessings(story);
  renderDetailBlessingBoard(story);
  elements.detailStages.innerHTML = "";
  story.stages.forEach((stage) => {
    elements.detailStages.appendChild(createStageDetail(story, stage));
  });
}

function openStoryDetail(storyId, options = {}) {
  const story = state.stories.find((item) => item.id === storyId);
  if (!story) return;
  state.activeDetail = storyId;
  renderStoryDetail(story);
  setStandaloneMode(true);
  elements.play.classList.add("is-hidden");
  elements.unlock.classList.add("is-hidden");
  elements.detail.classList.remove("is-hidden");
  if (options.updateUrl !== false) {
    updateStoryUrl(storyId);
  }
  if (options.scrollToStagePieces) {
    window.setTimeout(() => {
      const target = elements.detail.querySelector(`[data-stage-pieces="${options.scrollToStagePieces}"] .stage-blessing-list`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  } else if (options.scrollToBlessings) {
    window.setTimeout(() => {
      elements.detailBlessingBoard.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  } else {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }
}

function setupUploads() {
  STAGE_META.forEach((_, index) => {
    const input = document.querySelector(`#photo-${index}`);
    const card = document.querySelector(`[data-preview-card="${index}"]`);
    const uploadCta = card?.querySelector(".upload-cta");
    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      elements.formStatus.textContent = "正在整理照片，让它适合被拼成碎片。";
      try {
        state.previews[index] = await resizeImage(file);
        const preview = document.querySelector(`[data-preview="${index}"]`);
        preview.style.backgroundImage = `url("${state.previews[index]}")`;
        card?.classList.add("has-image");
        if (uploadCta) uploadCta.textContent = "更换图片";
        elements.formStatus.textContent = "照片已经准备好，可以继续写下祝福。";
      } catch {
        elements.formStatus.textContent = "这张照片暂时无法读取，换一张试试。";
        input.value = "";
        state.previews[index] = null;
        card?.classList.remove("has-image");
        if (uploadCta) uploadCta.textContent = "上传图片";
      }
    });
  });
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 960;
        const sourceSize = Math.min(img.width, img.height);
        const sourceX = Math.max(0, (img.width - sourceSize) / 2);
        const sourceY = Math.max(0, (img.height - sourceSize) / 2);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function createStory(event) {
  event.preventDefault();
  const motherName = document.querySelector("#mother-name").value.trim();
  const childName = document.querySelector("#child-name").value.trim();
  const mainBlessing = document.querySelector("#main-blessing").value.trim();

  if (!motherName || !childName || !mainBlessing) {
    elements.formStatus.textContent = "还差一点文字。请把称呼、署名和祝福都写完整。";
    return;
  }

  if (state.previews.some((preview) => !preview)) {
    elements.formStatus.textContent = "还差照片。请上传三张关于妈妈的照片。";
    const missingIndex = state.previews.findIndex((preview) => !preview);
    document.querySelector(`[data-preview-card="${missingIndex}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    return;
  }

  const story = {
    id: crypto.randomUUID(),
    motherName,
    childName,
    mainBlessing,
    createdAt: Date.now(),
    stages: STAGE_META.map((meta, index) => ({
      ...meta,
      image: state.previews[index],
      playCount: 0,
      blessings: [
        {
          name: childName,
          text: mainBlessing,
          createdAt: Date.now(),
        },
      ],
    })),
  };

  elements.formStatus.textContent = state.storageMode === "api"
    ? "正在发布到公开拼图墙..."
    : "正在保存到本地预览...";
  try {
    await publishStory(story);
  } catch {
    elements.formStatus.textContent = state.storageMode === "api"
      ? "公开发布暂时失败，请稍后再试。"
      : "这几张照片太大，浏览器暂时存不下。换几张小一点的照片再发布。";
    return;
  }

  state.previews = [null, null, null];
  elements.form.reset();
  document.querySelectorAll(".upload-preview").forEach((preview) => {
    preview.removeAttribute("style");
  });
  document.querySelectorAll(".upload-card").forEach((card) => {
    card.classList.remove("has-image");
    const uploadCta = card.querySelector(".upload-cta");
    if (uploadCta) uploadCta.textContent = "上传图片";
  });
  elements.formStatus.textContent = state.storageMode === "api"
    ? "已经公开发布。分享链接后，别人也能打开并送祝福。"
    : "已经发布到本地预览。接入公开 API 后，分享链接才能跨设备打开。";
  renderAll();
  document.querySelector("#gallery").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startPuzzle(storyId, pieces, options = {}) {
  const story = state.stories.find((item) => item.id === storyId);
  if (!story) return;
  const stageIndex = story.stages.findIndex((item) => item.pieces === pieces);
  if (stageIndex < 0) return;
  const stage = story.stages[stageIndex];

  state.active = { storyId, stageIndex };
  state.activeDetail = storyId;
  state.selectedTile = null;
  state.solved = false;

  setStandaloneMode(true);
  elements.detail.classList.add("is-hidden");
  elements.play.classList.remove("is-hidden");
  elements.unlock.classList.add("is-hidden");
  elements.playKicker.textContent = stage.label;
  elements.playTitle.textContent = `拼给${story.motherName}的照片`;
  elements.boardName.textContent = `${story.childName}送给${story.motherName}`;
  elements.boardMeta.textContent = `${stage.grid} × ${stage.grid}，拼好后解锁祝福`;
  elements.sidePreview.src = stage.image;
  elements.sideFigure.classList.remove("is-clear");
  elements.previewCaption.textContent = "拼好后，照片会完整显现。";
  elements.stageBlessingCount.textContent = stage.blessings.length;
  elements.stagePlayCount.textContent = stage.playCount || 0;
  elements.playCarousel.textContent = stageBlessingText(stage);
  elements.blessingStatus.textContent = "";
  if (options.updateUrl !== false) {
    updateDetailUrl(storyId, stage.pieces);
  }

  buildBoard(stage);
  elements.play.scrollIntoView({ behavior: "smooth", block: "start" });
}

function currentActive() {
  if (!state.active) return null;
  const story = state.stories.find((item) => item.id === state.active.storyId);
  const stage = story?.stages[state.active.stageIndex];
  return story && stage ? { story, stage } : null;
}

function buildBoard(stage) {
  const total = stage.grid * stage.grid;
  const shuffled = shufflePieces([...Array(total).keys()]);

  elements.board.style.setProperty("--grid", stage.grid);
  elements.board.innerHTML = "";

  shuffled.forEach((current, position) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.draggable = true;
    tile.dataset.position = position;
    tile.dataset.current = current;
    tile.setAttribute("aria-label", `第${position + 1}个拼图片`);
    paintTile(tile, stage);
    tile.addEventListener("click", (event) => {
      if (event.detail === 0 || Date.now() < state.suppressTileClickUntil) return;
      pickTile(tile);
    });
    tile.addEventListener("pointerdown", (event) => startTileGesture(event, tile));
    tile.addEventListener("pointermove", moveTileGesture);
    tile.addEventListener("pointerup", endTileGesture);
    tile.addEventListener("pointercancel", cancelTileGesture);
    tile.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", tile.dataset.position);
    });
    tile.addEventListener("dragover", (event) => event.preventDefault());
    tile.addEventListener("drop", (event) => {
      event.preventDefault();
      const fromPosition = Number(event.dataTransfer.getData("text/plain"));
      const fromTile = elements.board.querySelector(`[data-position="${fromPosition}"]`);
      if (fromTile && fromTile !== tile) swapTiles(fromTile, tile);
    });
    elements.board.appendChild(tile);
  });

  updateProgress();
}

function shufflePieces(items) {
  const shuffled = [...items];
  do {
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
  } while (shuffled.every((item, index) => item === index));
  return shuffled;
}

function startTileGesture(event, tile) {
  if (state.solved || event.button > 0) return;
  state.drag = {
    tile,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  tile.setPointerCapture?.(event.pointerId);
  tile.classList.add("is-gesture-source");
}

function moveTileGesture(event) {
  if (state.drag.pointerId !== event.pointerId || !state.drag.tile) return;
  const dx = event.clientX - state.drag.startX;
  const dy = event.clientY - state.drag.startY;
  const distance = Math.hypot(dx, dy);
  if (distance < 8 && !state.drag.moved) return;

  state.drag.moved = true;
  event.preventDefault();
  state.drag.tile.classList.add("is-dragging");
  state.drag.tile.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
}

function endTileGesture(event) {
  if (state.drag.pointerId !== event.pointerId || !state.drag.tile) return;
  const source = state.drag.tile;
  const wasMoved = state.drag.moved;
  resetTileGesture();

  if (!wasMoved) return;
  state.suppressTileClickUntil = Date.now() + 350;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".tile");
  if (target && target !== source && elements.board.contains(target)) {
    swapTiles(source, target);
  }
}

function cancelTileGesture(event) {
  if (state.drag.pointerId === event.pointerId) {
    resetTileGesture();
  }
}

function resetTileGesture() {
  const tile = state.drag.tile;
  if (tile) {
    tile.classList.remove("is-gesture-source", "is-dragging");
    tile.style.transform = "";
  }
  state.drag = {
    tile: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
  };
}

function paintTile(tile, stage) {
  const current = Number(tile.dataset.current);
  const col = current % stage.grid;
  const row = Math.floor(current / stage.grid);
  const denom = stage.grid - 1;
  tile.style.backgroundImage = `url("${stage.image}")`;
  tile.style.backgroundSize = `${stage.grid * 100}% ${stage.grid * 100}%`;
  tile.style.backgroundPosition = `${denom ? (col / denom) * 100 : 0}% ${denom ? (row / denom) * 100 : 0}%`;
  tile.classList.toggle("is-correct", Number(tile.dataset.position) === current);
}

function pickTile(tile) {
  if (state.solved) return;
  if (!state.selectedTile) {
    state.selectedTile = tile;
    tile.classList.add("is-selected");
    return;
  }
  if (state.selectedTile === tile) {
    tile.classList.remove("is-selected");
    state.selectedTile = null;
    return;
  }
  swapTiles(state.selectedTile, tile);
  state.selectedTile.classList.remove("is-selected");
  state.selectedTile = null;
}

function swapTiles(first, second) {
  if (state.solved) return;
  const active = currentActive();
  if (!active) return;

  const firstCurrent = first.dataset.current;
  first.dataset.current = second.dataset.current;
  second.dataset.current = firstCurrent;
  paintTile(first, active.stage);
  paintTile(second, active.stage);
  updateProgress();
}

function updateProgress() {
  const tiles = [...elements.board.querySelectorAll(".tile")];
  const correct = tiles.filter((tile) => tile.dataset.current === tile.dataset.position).length;
  const progress = tiles.length ? Math.round((correct / tiles.length) * 100) : 0;
  elements.progressBar.style.width = `${progress}%`;

  if (tiles.length && correct === tiles.length && !state.solved) {
    finishPuzzle();
  }
}

async function finishPuzzle() {
  const active = currentActive();
  if (!active) return;
  state.solved = true;
  active.stage.playCount = (active.stage.playCount || 0) + 1;
  elements.sideFigure.classList.add("is-clear");
  elements.previewCaption.textContent = "照片已经完整显现，祝福也被解锁了。";
  elements.stagePlayCount.textContent = active.stage.playCount;
  elements.unlockImage.src = active.stage.image;
  elements.unlockBlessing.textContent = `“${active.story.mainBlessing}”`;
  elements.unlock.classList.remove("is-hidden");
  renderAll();
  elements.unlock.scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    await syncStagePlay(active.story, active.stage);
    renderAll();
  } catch {
    elements.previewCaption.textContent = "照片已解锁，但公开计数暂时没有同步成功。";
  }
}

async function submitVisitorBlessing(event) {
  event.preventDefault();
  const active = currentActive();
  if (!active) return;

  const text = elements.visitorBlessing.value.trim();
  const name = elements.visitorName.value.trim();
  if (!text || !name) return;

  const blessing = {
    name,
    text,
    createdAt: Date.now(),
  };

  elements.blessingStatus.textContent = state.storageMode === "api" ? "正在公开送出..." : "正在送出...";
  try {
    await publishBlessing(active.story, active.stage, blessing);
  } catch {
    elements.blessingStatus.textContent = "这句祝福暂时没有保存成功，请稍后再试。";
    return;
  }

  const updated = currentActive();
  elements.visitorBlessing.value = "";
  elements.visitorName.value = "";
  elements.stageBlessingCount.textContent = updated?.stage.blessings.length || 0;
  elements.playCarousel.textContent = updated ? stageBlessingText(updated.stage) : "";
  elements.blessingStatus.textContent = "已经送出。谢谢你，把爱说出口。";
  renderAll();
  openStoryDetail(active.story.id, { scrollToStagePieces: active.stage.pieces });
}

function peekImage() {
  elements.sideFigure.classList.add("is-clear");
  elements.previewCaption.textContent = "看一眼就好，再慢慢把它拼起来。";
  window.setTimeout(() => {
    if (!state.solved) {
      elements.sideFigure.classList.remove("is-clear");
      elements.previewCaption.textContent = "拼好后，照片会完整显现。";
    }
  }, 1600);
}

function renderAll() {
  updateStats();
  renderRanking();
  renderWall();
}

function renderLiveData() {
  renderAll();

  if (state.activeDetail) {
    const story = state.stories.find((item) => item.id === state.activeDetail);
    if (story && !elements.detail.classList.contains("is-hidden")) {
      renderStoryDetail(story);
    }
  }

  const active = currentActive();
  if (active) {
    elements.stageBlessingCount.textContent = active.stage.blessings.length;
    elements.stagePlayCount.textContent = active.stage.playCount || 0;
    elements.playCarousel.textContent = stageBlessingText(active.stage);
  }
}

async function refreshLiveStories() {
  if (state.storageMode !== "api" || state.liveRefreshInFlight || document.hidden) return;
  state.liveRefreshInFlight = true;
  try {
    const data = await apiRequest("/api/stories");
    const stories = Array.isArray(data.stories) ? data.stories : [];
    const signature = storiesSignature(stories);
    if (signature !== state.storiesSignature) {
      state.stories = stories;
      hydrateStories();
      state.storiesSignature = storiesSignature();
      renderLiveData();
    }
  } catch {
    // Keep the current view stable; the next interval will retry.
  } finally {
    state.liveRefreshInFlight = false;
  }
}

function startLiveRefresh() {
  if (state.storageMode !== "api" || state.liveRefreshTimer) return;
  state.liveRefreshTimer = window.setInterval(refreshLiveStories, LIVE_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshLiveStories();
  });
}

function refreshCarouselText() {
  [...elements.wall.querySelectorAll(".story-card")].forEach((card, index) => {
    const story = state.stories[index];
    const carousel = card.querySelector(".blessing-carousel");
    const cover = card.querySelector(".story-cover img");
    const coverWrap = card.querySelector(".story-cover");
    const hint = card.querySelector(".cover-hint");
    if (story && carousel) {
      carousel.textContent = carouselTextForStory(story);
    }
    if (story && cover && coverWrap) {
      const unlocked = storyIsUnlocked(story);
      const coverStage = publicCoverStage(story);
      cover.src = coverStage.image;
      coverWrap.classList.toggle("is-locked", !unlocked);
      coverWrap.classList.toggle("is-unlocked", unlocked);
      if (hint) {
        hint.textContent = unlocked ? "已解锁，正在轮播照片" : "拼好后解锁照片";
      }
    }
  });

  if (state.activeDetail) {
    const story = state.stories.find((item) => item.id === state.activeDetail);
    if (story && !elements.detail.classList.contains("is-hidden")) {
      renderStoryDetail(story);
    }
  }

  const active = currentActive();
  if (active) {
    elements.playCarousel.textContent = stageBlessingText(active.stage);
  }
}

function startCarousel() {
  window.setInterval(() => {
    state.carouselIndex += 1;
    refreshCarouselText();
  }, 4200);
}

function openSharedPuzzleFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const storyId = params.get("story");
  const pieces = Number(params.get("stage"));
  if (!storyId) return;

  const story = state.stories.find((item) => item.id === storyId);
  if (story && pieces) {
    const stage = story.stages.find((item) => item.pieces === pieces);
    if (!stage) return;
    startPuzzle(storyId, pieces, { updateUrl: false });
  } else if (story) {
    openStoryDetail(storyId, { updateUrl: false });
  } else {
    elements.wall.insertAdjacentHTML(
      "afterbegin",
      '<div class="empty-state">这个分享链接暂时没有找到对应拼图。请确认公开数据服务已经部署并连接成功。</div>',
    );
    document.querySelector("#gallery").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

elements.form.addEventListener("submit", createStory);
elements.closeDetail.addEventListener("click", () => {
  showHomeView("#gallery");
});
elements.closePlay.addEventListener("click", () => {
  const active = currentActive();
  elements.play.classList.add("is-hidden");
  elements.unlock.classList.add("is-hidden");
  state.active = null;

  if (active?.story) {
    openStoryDetail(active.story.id);
  } else {
    showHomeView("#gallery");
  }
});
elements.shuffle.addEventListener("click", () => {
  const active = currentActive();
  if (active) {
    state.solved = false;
    state.selectedTile = null;
    elements.unlock.classList.add("is-hidden");
    elements.sideFigure.classList.remove("is-clear");
    elements.previewCaption.textContent = "拼好后，照片会完整显现。";
    elements.blessingStatus.textContent = "";
    buildBoard(active.stage);
  }
});
elements.peek.addEventListener("click", peekImage);
elements.blessingForm.addEventListener("submit", submitVisitorBlessing);
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;
    event.preventDefault();
    showHomeView(hash);
  });
});

async function init() {
  normalizeHomeHash();
  setupMusic();
  setupUploads();
  await loadStories();
  if (state.storageMode !== "api") {
    saveStories();
  }
  renderAll();
  startCarousel();
  startLiveRefresh();
  openSharedPuzzleFromUrl();
}

init();
