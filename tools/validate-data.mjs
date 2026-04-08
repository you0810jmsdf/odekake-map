import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const configPath = path.join(rootDir, "config.js");
const spotsPath = path.join(rootDir, "data", "spots.json");
const boundaryPath = path.join(rootDir, "data", "boundary.json");

const messages = [];
let hasError = false;

const configText = await readUtf8(configPath);
const spots = JSON.parse(await readUtf8(spotsPath));
const boundary = JSON.parse(await readUtf8(boundaryPath));

const categories = extractCategories(configText);
validateCategories(categories);
validateSpots(spots, categories);
validateBoundary(boundary);

for (const message of messages) {
  console.log(message);
}

if (hasError) {
  process.exitCode = 1;
} else {
  console.log("OK: データ形式に問題は見つかりませんでした。");
}

async function readUtf8(filePath) {
  return readFile(filePath, "utf8");
}

function extractCategories(configSource) {
  const regex = /id:\s*"([^"]+)"/g;
  const ids = [];
  let match;

  while ((match = regex.exec(configSource)) !== null) {
    ids.push(match[1]);
  }

  return [...new Set(ids)];
}

function validateCategories(categoryIds) {
  if (!categoryIds.length) {
    fail("ERROR: config.js からカテゴリ定義を抽出できませんでした。");
  } else {
    info(`INFO: カテゴリ定義 ${categoryIds.length} 件を検出しました。`);
  }
}

function validateSpots(spotsData, categoryIds) {
  if (!Array.isArray(spotsData)) {
    fail("ERROR: data/spots.json は配列である必要があります。");
    return;
  }

  if (!spotsData.length) {
    warn("WARN: data/spots.json にスポットが 0 件です。");
  }

  const seenIds = new Set();

  spotsData.forEach((spot, index) => {
    const row = index + 1;

    if (!spot || typeof spot !== "object" || Array.isArray(spot)) {
      fail(`ERROR: spots[${row}] はオブジェクトである必要があります。`);
      return;
    }

    requireString(spot.id, `spots[${row}].id`);
    requireString(spot.name, `spots[${row}].name`);
    requireString(spot.category, `spots[${row}].category`);
    requireString(spot.description, `spots[${row}].description`, false);
    requireString(spot.address, `spots[${row}].address`, false);
    requireString(spot.reason, `spots[${row}].reason`, false);
    requireString(spot.author, `spots[${row}].author`, false);
    requireString(spot.url, `spots[${row}].url`, false);
    requireNumber(spot.lat, `spots[${row}].lat`);
    requireNumber(spot.lng, `spots[${row}].lng`);

    if (typeof spot.id === "string") {
      if (seenIds.has(spot.id)) {
        fail(`ERROR: spot id '${spot.id}' が重複しています。`);
      }
      seenIds.add(spot.id);
    }

    if (typeof spot.category === "string" && categoryIds.length && !categoryIds.includes(spot.category)) {
      fail(`ERROR: spots[${row}].category '${spot.category}' は config.js のカテゴリ定義にありません。`);
    }

    if (typeof spot.url === "string" && spot.url && !/^https?:\/\//.test(spot.url)) {
      warn(`WARN: spots[${row}].url は http または https で始めることを推奨します。`);
    }
  });
}

function validateBoundary(boundaryData) {
  if (!boundaryData || typeof boundaryData !== "object" || Array.isArray(boundaryData)) {
    fail("ERROR: data/boundary.json はオブジェクトである必要があります。");
    return;
  }

  requireString(boundaryData.name, "boundary.name", false);

  if (!Array.isArray(boundaryData.paths)) {
    fail("ERROR: boundary.paths は配列である必要があります。");
    return;
  }

  if (boundaryData.paths.length < 3) {
    fail("ERROR: boundary.paths は 3 点以上必要です。");
  }

  boundaryData.paths.forEach((point, index) => {
    const row = index + 1;
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      fail(`ERROR: boundary.paths[${row}] はオブジェクトである必要があります。`);
      return;
    }

    requireNumber(point.lat, `boundary.paths[${row}].lat`);
    requireNumber(point.lng, `boundary.paths[${row}].lng`);
  });
}

function requireString(value, label, required = true) {
  if (typeof value === "string") {
    if (required && !value.trim()) {
      fail(`ERROR: ${label} は空文字にできません。`);
    }
    return;
  }

  if (required || value !== undefined) {
    fail(`ERROR: ${label} は文字列である必要があります。`);
  }
}

function requireNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`ERROR: ${label} は数値である必要があります。`);
  }
}

function info(message) {
  messages.push(message);
}

function warn(message) {
  messages.push(message);
}

function fail(message) {
  hasError = true;
  messages.push(message);
}
