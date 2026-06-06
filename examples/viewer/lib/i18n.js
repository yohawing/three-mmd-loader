const STORAGE_KEY = "three-mmd-loader.viewer.lang";
const SUPPORTED = ["en", "ja", "zh"];

const dictionaries = {
  en: {
    "aria.menu": "Menu",
    "aria.about": "About",
    "aria.language": "Language",
    "aria.volume": "Volume",
    "aria.mute": "Mute",
    "aria.audioOffsetFrame": "Audio offset frame",
    "aria.deletePreset": "Delete preset",
    "aria.closeCredits": "Close credits",
    "menu.preset": "Preset",
    "menu.fixture": "Fixture",
    "menu.current": "Current",
    "menu.loadedAssets": "Loaded assets",
    "menu.model": "Model",
    "menu.motion": "Motion",
    "menu.audio": "Audio",
    "menu.background": "Background",
    "menu.camera": "Camera",
    "menu.viewport": "Viewport",
    "viewport.grid": "Grid",
    "viewport.axes": "Axis",
    "audio.offsetFrame": "Audio Offset",
    "action.save": "Save",
    "action.load": "Load",
    "action.loadFromFile": "Load From File...",
    "action.loadFromFolder": "Load From Folder...",
    "action.pose": "Pose...",
    "empty.title": "Drop a model to get started",
    "empty.sub": "Drag & drop a PMX/PMD file or folder here, or use the menu to load.",
    "drop.title": "Drop model folders, PMX / PMD, VMD, VPD, or audio files",
    "drop.sub": "Model textures are resolved when a folder is selected.",
    "about.desc": "A browser-based viewer for MikuMikuDance (MMD) models and motions, built on three-mmd-loader.",
    "about.local": "All files stay in your browser — nothing is uploaded to any server.",
    "about.copyright": "This site hosts no models or motions. You are responsible for following the usage terms and copyright of every file you load.",
    "credit.title": "Credits"
  },
  ja: {
    "aria.menu": "メニュー",
    "aria.about": "このビューアについて",
    "aria.language": "言語",
    "aria.volume": "音量",
    "aria.mute": "ミュート",
    "aria.audioOffsetFrame": "音声オフセットフレーム",
    "aria.deletePreset": "プリセットを削除",
    "aria.closeCredits": "クレジットを閉じる",
    "menu.preset": "プリセット",
    "menu.fixture": "フィクスチャ",
    "menu.current": "現在",
    "menu.loadedAssets": "読み込み済み素材",
    "menu.model": "モデル",
    "menu.motion": "モーション",
    "menu.audio": "オーディオ",
    "menu.background": "背景",
    "menu.camera": "カメラ",
    "menu.viewport": "ビューポート",
    "viewport.grid": "グリッド",
    "viewport.axes": "軸",
    "audio.offsetFrame": "音声オフセット",
    "action.save": "保存",
    "action.load": "読み込み",
    "action.loadFromFile": "ファイルから読み込み...",
    "action.loadFromFolder": "フォルダから読み込み...",
    "action.pose": "ポーズ...",
    "empty.title": "モデルをドロップして開始",
    "empty.sub": "PMX/PMD ファイルやフォルダをここにドロップ、またはメニューから読み込みます。",
    "drop.title": "モデルフォルダ、PMX / PMD、VMD、VPD、音声ファイルをドロップ",
    "drop.sub": "フォルダを選ぶとモデルのテクスチャも解決されます。",
    "about.desc": "three-mmd-loader を使った、ブラウザで動く MikuMikuDance (MMD) モデル・モーションビューアです。",
    "about.local": "ファイルはすべてブラウザ内で処理され、サーバーには一切アップロードされません。",
    "about.copyright": "本サイトはモデルやモーションを配布していません。読み込む各ファイルの利用規約・著作権の遵守は利用者の責任です。",
    "credit.title": "クレジット"
  },
  zh: {
    "aria.menu": "菜单",
    "aria.about": "关于",
    "aria.language": "语言",
    "aria.volume": "音量",
    "aria.mute": "静音",
    "aria.audioOffsetFrame": "音频偏移帧",
    "aria.deletePreset": "删除预设",
    "aria.closeCredits": "关闭署名信息",
    "menu.preset": "预设",
    "menu.fixture": "测试素材",
    "menu.current": "当前",
    "menu.loadedAssets": "已加载素材",
    "menu.model": "模型",
    "menu.motion": "动作",
    "menu.audio": "音频",
    "menu.background": "背景",
    "menu.camera": "镜头",
    "menu.viewport": "视口",
    "viewport.grid": "网格",
    "viewport.axes": "坐标轴",
    "audio.offsetFrame": "音频偏移",
    "action.save": "保存",
    "action.load": "加载",
    "action.loadFromFile": "从文件加载...",
    "action.loadFromFolder": "从文件夹加载...",
    "action.pose": "姿势...",
    "empty.title": "拖入模型即可开始",
    "empty.sub": "将 PMX/PMD 文件或文件夹拖到此处，或使用菜单加载。",
    "drop.title": "拖入模型文件夹、PMX / PMD、VMD、VPD 或音频文件",
    "drop.sub": "选择文件夹后会自动解析模型贴图。",
    "about.desc": "基于 three-mmd-loader 的浏览器端 MikuMikuDance (MMD) 模型与动作查看器。",
    "about.local": "所有文件均在浏览器内处理，不会上传到任何服务器。",
    "about.copyright": "本站不提供任何模型或动作文件。您需自行遵守所加载文件的使用条款与版权规定。",
    "credit.title": "署名信息"
  }
};

let currentLocale = "en";

export function resolveInitialLocale() {
  let stored;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = undefined;
  }
  if (stored && SUPPORTED.includes(stored)) {
    return stored;
  }
  const navigatorLanguage = (window.navigator.language ?? "en").toLowerCase();
  if (navigatorLanguage.startsWith("ja")) {
    return "ja";
  }
  if (navigatorLanguage.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = SUPPORTED.includes(locale) ? locale : "en";
  try {
    window.localStorage.setItem(STORAGE_KEY, currentLocale);
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
  document.documentElement.lang = currentLocale;
  applyTranslations();
}

export function t(key) {
  return dictionaries[currentLocale]?.[key] ?? dictionaries.en[key] ?? key;
}

export function applyTranslations(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.getAttribute("data-i18n"));
  }
  for (const element of root.querySelectorAll("[data-i18n-aria]")) {
    element.setAttribute("aria-label", t(element.getAttribute("data-i18n-aria")));
  }
}
