const defaultConfig = {
  appTitle: "COCoLa おでかけMAP",
  regionName: "千葉ニュータウンエリア",
  mapsApiKey: "",
  submitFormUrl: "",
  editFormUrl: "",
  fallbackCenter: { lat: 35.8036, lng: 140.1147 },
  fallbackZoom: 13,
  mapId: "",
  categoryDefinitions: [
    { id: "shopping", label: "ショッピング", color: "#ef7f4d" },
    { id: "park", label: "公園", color: "#1d9e75" },
    { id: "gourmet", label: "グルメ", color: "#f2b134" },
    { id: "other", label: "その他", color: "#6d79d8" }
  ]
};

const config = Object.assign({}, defaultConfig, window.ODEKAKE_MAP_CONFIG || {});
const params = new URLSearchParams(window.location.search);
const embedMode = params.get("embed") === "1";
const draftStorageKey = "odekake-map-submit-draft";

const state = {
  spots: [],
  boundary: null,
  categories: [],
  activeCategories: new Set(),
  searchText: "",
  selectedSpotId: null,
  markers: [],
  infoWindow: null,
  map: null,
  boundaryPolygons: [],
  carouselIndexBySpotId: {},
  draft: {
    name: "",
    category: "",
    address: "",
    description: "",
    reason: "",
    url: "",
    author: ""
  }
};

const elements = {
  submitLink: document.querySelector("#submit-link"),
  editLink: document.querySelector("#edit-link"),
  categoryFilters: document.querySelector("#category-filters"),
  searchInput: document.querySelector("#search-input"),
  mapMeta: document.querySelector("#map-meta"),
  mapMessage: document.querySelector("#map-message"),
  map: document.querySelector("#map"),
  detailCard: document.querySelector("#detail-card"),
  spotList: document.querySelector("#spot-list"),
  resultCount: document.querySelector("#result-count"),
  statusPanel: document.querySelector("#status-panel"),
  submitAssistLead: document.querySelector("#submit-assist-lead"),
  submitAssistTips: document.querySelector("#submit-assist-tips"),
  draftName: document.querySelector("#draft-name"),
  draftCategory: document.querySelector("#draft-category"),
  draftAddress: document.querySelector("#draft-address"),
  draftDescription: document.querySelector("#draft-description"),
  draftReason: document.querySelector("#draft-reason"),
  draftUrl: document.querySelector("#draft-url"),
  draftAuthor: document.querySelector("#draft-author"),
  draftPreview: document.querySelector("#draft-preview"),
  copyDraftButton: document.querySelector("#copy-draft-button"),
  copyOpenFormLink: document.querySelector("#copy-open-form-link"),
  clearDraftButton: document.querySelector("#clear-draft-button"),
  draftCopyStatus: document.querySelector("#draft-copy-status"),
  draftProgressText: document.querySelector("#draft-progress-text"),
  draftRequiredList: document.querySelector("#draft-required-list"),
  fieldNameWrap: document.querySelector("#field-name-wrap"),
  fieldAddressWrap: document.querySelector("#field-address-wrap"),
  fieldDescriptionWrap: document.querySelector("#field-description-wrap"),
  heroRegionName: document.querySelector("#hero-region-name"),
  heroSpotCount: document.querySelector("#hero-spot-count"),
  heroSubmissionCount: document.querySelector("#hero-submission-count")
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
  state.categories = buildCategories(state.spots);
  state.activeCategories = new Set(state.categories.map((category) => category.id));
  state.selectedSpotId = state.spots[0]?.id ?? null;

  renderCategoryFilters();
  initializeDraftSupport();
  renderDetail();
  renderList();
  updateMeta();

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
  if (elements.heroRegionName) {
    elements.heroRegionName.textContent = config.regionName;
  }
  const lead = document.querySelector(".hero__lead");
  if (lead) {
    lead.textContent = `お買い物、公園、グルメ、身近な寄り道先まで。${config.regionName}の魅力を、市民のみなさんの投稿を手がかりにやわらかく探せます。`;
  }

  configureExternalLink(elements.submitLink, config.submitFormUrl);
  configureExternalLink(elements.editLink, config.editFormUrl);
  configureExternalLink(elements.copyOpenFormLink, config.submitFormUrl);
  renderSubmitAssistIntro();
  renderHeroSummary();
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

  bindDraftEvents();
}

function bindDraftEvents() {
  const bindings = [
    [elements.draftName, "name"],
    [elements.draftCategory, "category"],
    [elements.draftAddress, "address"],
    [elements.draftDescription, "description"],
    [elements.draftReason, "reason"],
    [elements.draftUrl, "url"],
    [elements.draftAuthor, "author"]
  ];

  for (const [element, key] of bindings) {
    element?.addEventListener("input", (event) => {
      state.draft[key] = event.target.value.trim();
      syncDraftUi();
    });
  }

  elements.copyDraftButton?.addEventListener("click", copyDraftPreview);
  elements.copyOpenFormLink?.addEventListener("click", handleCopyAndOpenForm);
  elements.clearDraftButton?.addEventListener("click", clearDraft);
}

function initializeDraftSupport() {
  hydrateDraftFromStorage();
  populateDraftCategoryOptions();
  syncDraftInputs();
  syncDraftUi();
}

function renderSubmitAssistIntro() {
  if (elements.submitAssistLead) {
    elements.submitAssistLead.textContent = `${config.regionName}で紹介したい場所を、フォームを開く前に短く整理できます。`;
  }

  if (!elements.submitAssistTips) {
    return;
  }

  const tips = [
    "スポット名、場所、おすすめ理由の3つがあると投稿しやすくなります。",
    "参考URLと投稿者名は任意です。空欄のままでも大丈夫です。",
    config.submitFormUrl ? "メモをコピーしてからフォームを開くと、投稿がスムーズです。" : "投稿フォーム URL を設定すると、そのまま投稿フローとして使えます。"
  ];

  elements.submitAssistTips.innerHTML = "";
  for (const tip of tips) {
    const item = document.createElement("p");
    item.className = "submit-assist__tip";
    item.textContent = tip;
    elements.submitAssistTips.appendChild(item);
  }
}

function hydrateDraftFromStorage() {
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    state.draft = {
      ...state.draft,
      ...pickDraftFields(parsed)
    };
  } catch (error) {
    console.warn("Failed to restore draft.", error);
  }
}

function populateDraftCategoryOptions() {
  if (!elements.draftCategory) {
    return;
  }

  elements.draftCategory.innerHTML = "";

  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    elements.draftCategory.appendChild(option);
  }

  if (!state.draft.category || !state.categories.some((category) => category.id === state.draft.category)) {
    state.draft.category = state.categories[0]?.id || "other";
  }
}

function syncDraftInputs() {
  if (elements.draftName) elements.draftName.value = state.draft.name;
  if (elements.draftCategory) elements.draftCategory.value = state.draft.category;
  if (elements.draftAddress) elements.draftAddress.value = state.draft.address;
  if (elements.draftDescription) elements.draftDescription.value = state.draft.description;
  if (elements.draftReason) elements.draftReason.value = state.draft.reason;
  if (elements.draftUrl) elements.draftUrl.value = state.draft.url;
  if (elements.draftAuthor) elements.draftAuthor.value = state.draft.author;
}

function syncDraftUi() {
  persistDraft();

  if (elements.draftPreview) {
    elements.draftPreview.value = buildDraftPreview();
  }

  if (elements.draftCopyStatus) {
    elements.draftCopyStatus.textContent = buildDraftStatus();
  }

  renderDraftReadiness();
}

function persistDraft() {
  try {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(state.draft));
  } catch (error) {
    console.warn("Failed to persist draft.", error);
  }
}

function buildDraftPreview() {
  const categoryLabel = getCategoryLabel(state.draft.category);
  const lines = [
    `スポット名: ${state.draft.name || "-"}`,
    `カテゴリ: ${categoryLabel || "-"}`,
    `場所・住所: ${state.draft.address || "-"}`,
    `見どころ: ${state.draft.description || "-"}`,
    `おすすめ理由・体験: ${state.draft.reason || "-"}`,
    `参考URL: ${state.draft.url || "-"}`,
    `投稿者名: ${state.draft.author || "-"}`
  ];

  return lines.join("\n");
}

function buildDraftStatus() {
  const requiredCount = getDraftChecklist().filter((item) => item.done).length;

  if (requiredCount === 3) {
    return "投稿メモの準備ができました。コピーしてフォームに貼り付けられます。";
  }

  return "スポット名、場所、おすすめ内容を埋めると、投稿しやすくなります。";
}

async function copyDraftPreview() {
  if (!elements.draftPreview?.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(elements.draftPreview.value);
    if (elements.draftCopyStatus) {
      elements.draftCopyStatus.textContent = "貼り付け用テキストをコピーしました。フォームにそのまま貼り付けできます。";
    }
  } catch (error) {
    console.error("Copy failed.", error);
    if (elements.draftCopyStatus) {
      elements.draftCopyStatus.textContent = "コピーに失敗しました。下のテキスト欄を選択して手動でコピーしてください。";
    }
  }
}

async function handleCopyAndOpenForm(event) {
  if (!config.submitFormUrl) {
    event.preventDefault();
    return;
  }

  await copyDraftPreview();
}

function clearDraft() {
  state.draft = {
    name: "",
    category: state.categories[0]?.id || "other",
    address: "",
    description: "",
    reason: "",
    url: "",
    author: ""
  };

  syncDraftInputs();
  syncDraftUi();
}

function pickDraftFields(value) {
  return {
    name: String(value?.name || ""),
    category: String(value?.category || ""),
    address: String(value?.address || ""),
    description: String(value?.description || ""),
    reason: String(value?.reason || ""),
    url: String(value?.url || ""),
    author: String(value?.author || "")
  };
}

function getDraftChecklist() {
  return [
    { key: "name", label: "スポット名", done: Boolean(state.draft.name.trim()) },
    { key: "address", label: "場所・住所", done: Boolean(state.draft.address.trim()) },
    { key: "description", label: "見どころ・理由", done: Boolean((state.draft.description || state.draft.reason).trim()) }
  ];
}

function renderDraftReadiness() {
  const checklist = getDraftChecklist();
  const doneCount = checklist.filter((item) => item.done).length;

  if (elements.draftProgressText) {
    elements.draftProgressText.textContent = `${doneCount} / ${checklist.length} 項目の準備ができています`;
  }

  if (elements.draftRequiredList) {
    elements.draftRequiredList.innerHTML = "";
    for (const item of checklist) {
      const row = document.createElement("div");
      row.className = `submit-progress__item${item.done ? " is-done" : " is-pending"}`;
      row.textContent = item.done ? `${item.label} 入力済み` : `${item.label} を入力`;
      elements.draftRequiredList.appendChild(row);
    }
  }

  elements.fieldNameWrap?.classList.toggle("is-missing", !checklist[0].done);
  elements.fieldAddressWrap?.classList.toggle("is-missing", !checklist[1].done);
  elements.fieldDescriptionWrap?.classList.toggle("is-missing", !checklist[2].done);
}

function renderCategoryFilters() {
  if (!elements.categoryFilters) {
    return;
  }

  elements.categoryFilters.innerHTML = "";

  for (const category of state.categories) {
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
  elements.statusPanel.innerHTML = "";
  elements.statusPanel.hidden = true;
}

function renderHeroSummary() {
  const submissionTotal = state.spots.reduce((sum, spot) => sum + spot.submissionCount, 0);

  if (elements.heroRegionName) {
    elements.heroRegionName.textContent = config.regionName;
  }

  if (elements.heroSpotCount) {
    elements.heroSpotCount.textContent = state.spots.length ? `${state.spots.length}スポット` : "準備中";
  }

  if (elements.heroSubmissionCount) {
    elements.heroSubmissionCount.textContent = submissionTotal ? `${submissionTotal}件の投稿` : "投稿受付中";
  }
}

function normalizeSpots(spots) {
  if (!Array.isArray(spots)) {
    return [];
  }

  return spots
    .filter((spot) => typeof spot === "object" && spot !== null)
    .filter((spot) => !spot.hidden)
    .map((spot, index) => ({
      id: String(spot.id || `spot-${index + 1}`),
      name: String(spot.name || "名称未設定"),
      category: slugifyCategory(spot.category || "other"),
      categoryLabel: String(spot.categoryLabel || spot.category || "その他"),
      description: String(spot.description || ""),
      address: String(spot.address || ""),
      reason: String(spot.reason || ""),
      author: String(spot.author || ""),
      url: String(spot.url || ""),
      referenceUrls: normalizeReferenceUrls(spot.referenceUrls, spot.url),
      photos: normalizePhotos(spot.photos),
      submissions: normalizeSubmissions(spot),
      lat: Number(spot.lat),
      lng: Number(spot.lng)
    }))
    .map((spot) => ({
      ...spot,
      submissionCount: spot.submissions.length,
      photos: mergePhotos(spot.photos, spot.submissions.flatMap((submission) => submission.photos)),
      referenceUrls: normalizeReferenceUrls(
        spot.referenceUrls.concat(spot.submissions.flatMap((submission) => submission.referenceUrls)),
        spot.url
      )
    }))
    .filter((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lng));
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .filter((photo) => photo && typeof photo === "object")
    .map((photo) => ({
      src: String(photo.src || ""),
      alt: String(photo.alt || ""),
      caption: String(photo.caption || "")
    }))
    .filter((photo) => photo.src);
}

function normalizeReferenceUrls(referenceUrls, primaryUrl) {
  const values = [];

  if (Array.isArray(referenceUrls)) {
    values.push(...referenceUrls);
  }

  if (primaryUrl) {
    values.unshift(primaryUrl);
  }

  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeSubmissions(spot) {
  const raw = Array.isArray(spot?.submissions) && spot.submissions.length
    ? spot.submissions
    : [createFallbackSubmission(spot)];

  return raw
    .filter((submission) => submission && typeof submission === "object")
    .map((submission, index) => ({
      id: `${String(spot.id || "spot")}-submission-${index + 1}`,
      description: String(submission.description || ""),
      reason: String(submission.reason || ""),
      author: String(submission.author || ""),
      submittedAt: String(submission.submittedAt || ""),
      referenceUrls: normalizeReferenceUrls(submission.referenceUrls, submission.url),
      photos: normalizePhotos(submission.photos)
    }))
    .filter((submission) => {
      return Boolean(
        submission.description ||
        submission.reason ||
        submission.author ||
        submission.referenceUrls.length ||
        submission.photos.length
      );
    });
}

function createFallbackSubmission(spot) {
  return {
    description: String(spot?.description || ""),
    reason: String(spot?.reason || ""),
    author: String(spot?.author || ""),
    submittedAt: "",
    referenceUrls: normalizeReferenceUrls(spot?.referenceUrls, spot?.url),
    photos: normalizePhotos(spot?.photos)
  };
}

function mergePhotos(...groups) {
  const seen = new Set();
  const merged = [];

  groups.flat().forEach((photo) => {
    if (!photo?.src || seen.has(photo.src)) {
      return;
    }
    seen.add(photo.src);
    merged.push(photo);
  });

  return merged;
}

function buildCategories(spots) {
  const categories = new Map();

  for (const category of config.categoryDefinitions) {
    categories.set(category.id, category);
  }

  for (const spot of spots) {
    if (!categories.has(spot.category)) {
      categories.set(spot.category, {
        id: spot.category,
        label: spot.categoryLabel || spot.category,
        color: colorFromCategory(spot.category)
      });
    }
  }

  return [...categories.values()];
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

    const submissionText = spot.submissions
      .map((submission) => `${submission.description} ${submission.reason} ${submission.author}`)
      .join(" ");
    const haystack = `${spot.name} ${spot.description} ${spot.address} ${spot.reason} ${spot.categoryLabel} ${submissionText}`.toLowerCase();
    return haystack.includes(state.searchText);
  });
}

function updateMeta() {
  const total = state.spots.length;
  const visible = getVisibleSpots().length;
  elements.resultCount.textContent = String(visible);
  elements.mapMeta.textContent = `${visible}件表示 / 全${total}件`;
  renderHeroSummary();
  renderStatusPanel();
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
    button.style.setProperty("--spot-accent", getSpotAccent(spot));
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

    const meta = document.createElement("div");
    meta.className = "spot-item__meta";

    const personality = document.createElement("span");
    personality.className = "spot-item__personality";
    personality.style.setProperty("--personality-accent", getPersonalityColor(spot.author || spot.name));
    personality.textContent = `${spot.author || "地域のみんな"}さんのおすすめ`;

    const address = document.createElement("p");
    address.className = "spot-item__address";
    address.textContent = spot.address || "住所未登録";

    if (spot.submissionCount > 1) {
      address.textContent = `${address.textContent} ・ ${spot.submissionCount}件の投稿`;
    }

    meta.append(personality, address);
    button.append(top, body, meta);
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
  stack.style.setProperty("--spot-accent", getSpotAccent(spot));

  const title = document.createElement("h3");
  title.textContent = spot.name;
  stack.appendChild(title);

  const description = document.createElement("p");
  description.textContent = spot.description || "説明文はまだ登録されていません。";
  stack.appendChild(description);

  if (spot.photos.length) {
    stack.appendChild(createCarousel(spot));
  }

  const meta = document.createElement("div");
  meta.className = "detail-card__meta";
  meta.appendChild(createMetaLine("住所", spot.address || "未登録"));
  meta.appendChild(createMetaLine("おすすめ", spot.reason || "未登録"));
  meta.appendChild(createMetaLine("投稿者", spot.author || "未登録"));

  if (spot.referenceUrls.length) {
    meta.appendChild(createMetaLine("URL", createReferenceLinks(spot.referenceUrls)));
  }

  stack.appendChild(meta);
  if (spot.submissions.length) {
    stack.appendChild(createReviewTimelineSection(spot));
  }
  elements.detailCard.innerHTML = "";
  elements.detailCard.appendChild(stack);
}

function createReviewTimelineSection(spot) {
  const section = document.createElement("section");
  section.className = "detail-card__submissions";

  const heading = document.createElement("h4");
  heading.className = "detail-card__submissions-title";
  heading.textContent = spot.submissions.length > 1 ? `みんなのおすすめ (${spot.submissions.length}件)` : "おすすめメモ";
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "detail-card__submission-list";

  getSortedSubmissions(spot.submissions).forEach((submission, index) => {
    const card = document.createElement("article");
    card.className = "detail-card__submission";
    card.style.setProperty("--submission-accent", getPersonalityColor(submission.author || `${spot.name}-${index}`));

    const top = document.createElement("div");
    top.className = "detail-card__submission-top";

    const label = document.createElement("strong");
    label.textContent = `おすすめ ${index + 1}`;
    top.appendChild(label);

    const personality = document.createElement("span");
    personality.className = "detail-card__submission-personality";
    personality.style.setProperty("--personality-accent", getPersonalityColor(submission.author || `${spot.name}-${index}`));
    personality.textContent = buildPersonalityLabel(submission.author);
    top.appendChild(personality);

    const bylineParts = [];
    if (submission.submittedAt) {
      bylineParts.push(formatSubmissionDateTime(submission.submittedAt));
    }
    if (submission.author) {
      bylineParts.push(submission.author);
    }

    if (bylineParts.length) {
      const byline = document.createElement("span");
      byline.className = "detail-card__submission-byline";
      byline.textContent = bylineParts.join(" / ");
      top.appendChild(byline);
    }

    card.appendChild(top);

    if (submission.description) {
      const description = document.createElement("p");
      description.className = "detail-card__submission-description";
      description.textContent = submission.description;
      card.appendChild(description);
    }

    if (submission.reason) {
      const quote = document.createElement("blockquote");
      quote.className = "detail-card__submission-quote";
      quote.textContent = submission.reason;
      card.appendChild(quote);
    }

    if (submission.referenceUrls.length) {
      card.appendChild(createMetaLine("参考URL", createReferenceLinks(submission.referenceUrls)));
    }

    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function createSubmissionSection(spot) {
  const section = document.createElement("section");
  section.className = "detail-card__submissions";

  const heading = document.createElement("h4");
  heading.className = "detail-card__submissions-title";
  heading.textContent = spot.submissions.length > 1 ? `みんなの投稿 (${spot.submissions.length}件)` : "投稿内容";
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "detail-card__submission-list";

  spot.submissions.forEach((submission, index) => {
    const card = document.createElement("article");
    card.className = "detail-card__submission";

    const top = document.createElement("div");
    top.className = "detail-card__submission-top";

    const label = document.createElement("strong");
    label.textContent = `投稿 ${index + 1}`;
    top.appendChild(label);

    const metaParts = [];
    if (submission.author) {
      metaParts.push(submission.author);
    }
    if (submission.submittedAt) {
      metaParts.push(formatSubmissionDate(submission.submittedAt));
    }
    if (metaParts.length) {
      const byline = document.createElement("span");
      byline.className = "detail-card__submission-byline";
      byline.textContent = metaParts.join(" / ");
      top.appendChild(byline);
    }

    card.appendChild(top);

    if (submission.description) {
      const description = document.createElement("p");
      description.textContent = submission.description;
      card.appendChild(description);
    }

    if (submission.reason) {
      const reason = document.createElement("p");
      reason.className = "detail-card__submission-reason";
      reason.textContent = submission.reason;
      card.appendChild(reason);
    }

    if (submission.referenceUrls.length) {
      card.appendChild(createMetaLine("参考URL", createReferenceLinks(submission.referenceUrls)));
    }

    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

function formatSubmissionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatSubmissionDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getSortedSubmissions(submissions) {
  return [...submissions].sort((left, right) => {
    const leftTime = parseSubmissionTime(left?.submittedAt);
    const rightTime = parseSubmissionTime(right?.submittedAt);
    return rightTime - leftTime;
  });
}

function parseSubmissionTime(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function createCarousel(spot) {
  const root = document.createElement("div");
  const currentIndex = Math.max(0, Math.min(state.carouselIndexBySpotId[spot.id] || 0, spot.photos.length - 1));
  state.carouselIndexBySpotId[spot.id] = currentIndex;

  const carousel = document.createElement("div");
  carousel.className = "detail-carousel";

  const track = document.createElement("div");
  track.className = "detail-carousel__track";
  track.style.transform = `translateX(-${currentIndex * 100}%)`;

  for (const photo of spot.photos) {
    const slide = document.createElement("div");
    slide.className = "detail-carousel__slide";

    const image = document.createElement("img");
    image.src = photo.src;
    image.alt = photo.alt || spot.name;
    image.loading = "lazy";

    slide.appendChild(image);
    track.appendChild(slide);
  }

  carousel.appendChild(track);

  if (spot.photos.length > 1) {
    const nav = document.createElement("div");
    nav.className = "detail-carousel__nav";
    nav.appendChild(createCarouselButton("‹", spot, -1));
    nav.appendChild(createCarouselButton("›", spot, 1));
    carousel.appendChild(nav);
  }

  root.appendChild(carousel);

  if (spot.photos.length > 1) {
    const dots = document.createElement("div");
    dots.className = "detail-carousel__dots";
    spot.photos.forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = `detail-carousel__dot${index === currentIndex ? " is-active" : ""}`;
      dots.appendChild(dot);
    });
    root.appendChild(dots);
  }

  return root;
}

function createCarouselButton(label, spot, diff) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "detail-carousel__button";
  button.textContent = label;
  button.addEventListener("click", () => {
    const current = state.carouselIndexBySpotId[spot.id] || 0;
    const next = (current + diff + spot.photos.length) % spot.photos.length;
    state.carouselIndexBySpotId[spot.id] = next;
    renderDetail();
  });
  return button;
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

function createReferenceLinks(urls) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-card__links";

  urls.forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "detail-card__link";
    link.textContent = url;
    wrapper.appendChild(link);
  });

  return wrapper;
}

function createBadge(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId) || { label: "その他", color: "#5a76a8" };
  const badge = document.createElement("span");
  badge.className = "spot-badge";
  badge.textContent = category.label;
  badge.style.color = category.color;
  return badge;
}

function getSpotAccent(spot) {
  const category = state.categories.find((item) => item.id === spot.category);
  return category?.color || "#1d9e75";
}

function getPersonalityColor(seed) {
  const palette = ["#1d9e75", "#ef7f4d", "#6d79d8", "#f2b134", "#e56b8f", "#1fa7c9"];
  const value = String(seed || "");
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return palette[hash % palette.length];
}

function buildPersonalityLabel(author) {
  return author ? `${author}さんの視点` : "地域のみんなの視点";
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
    const query = new URLSearchParams({
      key: config.mapsApiKey,
      callback: callbackName,
      language: "ja",
      region: "JP"
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${query.toString()}`;
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
  const polygons = normalizeBoundaryPaths(state.boundary?.paths);
  if (!polygons.length) {
    return;
  }

  state.boundaryPolygons = polygons.map((paths) => {
    const polygon = new google.maps.Polygon({
      paths,
      strokeColor: "#ba5c3d",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#f0d6b7",
      fillOpacity: 0.18
    });
    polygon.setMap(state.map);
    return polygon;
  });
}

function createMarkers() {
  state.markers.forEach((entry) => entry.marker.setMap(null));
  state.markers = [];

  for (const spot of state.spots) {
    const category = state.categories.find((item) => item.id === spot.category) || { color: "#5a76a8" };

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

  for (const polygon of normalizeBoundaryPaths(state.boundary?.paths)) {
    for (const point of polygon) {
      bounds.extend(point);
      hasPoint = true;
    }
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
  return state.categories.find((item) => item.id === categoryId)?.label || "その他";
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

function normalizeBoundaryPaths(paths) {
  if (!Array.isArray(paths) || !paths.length) {
    return [];
  }

  if (isLatLngPoint(paths[0])) {
    return [paths];
  }

  return paths.filter((polygon) => Array.isArray(polygon) && polygon.every(isLatLngPoint));
}

function isLatLngPoint(point) {
  return Boolean(point)
    && typeof point === "object"
    && Number.isFinite(Number(point.lat))
    && Number.isFinite(Number(point.lng));
}

function slugifyCategory(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replaceAll(/^-+|-+$/g, "") || "other";
}

function colorFromCategory(categoryId) {
  const palette = ["#8d6ad9", "#2f8f83", "#c15d87", "#3c76c8", "#c98d24", "#6e8b3d"];
  const total = [...categoryId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}
