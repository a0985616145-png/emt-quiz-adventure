/**
 * 救護知識冒險島 — 104–114年高級救護技術員考古題闖關練習系統
 * 集中遊戲數值與設定，方便學員或講師調整
 */
const GAME_CONFIG = {
  appName: "救護知識冒險島",
  dataUrl: "data/questions.json",
  maxHearts: 10,
  initialHearts: 10,
  pointsPerCorrect: 100,
  damagePerWrong: 1,
  chestGroupSize: 5,
  defaultQuestionCount: 10,
  storageKeyWrongBook: "emt_quiz_adventure_wrong_book_v1",
  storageKeyMotion: "emt_quiz_adventure_reduce_motion_v1",
  // 寶箱回復機率設定：25% 回復 3 顆、35% 回復 2 顆、30% 回復 1 顆、10% 補滿
  chestRewards: [
    { threshold: 0.25, heal: 3, label: "獲得高級急救包！回復 3 顆愛心 ❤️❤️❤️" },
    { threshold: 0.60, heal: 2, label: "獲得中級醫療箱！回復 2 顆愛心 ❤️❤️" },
    { threshold: 0.90, heal: 1, label: "獲得隨身繃帶！回復 1 顆愛心 ❤️" },
    { threshold: 1.00, heal: "FULL", label: "獲得奇蹟甦醒補給！愛心完全補滿 💖" }
  ]
};

const appState = {
  loaded: false,
  meta: null,
  allQuestions: [],
  questionById: new Map(),

  // 篩選條件
  selectedYears: new Set(),
  selectedChapters: new Set(),
  requestedCount: "10",

  // 目前回合狀態
  inRound: false,
  isWrongBookMode: false,
  roundPool: [],
  currentIndex: 0,
  selectedOptionId: null,
  submittedCurrent: false,
  hearts: GAME_CONFIG.initialHearts,
  score: 0,
  answeredCount: 0,
  correctCount: 0,
  wrongCount: 0,
  pendingChestForCurrent: false,
  chestClaimedForCurrent: false,
  activeTimers: [],

  // 確認對話框回呼
  confirmCallback: null
};

// 安全管理計時器，避免重開回合時舊動畫回呼干擾新回合
function registerTimer(fn, delayMs) {
  const id = window.setTimeout(() => {
    appState.activeTimers = appState.activeTimers.filter(t => t !== id);
    fn();
  }, delayMs);
  appState.activeTimers.push(id);
  return id;
}

function clearAllTimers() {
  for (const id of appState.activeTimers) {
    window.clearTimeout(id);
  }
  appState.activeTimers = [];
}

// 安全讀取與寫入 localStorage 錯題本
function loadWrongBookMap() {
  try {
    const raw = window.localStorage.getItem(GAME_CONFIG.storageKeyWrongBook);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (err) {
    console.warn("localStorage 無法讀取或資料損壞，改用暫存空紀錄：", err);
    return {};
  }
}

function saveWrongBookMap(mapObj) {
  try {
    window.localStorage.setItem(GAME_CONFIG.storageKeyWrongBook, JSON.stringify(mapObj));
  } catch (err) {
    console.warn("localStorage 無法寫入：", err);
  }
  updateNavBadges();
}

function recordWrongQuestion(questionId, chosenOptionId) {
  const mapObj = loadWrongBookMap();
  const prev = mapObj[questionId] || { id: questionId, wrongCount: 0, lastAnswer: "", updatedAt: "" };
  mapObj[questionId] = {
    id: questionId,
    wrongCount: (Number(prev.wrongCount) || 0) + 1,
    lastAnswer: chosenOptionId,
    updatedAt: new Date().toISOString()
  };
  saveWrongBookMap(mapObj);
}

function removeWrongQuestionRecord(questionId) {
  const mapObj = loadWrongBookMap();
  delete mapObj[questionId];
  saveWrongBookMap(mapObj);
}

function clearAllWrongQuestionRecords() {
  saveWrongBookMap({});
}

// 隨機洗牌 (Fisher-Yates)
function shuffleArray(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

// 畫面切換輔助
function showScreen(screenId) {
  const screens = ["screenSetup", "screenQuiz", "screenResult", "screenWrongBook", "screenReviewList"];
  for (const id of screens) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle("hidden", id !== screenId);
    }
  }
  // 更新頂部導覽按鈕狀態
  const navMap = {
    screenSetup: "btnNavHome",
    screenQuiz: "btnNavHome",
    screenResult: "btnNavHome",
    screenWrongBook: "btnNavWrongBook",
    screenReviewList: "btnNavReviewList"
  };
  for (const btnId of ["btnNavHome", "btnNavWrongBook", "btnNavReviewList"]) {
    const btn = document.getElementById(btnId);
    if (btn) {
      const isActive = navMap[screenId] === btnId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }
}

function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById("confirmModal");
  document.getElementById("confirmModalTitle").textContent = title;
  document.getElementById("confirmModalMessage").textContent = message;
  appState.confirmCallback = onConfirm;
  modal.classList.remove("hidden");
  document.getElementById("btnConfirmOk").focus();
}

function closeConfirmModal() {
  document.getElementById("confirmModal").classList.add("hidden");
  appState.confirmCallback = null;
}

// 載入題庫 JSON
async function loadQuestionBank() {
  const errorBanner = document.getElementById("errorBanner");
  errorBanner.classList.add("hidden");

  try {
    const resp = await window.fetch(GAME_CONFIG.dataUrl, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`HTTP 狀態碼 ${resp.status} (${resp.statusText})`);
    }
    const data = await resp.json();
    if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("題庫 JSON 格式不正確或題目陣列為空");
    }

    appState.loaded = true;
    appState.meta = data.meta || {};
    appState.allQuestions = data.questions;
    appState.questionById.clear();
    for (const q of data.questions) {
      appState.questionById.set(q.id, q);
    }

    initFilters();
    updateFilterStats();
    updateNavBadges();
    renderReviewQuestionsList();
  } catch (err) {
    appState.loaded = false;
    console.error("題庫載入失敗：", err);
    const errText = document.getElementById("errorMessageText");
    errText.textContent = `讀取 ${GAME_CONFIG.dataUrl} 失敗（原因：${err.message}）。請確認您已啟動本機 HTTP 伺服器或透過 GitHub Pages 瀏覽，再點擊下方按鈕重試。`;
    errorBanner.classList.remove("hidden");
  }
}

function updateNavBadges() {
  const wrongMap = loadWrongBookMap();
  const wrongCount = Object.keys(wrongMap).length;
  document.getElementById("wrongCountBadge").textContent = String(wrongCount);

  const reviewCount = appState.allQuestions.filter(q => q.reviewStatus !== "valid").length;
  document.getElementById("reviewCountBadge").textContent = String(reviewCount);
}

// 初始化年度與章節核取方塊
function initFilters() {
  const years = (appState.meta && Array.isArray(appState.meta.years))
    ? appState.meta.years
    : ["104-107年", "108年", "109年", "110年", "111年", "112年", "113年", "114年"];

  const chapters = (appState.meta && Array.isArray(appState.meta.chapters))
    ? appState.meta.chapters
    : [{ id: "UNCATEGORIZED", name: "未分類" }];

  appState.selectedYears = new Set(years);
  appState.selectedChapters = new Set(chapters.map(c => c.id));

  const yearContainer = document.getElementById("yearCheckboxes");
  yearContainer.innerHTML = "";
  for (const y of years) {
    const count = appState.allQuestions.filter(q => q.year === y && q.reviewStatus === "valid").length;
    const label = document.createElement("label");
    label.className = "check-label checked";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = y;
    input.checked = true;
    input.addEventListener("change", () => {
      if (input.checked) appState.selectedYears.add(y);
      else appState.selectedYears.delete(y);
      label.classList.toggle("checked", input.checked);
      updateFilterStats();
    });
    const span = document.createElement("span");
    span.textContent = `${y} (${count})`;
    label.appendChild(input);
    label.appendChild(span);
    yearContainer.appendChild(label);
  }

  const chContainer = document.getElementById("chapterCheckboxes");
  chContainer.innerHTML = "";
  for (const ch of chapters) {
    const count = appState.allQuestions.filter(q => q.chapterId === ch.id && q.reviewStatus === "valid").length;
    const label = document.createElement("label");
    label.className = "check-label checked";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ch.id;
    input.checked = true;
    input.addEventListener("change", () => {
      if (input.checked) appState.selectedChapters.add(ch.id);
      else appState.selectedChapters.delete(ch.id);
      label.classList.toggle("checked", input.checked);
      updateFilterStats();
    });
    const span = document.createElement("span");
    span.textContent = `${ch.name} (${count})`;
    label.appendChild(input);
    label.appendChild(span);
    chContainer.appendChild(label);
  }
}

function syncCheckboxElements() {
  const yearContainer = document.getElementById("yearCheckboxes");
  for (const label of yearContainer.querySelectorAll(".check-label")) {
    const input = label.querySelector("input");
    const isChecked = appState.selectedYears.has(input.value);
    input.checked = isChecked;
    label.classList.toggle("checked", isChecked);
  }
  const chContainer = document.getElementById("chapterCheckboxes");
  for (const label of chContainer.querySelectorAll(".check-label")) {
    const input = label.querySelector("input");
    const isChecked = appState.selectedChapters.has(input.value);
    input.checked = isChecked;
    label.classList.toggle("checked", isChecked);
  }
}

function getFilteredQuestions() {
  const matching = appState.allQuestions.filter(q =>
    appState.selectedYears.has(q.year) && appState.selectedChapters.has(q.chapterId)
  );
  const validPool = matching.filter(q => q.reviewStatus === "valid");
  const reviewPool = matching.filter(q => q.reviewStatus !== "valid");
  return { validPool, reviewPool };
}

function updateFilterStats() {
  if (!appState.loaded) return;
  const { validPool, reviewPool } = getFilteredQuestions();
  document.getElementById("statValidPoolCount").textContent = String(validPool.length);
  document.getElementById("statReviewPoolCount").textContent = String(reviewPool.length);

  const btnStart = document.getElementById("btnStartQuiz");
  const warningEl = document.getElementById("poolWarningMsg");

  if (validPool.length === 0) {
    btnStart.disabled = true;
    warningEl.classList.remove("hidden");
    if (appState.selectedYears.size === 0 && appState.selectedChapters.size === 0) {
      warningEl.textContent = "⚠️ 您尚未勾選任何「考試年度」與「主題章節」，請至少勾選一項年度與章節後再開始闖關。";
    } else if (appState.selectedYears.size === 0) {
      warningEl.textContent = "⚠️ 您尚未勾選任何「考試年度」，請至少勾選一個年度。";
    } else if (appState.selectedChapters.size === 0) {
      warningEl.textContent = "⚠️ 您尚未勾選任何「主題章節」，請至少勾選一個章節（例如包含「未分類」）。";
    } else {
      warningEl.textContent = "⚠️ 目前篩選條件的交集下沒有有效計分題目（注意：113、114 年官方試卷預設歸類於「未分類」章節），請擴大勾選範圍。";
    }
  } else {
    btnStart.disabled = false;
    warningEl.classList.add("hidden");
  }
}

// 開始新回合
function startQuizRound(customPool = null, isWrongBook = false) {
  if (!appState.loaded) {
    loadQuestionBank();
    return;
  }

  clearAllTimers();
  closeChestModal(true);
  closeConfirmModal();

  let sourceValidPool = [];
  if (Array.isArray(customPool)) {
    sourceValidPool = customPool.filter(q => q && q.reviewStatus === "valid");
  } else {
    sourceValidPool = getFilteredQuestions().validPool;
  }

  if (sourceValidPool.length === 0) {
    updateFilterStats();
    return;
  }

  const reqVal = document.getElementById("selectQuestionCount").value;
  appState.requestedCount = reqVal;
  const targetCount = reqVal === "all" ? sourceValidPool.length : Math.max(1, parseInt(reqVal, 10) || GAME_CONFIG.defaultQuestionCount);

  const shuffled = shuffleArray(sourceValidPool);
  const selectedQuestions = shuffled.slice(0, Math.min(targetCount, shuffled.length));

  appState.inRound = true;
  appState.isWrongBookMode = isWrongBook;
  appState.roundPool = selectedQuestions;
  appState.currentIndex = 0;
  appState.selectedOptionId = null;
  appState.submittedCurrent = false;
  appState.hearts = GAME_CONFIG.initialHearts;
  appState.score = 0;
  appState.answeredCount = 0;
  appState.correctCount = 0;
  appState.wrongCount = 0;
  appState.pendingChestForCurrent = false;
  appState.chestClaimedForCurrent = false;

  const shortfallEl = document.getElementById("shortfallNotice");
  if (!isWrongBook && reqVal !== "all" && sourceValidPool.length < targetCount) {
    shortfallEl.textContent = `ℹ️ 提示：您要求每回合 ${targetCount} 題，但目前篩選條件下僅有 ${sourceValidPool.length} 題有效題目，本回合將以實際可用的 ${sourceValidPool.length} 題進行（不重複湊題）。`;
    shortfallEl.classList.remove("hidden");
  } else if (isWrongBook) {
    shortfallEl.textContent = `📕 錯題複習模式：共載入 ${selectedQuestions.length} 題您的歷史錯題進行闖關！`;
    shortfallEl.classList.remove("hidden");
  } else {
    shortfallEl.classList.add("hidden");
  }

  showScreen("screenQuiz");
  renderCurrentQuestion();
  updateHud();
}

function updateHud() {
  // 愛心圖示
  const heartsContainer = document.getElementById("heartsDisplay");
  heartsContainer.innerHTML = "";
  for (let i = 0; i < GAME_CONFIG.maxHearts; i++) {
    const span = document.createElement("span");
    span.textContent = i < appState.hearts ? "❤️" : "🖤";
    heartsContainer.appendChild(span);
  }
  document.getElementById("heartsText").textContent = `${appState.hearts} / ${GAME_CONFIG.maxHearts}`;

  // 題數進度與寶箱提示
  const total = appState.roundPool.length;
  const currentNum = Math.min(appState.currentIndex + 1, total);
  document.getElementById("progressText").textContent = `第 ${currentNum} / ${total} 題`;

  const stepInGroup = ((currentNum - 1) % GAME_CONFIG.chestGroupSize) + 1;
  document.getElementById("chestProgressHint").textContent = `🎁 本組寶箱進度：${stepInGroup}/${GAME_CONFIG.chestGroupSize}`;

  // 分數與即時正確率
  document.getElementById("scoreText").textContent = String(appState.score);
  const accEl = document.getElementById("liveAccuracyText");
  if (appState.answeredCount === 0) {
    accEl.textContent = "尚無結果";
  } else {
    const pct = Math.round((appState.correctCount / appState.answeredCount) * 100);
    accEl.textContent = `${pct}% (${appState.correctCount}/${appState.answeredCount})`;
  }
}

function renderCurrentQuestion() {
  const q = appState.roundPool[appState.currentIndex];
  if (!q) return;

  appState.selectedOptionId = null;
  appState.submittedCurrent = false;
  appState.pendingChestForCurrent = false;
  appState.chestClaimedForCurrent = false;

  document.getElementById("qMetaYear").textContent = q.year;
  document.getElementById("qMetaChapter").textContent = q.chapterName;
  document.getElementById("qMetaNumber").textContent = `原題號：第 ${q.number} 題`;
  document.getElementById("qMetaId").textContent = `ID: ${q.id}`;

  document.getElementById("questionStem").textContent = q.stem;

  // 題幹附圖
  const imgContainer = document.getElementById("questionImagesContainer");
  imgContainer.innerHTML = "";
  if (Array.isArray(q.images) && q.images.length > 0) {
    for (const imgPath of q.images) {
      const img = document.createElement("img");
      img.src = imgPath;
      img.alt = `題目 ${q.id} 附圖`;
      img.loading = "lazy";
      imgContainer.appendChild(img);
    }
    imgContainer.classList.remove("hidden");
  } else {
    imgContainer.classList.add("hidden");
  }

  // 選項渲染 (固定順序 A, B, C, D)
  const optsContainer = document.getElementById("optionsContainer");
  optsContainer.innerHTML = "";
  for (const opt of q.options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.optId = opt.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");

    const keyBadge = document.createElement("span");
    keyBadge.className = "opt-key-badge";
    keyBadge.textContent = opt.id;

    const contentDiv = document.createElement("div");
    contentDiv.className = "opt-content";
    if (opt.text) {
      const textSpan = document.createElement("span");
      textSpan.textContent = opt.text;
      contentDiv.appendChild(textSpan);
    }
    if (opt.image) {
      const oImg = document.createElement("img");
      oImg.src = opt.image;
      oImg.alt = `選項 (${opt.id}) 附圖`;
      contentDiv.appendChild(oImg);
    }

    const statusTag = document.createElement("span");
    statusTag.className = "opt-status-tag";

    btn.appendChild(keyBadge);
    btn.appendChild(contentDiv);
    btn.appendChild(statusTag);

    btn.addEventListener("click", () => selectOption(opt.id));
    optsContainer.appendChild(btn);
  }

  // 重設按鈕與回饋面板
  const btnSubmit = document.getElementById("btnSubmitAnswer");
  btnSubmit.disabled = true;
  btnSubmit.classList.remove("hidden");

  const btnNext = document.getElementById("btnNextQuestion");
  btnNext.classList.add("hidden");

  document.getElementById("feedbackPanel").classList.add("hidden");

  // 重設戰鬥狀態條
  const heroSprite = document.getElementById("heroSprite");
  const monsterSprite = document.getElementById("monsterSprite");
  heroSprite.classList.remove("anim-attack", "anim-hurt");
  monsterSprite.classList.remove("anim-attack", "anim-hurt");
  document.getElementById("battleStatusText").textContent = "遭遇急救考題守衛！請選擇一個最適當的選項並按「確認答案」。";
}

function selectOption(optId) {
  if (!appState.inRound || appState.submittedCurrent) return;
  appState.selectedOptionId = optId;

  const optsContainer = document.getElementById("optionsContainer");
  for (const btn of optsContainer.querySelectorAll(".option-btn")) {
    const isTarget = btn.dataset.optId === optId;
    btn.classList.toggle("selected", isTarget);
    btn.setAttribute("aria-checked", isTarget ? "true" : "false");
  }

  document.getElementById("btnSubmitAnswer").disabled = false;
}

function submitCurrentAnswer() {
  if (!appState.inRound || appState.submittedCurrent || !appState.selectedOptionId) return;

  // 鎖定本題作答，防止連點或快捷鍵重複計分
  appState.submittedCurrent = true;
  document.getElementById("btnSubmitAnswer").disabled = true;
  document.getElementById("btnSubmitAnswer").classList.add("hidden");

  const q = appState.roundPool[appState.currentIndex];
  const chosen = appState.selectedOptionId;
  const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
  const isCorrect = accepted.includes(chosen);

  appState.answeredCount += 1;

  const heroSprite = document.getElementById("heroSprite");
  const monsterSprite = document.getElementById("monsterSprite");
  heroSprite.classList.remove("anim-attack", "anim-hurt");
  monsterSprite.classList.remove("anim-attack", "anim-hurt");

  if (isCorrect) {
    appState.correctCount += 1;
    appState.score += GAME_CONFIG.pointsPerCorrect;
    heroSprite.classList.add("anim-attack");
    monsterSprite.classList.add("anim-hurt");
    document.getElementById("battleStatusText").textContent = `🎯 精準處置！成功擊退考題守衛，獲得 +${GAME_CONFIG.pointsPerCorrect} 積分！`;
  } else {
    appState.wrongCount += 1;
    appState.hearts = Math.max(0, appState.hearts - GAME_CONFIG.damagePerWrong);
    monsterSprite.classList.add("anim-attack");
    heroSprite.classList.add("anim-hurt");
    document.getElementById("battleStatusText").textContent = `💥 判斷失誤！受到考題守衛反擊，扣除 ${GAME_CONFIG.damagePerWrong} 顆愛心（已加入錯題本）。`;
    recordWrongQuestion(q.id, chosen);
  }

  // 檢查是否觸發第 5k 題寶箱：每完成一組 5 題，若第 5 題答對且愛心 > 0，獲得一次寶箱
  const currentQuestionNumberInRound = appState.currentIndex + 1;
  if (
    currentQuestionNumberInRound % GAME_CONFIG.chestGroupSize === 0 &&
    isCorrect &&
    appState.hearts > 0
  ) {
    appState.pendingChestForCurrent = true;
  }

  // 標示各選項正誤（不只依賴紅綠色，加上文字標籤 ✓ / ✗）
  const optsContainer = document.getElementById("optionsContainer");
  for (const btn of optsContainer.querySelectorAll(".option-btn")) {
    btn.disabled = true;
    const oid = btn.dataset.optId;
    const statusTag = btn.querySelector(".opt-status-tag");
    if (accepted.includes(oid)) {
      btn.classList.add("correct-choice");
      statusTag.textContent = oid === chosen ? "✓ 您的選擇（正確）" : "✓ 正確答案";
    } else if (oid === chosen) {
      btn.classList.add("wrong-choice");
      statusTag.textContent = "✗ 您的選擇（錯誤）";
    }
  }

  // 呈現回饋與解析區
  const feedbackPanel = document.getElementById("feedbackPanel");
  const feedbackHeader = document.getElementById("feedbackHeader");
  feedbackHeader.className = "feedback-header " + (isCorrect ? "is-correct" : "is-wrong");
  feedbackHeader.textContent = isCorrect
    ? "✓ 答對了！判斷正確（+100 分）"
    : "✗ 答錯了！請參考下方標準答案與解析（-1 顆愛心）";

  document.getElementById("userAnswerDisplay").textContent = `(${chosen})`;
  const stdAnsText = accepted.length > 1
    ? `${q.rawAnswer}（單選可接受答案：${accepted.join(" 或 ")}）`
    : `${q.rawAnswer}`;
  document.getElementById("correctAnswerDisplay").textContent = stdAnsText;

  const suppBlock = document.getElementById("SupplementBlock");
  if (q.supplement && q.supplement !== "-") {
    suppBlock.textContent = `📌 教材補充／出處：${q.supplement}`;
    suppBlock.classList.remove("hidden");
  } else {
    suppBlock.classList.add("hidden");
  }

  document.getElementById("explanationText").textContent = q.explanation || "尚無解析";
  document.getElementById("sourceInfoText").textContent = `資料來源：${q.source}`;
  feedbackPanel.classList.remove("hidden");

  updateHud();

  // 設定「下一題 / 領取寶箱 / 查看結算」按鈕文字與狀態
  const btnNext = document.getElementById("btnNextQuestion");
  const isLastQuestion = appState.currentIndex >= appState.roundPool.length - 1;

  if (appState.hearts <= 0) {
    btnNext.textContent = "💔 愛心已歸零 — 查看回合結算";
  } else if (appState.pendingChestForCurrent && !appState.chestClaimedForCurrent) {
    btnNext.textContent = "🎁 開啟第 5 題獎勵寶箱";
  } else if (isLastQuestion) {
    btnNext.textContent = "🏁 完成最後一題 — 查看結算";
  } else {
    btnNext.textContent = "➡️ 下一題";
  }
  btnNext.classList.remove("hidden");
}

// 處理點擊「下一題 / 開啟寶箱 / 結算」
function handleNextStep() {
  if (!appState.inRound || !appState.submittedCurrent) return;

  // 優先順序 1：若愛心已歸零，直接進入 Game Over 結算（不可進入下一題或領取寶箱）
  if (appState.hearts <= 0) {
    finishRound(false);
    return;
  }

  // 優先順序 2：若本題符合第 5k 題寶箱資格且尚未領取，先彈出寶箱
  if (appState.pendingChestForCurrent && !appState.chestClaimedForCurrent) {
    openChestModal();
    return;
  }

  // 優先順序 3：若已是最後一題，進入過關結算（不會多跳新題）
  const isLastQuestion = appState.currentIndex >= appState.roundPool.length - 1;
  if (isLastQuestion) {
    finishRound(true);
    return;
  }

  // 否則進入下一題
  appState.currentIndex += 1;
  renderCurrentQuestion();
  updateHud();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 寶箱彈窗邏輯
function openChestModal() {
  const modal = document.getElementById("chestModal");
  const rewardBox = document.getElementById("chestRewardResult");
  const btnOpen = document.getElementById("btnOpenChest");
  const btnClose = document.getElementById("btnCloseChestModal");

  rewardBox.classList.add("hidden");
  rewardBox.textContent = "";
  btnOpen.disabled = false;
  btnOpen.classList.remove("hidden");
  btnClose.classList.add("hidden");

  modal.classList.remove("hidden");
  btnOpen.focus();
}

function claimChestReward() {
  // 單一寶箱只能領取一次
  if (!appState.pendingChestForCurrent || appState.chestClaimedForCurrent) return;
  appState.chestClaimedForCurrent = true;
  appState.pendingChestForCurrent = false;

  const btnOpen = document.getElementById("btnOpenChest");
  btnOpen.disabled = true;
  btnOpen.classList.add("hidden");

  // 依機率表決定回復量：25% +3, 35% +2, 30% +1, 10% 補滿
  const roll = Math.random();
  let chosenReward = GAME_CONFIG.chestRewards[GAME_CONFIG.chestRewards.length - 1];
  for (const item of GAME_CONFIG.chestRewards) {
    if (roll < item.threshold) {
      chosenReward = item;
      break;
    }
  }

  const beforeHearts = appState.hearts;
  if (chosenReward.heal === "FULL") {
    appState.hearts = GAME_CONFIG.maxHearts;
  } else {
    appState.hearts = Math.min(GAME_CONFIG.maxHearts, appState.hearts + chosenReward.heal);
  }
  const actualHealed = appState.hearts - beforeHearts;

  const rewardBox = document.getElementById("chestRewardResult");
  rewardBox.textContent = `${chosenReward.label}（愛心 ${beforeHearts} → ${appState.hearts}，實際回復 +${actualHealed} 顆）`;
  rewardBox.classList.remove("hidden");

  updateHud();

  const isLastQuestion = appState.currentIndex >= appState.roundPool.length - 1;
  const btnClose = document.getElementById("btnCloseChestModal");
  btnClose.textContent = isLastQuestion ? "🏁 完成領取並查看結算" : "➡️ 繼續下一題";
  btnClose.classList.remove("hidden");
  btnClose.focus();

  // 同步更新底下按鈕文字
  const btnNext = document.getElementById("btnNextQuestion");
  btnNext.textContent = isLastQuestion ? "🏁 完成最後一題 — 查看結算" : "➡️ 下一題";
}

function closeChestModal(silent = false) {
  document.getElementById("chestModal").classList.add("hidden");
  if (silent) return;

  const isLastQuestion = appState.currentIndex >= appState.roundPool.length - 1;
  if (isLastQuestion) {
    finishRound(true);
  } else {
    appState.currentIndex += 1;
    renderCurrentQuestion();
    updateHud();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// 結算畫面
function finishRound(isVictory) {
  clearAllTimers();
  appState.inRound = false;

  const totalQuestions = appState.roundPool.length;
  const unanswered = Math.max(0, totalQuestions - appState.answeredCount);

  document.getElementById("resultBadgeIcon").textContent = isVictory ? "🏆" : "💔";
  document.getElementById("resultTitle").textContent = isVictory
    ? "恭喜過關！成功完成救護知識探險"
    : "遊戲結束（Game Over）— 生命值已歸零";
  document.getElementById("resultSubtitle").textContent = isVictory
    ? `您已完成本回合全部 ${totalQuestions} 題挑戰，表現優異！`
    : `本回合於第 ${appState.answeredCount} 題耗盡愛心，別氣餒，可前往「錯題複習本」加強練習！`;

  document.getElementById("resScore").textContent = String(appState.score);
  document.getElementById("resAccuracy").textContent = appState.answeredCount === 0
    ? "尚無結果"
    : `${Math.round((appState.correctCount / appState.answeredCount) * 100)}%`;
  document.getElementById("resHearts").textContent = `${appState.hearts} / ${GAME_CONFIG.maxHearts}`;
  document.getElementById("resAnswered").textContent = `${appState.answeredCount} 題`;
  document.getElementById("resCorrect").textContent = `${appState.correctCount} 題`;
  document.getElementById("resWrong").textContent = `${appState.wrongCount} 題`;
  document.getElementById("resUnanswered").textContent = `${unanswered} 題`;

  showScreen("screenResult");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 渲染錯題複習本
function renderWrongBook() {
  const listEl = document.getElementById("wrongBookList");
  const missingNotice = document.getElementById("wrongBookMissingNotice");
  const btnPractice = document.getElementById("btnStartWrongPractice");
  const btnClear = document.getElementById("btnClearWrongBook");

  listEl.innerHTML = "";
  const wrongMap = loadWrongBookMap();
  const ids = Object.keys(wrongMap);

  const validWrongQuestions = [];
  const missingIds = [];

  for (const id of ids) {
    const q = appState.questionById.get(id);
    if (q && q.reviewStatus === "valid") {
      validWrongQuestions.push({ question: q, record: wrongMap[id] });
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    missingNotice.textContent = `ℹ️ 提示：有 ${missingIds.length} 筆舊錯題紀錄（ID: ${missingIds.join(", ")}）於目前有效題庫中已無對應題目，系統已自動略過。`;
    missingNotice.classList.remove("hidden");
  } else {
    missingNotice.classList.add("hidden");
  }

  btnPractice.disabled = validWrongQuestions.length === 0;
  btnClear.disabled = ids.length === 0;

  if (validWrongQuestions.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "record-item";
    emptyDiv.textContent = "🎉 目前沒有任何錯題紀錄！去闖關練習題目吧。";
    listEl.appendChild(emptyDiv);
    return;
  }

  // 依累計錯誤次數排序（由高至低）
  validWrongQuestions.sort((a, b) => (b.record.wrongCount || 0) - (a.record.wrongCount || 0));

  for (const { question: q, record } of validWrongQuestions) {
    const card = document.createElement("div");
    card.className = "record-item";

    const top = document.createElement("div");
    top.className = "record-top";

    const tagsDiv = document.createElement("div");
    tagsDiv.innerHTML = `<span class="meta-tag tag-year">${q.year}</span> <span class="meta-tag tag-chapter">${q.chapterName}</span> <span class="meta-tag tag-num">原題號 ${q.number}</span> <span class="meta-tag tag-id">${q.id}</span>`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-small";
    removeBtn.textContent = "✓ 已學會（移出錯題本）";
    removeBtn.addEventListener("click", () => {
      removeWrongQuestionRecord(q.id);
      renderWrongBook();
    });

    top.appendChild(tagsDiv);
    top.appendChild(removeBtn);

    const stemDiv = document.createElement("div");
    stemDiv.className = "record-stem";
    stemDiv.textContent = q.stem;

    const optsUl = document.createElement("ul");
    optsUl.className = "record-opts";
    for (const opt of q.options) {
      const li = document.createElement("li");
      li.textContent = `(${opt.id}) ${opt.text}`;
      optsUl.appendChild(li);
    }

    const foot = document.createElement("div");
    foot.className = "record-meta-foot";
    foot.textContent = `❗ 累計答錯：${record.wrongCount} 次 ｜ 上次誤選：(${record.lastAnswer}) ｜ 標準答案：${q.rawAnswer} ｜ 解析：${q.explanation || "尚無解析"}`;

    card.appendChild(top);
    card.appendChild(stemDiv);
    card.appendChild(optsUl);
    card.appendChild(foot);
    listEl.appendChild(card);
  }
}

// 渲染待確認題目清單
function renderReviewQuestionsList() {
  const listEl = document.getElementById("reviewQuestionsList");
  if (!listEl) return;
  listEl.innerHTML = "";

  const reviewQs = appState.allQuestions.filter(q => q.reviewStatus !== "valid");
  if (reviewQs.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "record-item";
    emptyDiv.textContent = "目前沒有待確認題目。";
    listEl.appendChild(emptyDiv);
    return;
  }

  for (const q of reviewQs) {
    const card = document.createElement("div");
    card.className = "record-item";

    const top = document.createElement("div");
    top.className = "record-top";
    top.innerHTML = `<div><span class="meta-tag tag-year">${q.year}</span> <span class="meta-tag tag-chapter">${q.chapterName}</span> <span class="meta-tag tag-num">原題號 ${q.number}</span> <span class="meta-tag tag-id">${q.id}</span></div><span class="verify-badge">⚠️ ${q.reviewReason || "待確認"}</span>`;

    const stemDiv = document.createElement("div");
    stemDiv.className = "record-stem";
    stemDiv.textContent = q.stem;

    const foot = document.createElement("div");
    foot.className = "record-meta-foot";
    foot.textContent = `原始答案：${q.rawAnswer} ｜ 來源：${q.source} ｜ 來源解析：${q.explanation || "尚無解析"}`;

    card.appendChild(top);
    card.appendChild(stemDiv);
    card.appendChild(foot);
    listEl.appendChild(card);
  }
}

// 綁定所有介面事件
function bindEvents() {
  // 頂部導覽切換（若在回合中切換離開，先提示確認）
  document.getElementById("btnNavHome").addEventListener("click", () => {
    if (appState.inRound) {
      showConfirmModal(
        "返回首頁確認",
        "您目前正在進行闖關回合，返回首頁調整設定將會結束並重設目前回合，是否確定？",
        () => {
          clearAllTimers();
          appState.inRound = false;
          showScreen("screenSetup");
        }
      );
    } else {
      showScreen("screenSetup");
    }
  });

  document.getElementById("btnNavWrongBook").addEventListener("click", () => {
    const goWrongBook = () => {
      clearAllTimers();
      appState.inRound = false;
      renderWrongBook();
      showScreen("screenWrongBook");
    };
    if (appState.inRound) {
      showConfirmModal("前往錯題複習本", "前往錯題本將會結束目前進行中的闖關回合，是否確定？", goWrongBook);
    } else {
      goWrongBook();
    }
  });

  document.getElementById("btnNavReviewList").addEventListener("click", () => {
    const goReview = () => {
      clearAllTimers();
      appState.inRound = false;
      renderReviewQuestionsList();
      showScreen("screenReviewList");
    };
    if (appState.inRound) {
      showConfirmModal("檢視待確認題目清單", "離開作答畫面將會結束目前進行中的闖關回合，是否確定？", goReview);
    } else {
      goReview();
    }
  });

  // 減少動畫特效切換
  const chkReduceMotion = document.getElementById("chkReduceMotion");
  try {
    const savedMotion = window.localStorage.getItem(GAME_CONFIG.storageKeyMotion);
    if (savedMotion === "1") {
      chkReduceMotion.checked = true;
      document.body.classList.add("reduce-motion");
    }
  } catch (_) {}

  chkReduceMotion.addEventListener("change", () => {
    document.body.classList.toggle("reduce-motion", chkReduceMotion.checked);
    try {
      window.localStorage.setItem(GAME_CONFIG.storageKeyMotion, chkReduceMotion.checked ? "1" : "0");
    } catch (_) {}
  });

  // 載入失敗重試按鈕
  document.getElementById("btnRetryLoad").addEventListener("click", () => {
    loadQuestionBank();
  });

  // 年度與章節全選／清除
  document.getElementById("btnSelectAllYears").addEventListener("click", () => {
    const years = (appState.meta && appState.meta.years) || [];
    appState.selectedYears = new Set(years);
    syncCheckboxElements();
    updateFilterStats();
  });

  document.getElementById("btnClearAllYears").addEventListener("click", () => {
    appState.selectedYears.clear();
    syncCheckboxElements();
    updateFilterStats();
  });

  document.getElementById("btnSelectAllChapters").addEventListener("click", () => {
    const chapters = (appState.meta && appState.meta.chapters) || [];
    appState.selectedChapters = new Set(chapters.map(c => c.id));
    syncCheckboxElements();
    updateFilterStats();
  });

  document.getElementById("btnClearAllChapters").addEventListener("click", () => {
    appState.selectedChapters.clear();
    syncCheckboxElements();
    updateFilterStats();
  });

  // 開始測驗
  document.getElementById("btnStartQuiz").addEventListener("click", () => {
    startQuizRound(null, false);
  });

  // 作答中重開／返回設定
  document.getElementById("btnRestartQuiz").addEventListener("click", () => {
    showConfirmModal(
      "重新開始／更改條件確認",
      "確定要結束本回合並返回篩選設定嗎？按「取消」可保留目前作答進度。",
      () => {
        clearAllTimers();
        appState.inRound = false;
        showScreen("screenSetup");
      }
    );
  });

  // 確認答案與下一題
  document.getElementById("btnSubmitAnswer").addEventListener("click", submitCurrentAnswer);
  document.getElementById("btnNextQuestion").addEventListener("click", handleNextStep);

  // 寶箱按鈕
  document.getElementById("btnOpenChest").addEventListener("click", claimChestReward);
  document.getElementById("btnCloseChestModal").addEventListener("click", () => closeChestModal(false));

  // 確認彈窗按鈕
  document.getElementById("btnConfirmCancel").addEventListener("click", closeConfirmModal);
  document.getElementById("btnConfirmOk").addEventListener("click", () => {
    const cb = appState.confirmCallback;
    closeConfirmModal();
    if (typeof cb === "function") cb();
  });

  // 結算畫面按鈕
  document.getElementById("btnPlayAgainSame").addEventListener("click", () => {
    if (appState.isWrongBookMode) {
      startWrongBookPractice();
    } else {
      startQuizRound(null, false);
    }
  });

  document.getElementById("btnBackToSetup").addEventListener("click", () => {
    showScreen("screenSetup");
  });

  document.getElementById("btnResultToWrongBook").addEventListener("click", () => {
    renderWrongBook();
    showScreen("screenWrongBook");
  });

  // 錯題本按鈕
  document.getElementById("btnStartWrongPractice").addEventListener("click", startWrongBookPractice);
  document.getElementById("btnClearWrongBook").addEventListener("click", () => {
    showConfirmModal(
      "清除全部錯題紀錄",
      "確定要清空所有已儲存的錯題複習紀錄嗎？此操作無法復原。",
      () => {
        clearAllWrongQuestionRecords();
        renderWrongBook();
      }
    );
  });

  // 全域鍵盤操作支援 (1-4 / A-D 選選項，Enter 提交或下一題)
  window.addEventListener("keydown", (e) => {
    // 若彈窗開啟中，不觸發底層作答快捷鍵
    if (!document.getElementById("chestModal").classList.contains("hidden")) return;
    if (!document.getElementById("confirmModal").classList.contains("hidden")) return;
    if (!appState.inRound) return;

    const key = e.key.toUpperCase();
    const keyMap = { "1": "A", "2": "B", "3": "C", "4": "D", "A": "A", "B": "B", "C": "C", "D": "D" };
    if (keyMap[key] && !appState.submittedCurrent) {
      e.preventDefault();
      selectOption(keyMap[key]);
    } else if (e.key === "Enter") {
      // 避免焦點已經在按鈕上時重複觸發 click + keydown
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
      e.preventDefault();
      if (!appState.submittedCurrent && appState.selectedOptionId) {
        submitCurrentAnswer();
      } else if (appState.submittedCurrent) {
        handleNextStep();
      }
    }
  });
}

function startWrongBookPractice() {
  const wrongMap = loadWrongBookMap();
  const pool = [];
  for (const id of Object.keys(wrongMap)) {
    const q = appState.questionById.get(id);
    if (q && q.reviewStatus === "valid") {
      pool.push(q);
    }
  }
  if (pool.length === 0) return;
  startQuizRound(pool, true);
}

// 啟動應用程式
window.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadQuestionBank();
});
