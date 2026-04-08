const defaultConfig = {
  appTitle: "COCoLa おでかけMAP",
  regionName: "千葉ニュータウンエリア",
  mapsApiKey: "",
  submitFormUrl: "",
  editFormUrl: "",
  fallbackCenter: { lat: 35.8036, lng: 140.1147 },
  fallbackZoom: 13,
  mapId: "",
  boundaryLabel: "境界データは暫定です。正式な定義が確定したら `data/boundary.json` を差し替えてください。",
  categoryDefinitions: [
    { id: "shopping", label: "ショッピング", color: "#d74f3f" },
    { id: "park", label: "公園", color: "#4f8757" },
    { id: "gourmet", label: "ぐるめ", color: "#dc8c2f" },
    { id: "other", label: "その他", color: "#5a76a8" }
  ]
};

const config = Object.assign({}, defaultConfig, window.ODEKAKE_MAP_CONFIG || {});
const params = new URLSearchParams(window.location.search);
const embedMode = params.get("embed") === "1";

const state = {
  spots: [],
  boundary: null,
  activeCategories: new Set(config.categoryDefinitions.map((category) => category.id)),
  searchText: "",
  selectedSpotId: null,
  markers: [],
  infoWindow: null,
  map: null,
  boundaryPolygon: null
};

const elements = {
  submitLink: document.querySelector("#submit-link"),
  editLink: document.querySelector("#edit-link"),
  categoryFilters: document.querySelector("#category-filters"),
  searchInput: document.querySelector("#search-input"),
  mapMeta: document.querySelector("#map-meta"),
  mapMessage: document.querySelector("#map-message"),
  map: document.querySelector("#map"),
  boundaryNote: document.querySelector("#boundary-note"),
  detailCard: document.querySelector("#detail-card"),
  spotList: document.querySelector("#spot-list"),
  resultCount: document.querySelector("#result-count"),
  statusPanel: document.querySelector("#status-panel")
};

boot().catch((error) => {
  console.error(error);
  showMapMessage("データの読み込みに失敗しました。`data/spots.json` と `data/boundary.json` の形式をご確認ください。");
  renderFallbackMap("データの読み込みエラー");
});

async function boot() {
  applyConfig();
  bindEvents();

  const [spots, boundary] = await Promise.all([
    fetchJson("./data/spots.json"),
    fetchJson("./data/boundary.json")
  ]);

  state.spots = normalizeSpots(spots);
  state.boundary = boundary;
  state.selectedSpotId = state.spots[0]?.id ?? null;

  renderCategoryFilters();
  renderDetail();
  renderList();
  updateMeta();
  renderBoundaryNote();

  if (config.mapsApiKey) {
    try {
      await loadGoogleMaps();
      initGoogleMap();
      return;
    } catch (error) {
      console.error("Google Maps failed to initialize.", error);
      showMapMessage("Google Maps の読み込みに失敗したため、案内表示に切り替えています。API キーやリファラ制限をご確認ください。");
    }
  } else {
    showMapMessage("`config.js` に Google Maps API キーが未設定のため、プレビュー表示に切り替えています。");
  }

  renderFallbackMap("Google Maps 未設定");
}

function applyConfig() {
  document.body.classList.toggle("is-embed", embedMode);
  document.title = config.appTitle;
  const lead = document.querySelector(".hero__lead");
  if (lead) {
    lead.textContent = `市民のみなさんの投稿をもとに、${config.regionName}の魅力をカテゴリ別で見られる埋め込み用マップです。`;
  }

  configureExternalLink(elements.submitLink, config.submitFormUrl);
  configureExternalLink(elements.editLink, config.editFormUrl);
  renderStatusPanel();
}

function configureExternalLink(element, url) {
  if (!element) {
    return;
  }

  if (url) {
    element.href = url;
    element.removeAttribute("aria-disabled");
    return;
  }

  element.href = "#";
  element.setAttribute("aria-disabled", "true");
}

function bindEvents() {
  elements.searchInput?.addEventListener("input", (event) => {
    state.searchText = event.target.value.trim().toLowerCase();
    renderList();
    ensureSelectedSpotVisible();
    renderDetail();
    updateMarkerVisibility();
    updateMeta();
  });
}

function renderCategoryFilters() {
  if (!elements.categoryFilters) {
    return;
  }

  elements.categoryFilters.innerHTML = "";

  for (const category of config.categoryDefinitions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.activeCategories.has(category.id) ? " is-active" : ""}`;
    button.textContent = category.label;
    button.dataset.category = category.id;
    button.addEventListener("click", () => {
      if (state.activeCategories.has(category.id)) {
        state.activeCategories.delete(category.id);
      } else {
        state.activeCategories.add(category.id);
      }

      button.classList.toggle("is-active", state.activeCategories.has(category.id));
      renderList();
      updateMarkerVisibility();
      updateMeta();
      ensureSelectedSpotVisible();
      renderDetail();
    });
    elements.categoryFilters.appendChild(button);
  }
}

function renderBoundaryNote() {
  if (!elements.boundaryNote) {
    return;
  }

  const boundaryName = state.boundary?.name ? `表示境界: ${state.boundary.name}` : "";
  elements.boundaryNote.textContent = [boundaryName, config.boundaryLabel].filter(Boolean).join(" / ");
}

function renderStatusPanel() {
  if (!elements.statusPanel) {
    return;
  }

  const items = [
    {
      label: "地図表示",
      text: config.mapsApiKey ? "Google Maps API キー設定済み" : "API キー未設定。公開前に `config.js` を更新してください。",
      ok: Boolean(config.mapsApiKey)
    },
    {
      label: "投稿フォーム",
      text: config.submitFormUrl ? "投稿導線を設定済み" : "投稿フォーム URL 未設定",
      ok: Boolean(config.submitFormUrl)
    },
    {
      label: "修正フォーム",
      text: config.editFormUrl ? "修正導線を設定済み" : "修正フォーム URL 未設定",
      ok: Boolean(config.editFormUrl)
    }
  ];

  elements.statusPanel.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("section");
    card.className = "status-card";

    const label = document.createElement("p");
    label.className = "status-card__label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = `status-card__value ${item.ok ? "is-ok" : "is-warn"}`;
    value.textContent = item.text;

    card.append(label, value);
    elements.statusPanel.appendChild(card);
  }
}

function normalizeSpots(spots) {
  if (!Array.isArray(spots)) {
    return [];
  }

  return spots
    .filter((spot) => typeof spot === "object" && spot !== null)
    .map((spot, index) => ({
      id: String(spot.id || `spot-${index + 1}`),
      name: String(spot.name || "名称未設定"),
      category: String(spot.category || "other"),
      description: String(spot.description || ""),
      address: String(spot.address || ""),
      reason: String(spot.reason || ""),
      author: String(spot.author || ""),
      url: String(spot.url || ""),
      lat: Number(spot.lat),
      lng: Number(spot.lng)
    }))
    .filter((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lng));
}

function getVisibleSpots() {
  return state.spots.filter((spot) => {
    const categoryMatch = state.activeCategories.has(spot.category);
    if (!categoryMatch) {
      return false;
    }

    if (!state.searchText) {
      return true;
    }

    const haystack = `${spot.name} ${spot.description} ${spot.address} ${spot.reason}`.toLowerCase();
    return haystack.includes(state.searchText);
  });
}

function updateMeta() {
  const total = state.spots.length;
  const visible = getVisibleSpots().length;
  elements.resultCount.textContent = String(visible);
  elements.mapMeta.textContent = `${visible}件表示 / 全${total}件`;
}

function ensureSelectedSpotVisible() {
  const visibleSpots = getVisibleSpots();
  if (visibleSpots.some((spot) => spot.id === state.selectedSpotId)) {
    return;
  }

  state.selectedSpotId = visibleSpots[0]?.id ?? null;
}

function renderList() {
  if (!elements.spotList) {
    return;
  }

  const visibleSpots = getVisibleSpots();
  ensureSelectedSpotVisible();

  if (!visibleSpots.length) {
    elements.spotList.innerHTML = '<div class="empty-state">条件に合うスポットがありません。カテゴリや検索条件を調整してください。</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const spot of visibleSpots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `spot-item${spot.id === state.selectedSpotId ? " is-selected" : ""}`;
    button.addEventListener("click", () => {
      selectSpot(spot.id, true);
    });

    const top = document.createElement("div");
    top.className = "spot-item__top";

    const title = document.createElement("p");
    title.className = "spot-item__title";
    title.textContent = spot.name;

    const badge = createBadge(spot.category);

    top.append(title, badge);

    const body = document.createElement("p");
    body.className = "spot-item__body";
    body.textContent = truncateText(spot.description || spot.reason || "説明は準備中です。", 72);

    const address = document.createElement("p");
    address.className = "spot-item__address";
    address.textContent = spot.address || "住所未登録";

    button.append(top, body, address);
    fragment.appendChild(button);
  }

  elements.spotList.innerHTML = "";
  elements.spotList.appendChild(fragment);
}

function renderDetail() {
  if (!elements.detailCard) {
    return;
  }

  const spot = state.spots.find((item) => item.id === state.selectedSpotId);
  if (!spot) {
    elements.detailCard.innerHTML = '<p class="detail-card__placeholder">表示できるスポットがありません。カテゴリやデータを確認してください。</p>';
    return;
  }

  const stack = document.createElement("div");
  stack.className = "detail-card__stack";
  stack.appendChild(createBadge(spot.category));

  const title = document.createElement("h3");
  title.textContent = spot.name;
  stack.appendChild(title);

  const description = document.createElement("p");
  description.textContent = spot.description || "説明文はまだ登録されていません。";
  stack.appendChild(description);

  const meta = document.createElement("div");
  meta.className = "detail-card__meta";
  meta.appendChild(createMetaLine("住所", spot.address || "未登録"));
  meta.appendChild(createMetaLine("おすすめ", spot.reason || "未登録"));
  meta.appendChild(createMetaLine("投稿者", spot.author || "未登録"));

  if (spot.url) {
    const link = document.createElement("a");
    link.href = spot.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "detail-card__link";
    link.textContent = spot.url;
    meta.appendChild(createMetaLine("URL", link));
  }

  stack.appendChild(meta);
  elements.detailCard.innerHTML = "";
  elements.detailCard.appendChild(stack);
}

function createMetaLine(label, value) {
  const line = document.createElement("div");
  line.className = "detail-card__meta-line";

  const labelElement = document.createElement("span");
  labelElement.className = "detail-card__label";
  labelElement.textContent = label;

  const valueElement = document.createElement("div");
  if (value instanceof HTMLElement) {
    valueElement.appendChild(value);
  } else {
    valueElement.textContent = value;
  }

  line.append(labelElement, valueElement);
  return line;
}

function createBadge(categoryId) {
  const category = config.categoryDefinitions.find((item) => item.id === categoryId)
    || config.categoryDefinitions.find((item) => item.id === "other")
    || { label: "その他", color: "#5a76a8" };

  const badge = document.createElement("span");
  badge.className = "spot-badge";
  badge.textContent = category.label;
  badge.style.color = category.color;
  return badge;
}

async function loadGoogleMaps() {
  if (window.google?.maps) {
    return;
  }

  await new Promise((resolve, reject) => {
    const callbackName = "__initOdekakeMap";

    window[callbackName] = () => {
      resolve();
      delete window[callbackName];
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: config.mapsApiKey,
      callback: callbackName,
      language: "ja",
      region: "JP"
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      reject(new Error("Google Maps script could not be loaded."));
      delete window[callbackName];
    };

    document.head.appendChild(script);
  });
}

function initGoogleMap() {
  state.map = new google.maps.Map(elements.map, {
    center: config.fallbackCenter,
    zoom: config.fallbackZoom,
    mapId: config.mapId || undefined,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "cooperative"
  });

  state.infoWindow = new google.maps.InfoWindow();
  drawBoundary();
  createMarkers();
  fitMapToData();
  updateMarkerVisibility();

  if (state.selectedSpotId) {
    focusMarker(state.selectedSpotId, false);
  }
}

function drawBoundary() {
  const paths = state.boundary?.paths;
  if (!Array.isArray(paths) || !paths.length) {
    return;
  }

  state.boundaryPolygon = new google.maps.Polygon({
    paths,
    strokeColor: "#ba5c3d",
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: "#f0d6b7",
    fillOpacity: 0.18
  });

  state.boundaryPolygon.setMap(state.map);
}

function createMarkers() {
  state.markers.forEach((entry) => entry.marker.setMap(null));
  state.markers = [];

  for (const spot of state.spots) {
    const category = config.categoryDefinitions.find((item) => item.id === spot.category)
      || config.categoryDefinitions.find((item) => item.id === "other")
      || { color: "#5a76a8" };

    const marker = new google.maps.Marker({
      position: { lat: spot.lat, lng: spot.lng },
      map: state.map,
      title: spot.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: category.color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        scale: 10
      }
    });

    marker.addListener("click", () => {
      selectSpot(spot.id, false);
      openInfoWindow(spot, marker);
    });

    state.markers.push({ spotId: spot.id, marker });
  }
}

function fitMapToData() {
  if (!state.map) {
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  let hasPoint = false;

  for (const spot of state.spots) {
    bounds.extend({ lat: spot.lat, lng: spot.lng });
    hasPoint = true;
  }

  for (const point of state.boundary?.paths || []) {
    bounds.extend(point);
    hasPoint = true;
  }

  if (hasPoint) {
    state.map.fitBounds(bounds, 48);
  }
}

function updateMarkerVisibility() {
  if (!state.markers.length) {
    return;
  }

  const visibleIds = new Set(getVisibleSpots().map((spot) => spot.id));
  for (const entry of state.markers) {
    entry.marker.setVisible(visibleIds.has(entry.spotId));
  }
}

function openInfoWindow(spot, marker) {
  if (!state.infoWindow) {
    return;
  }

  const container = document.createElement("div");
  container.style.maxWidth = "240px";
  container.innerHTML = `
    <strong>${escapeHtml(spot.name)}</strong><br>
    <span>${escapeHtml(getCategoryLabel(spot.category))}</span><br>
    <span>${escapeHtml(spot.address || "")}</span>
  `;

  state.infoWindow.setContent(container);
  state.infoWindow.open({ anchor: marker, map: state.map });
}

function selectSpot(spotId, panToMap) {
  state.selectedSpotId = spotId;
  renderList();
  renderDetail();
  focusMarker(spotId, panToMap);
}

function focusMarker(spotId, panToMap) {
  if (!state.map) {
    return;
  }

  const entry = state.markers.find((item) => item.spotId === spotId);
  const spot = state.spots.find((item) => item.id === spotId);

  if (!entry || !spot) {
    return;
  }

  if (panToMap) {
    state.map.panTo({ lat: spot.lat, lng: spot.lng });
  }

  openInfoWindow(spot, entry.marker);
}

function renderFallbackMap(title) {
  elements.map.classList.add("is-fallback");
  elements.map.innerHTML = `
    <div class="fallback-card">
      <h3>${escapeHtml(title)}</h3>
      <p>
        このアプリは GitHub Pages でそのまま公開できる静的構成です。Google Maps API キーを設定すると地図表示に切り替わり、
        未設定時でも画面が壊れず、スポット一覧と詳細は確認できます。
      </p>
    </div>
  `;
}

function showMapMessage(message) {
  if (!elements.mapMessage) {
    return;
  }

  elements.mapMessage.hidden = false;
  elements.mapMessage.textContent = message;
}

function getCategoryLabel(categoryId) {
  return config.categoryDefinitions.find((item) => item.id === categoryId)?.label || "その他";
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
