/* Runtime i18n: flat dictionary + data-i18n DOM pass, no build step.
 *
 * The API surface (t / apply / setLang / cycleLang / nextLangLabel / onChange)
 * deliberately mirrors navidrome-stage's js/i18n.js so the engine half can be
 * merged into webos-tv-kit later; only the DICT is photofield-specific.
 *
 * The language follows the TV's own language (navigator.language) and can be
 * overridden from settings; the override is remembered in localStorage.
 */
(function () {
  const STORAGE_KEY = "photofield.lang";
  const FALLBACK = "en";
  const LANGS = ["en", "zh-CN"];

  const DICT = {
    en: {
      "lang.self": "English",
      "html.lang": "en",

      "key.red": "RED",
      "key.green": "GREEN",
      "key.blue": "BLUE",
      "key.back": "BACK",

      "sources.sub": "Choose a source",
      "sources.empty": "No servers found",
      "sources.emptyHint": "Press BLUE to check the address and rescan",
      "sources.play": "Play",
      "sources.reading": "Loading…",
      "sources.connectFailed": "Connection failed",
      "sources.countPhotos": "{n} photos",
      "sources.scanProgress": "{phase} {n}…",
      "sources.scanFailed": "Scan failed",
      "sources.scanning": "Scanning",
      "sources.busyWait": "Scan in progress, please wait",
      "sources.busyScanning": "Already scanning…",

      "scanPhase.INDEX_FILES": "Indexing files",
      "scanPhase.INDEX_METADATA": "Reading photo info",
      "scanPhase.INDEX_CONTENTS": "Building thumbnails",
      "scanPhase.INDEX_FACES": "Detecting faces",

      "scan.starting": "Scanning {name}…",
      "scan.done": "{name} scan complete",
      "scan.failed": "Scan failed: {msg}",

      "collections.sub": "Choose an album",
      "collections.coverFailed": "Server error, cover failed to load",
      "collections.indexing": "{name} is still indexing, try again later",

      "hint.browse": "Browse",
      "hint.playSource": "Play source",
      "hint.scanSource": "Scan source",
      "hint.settings": "Settings",
      "hint.playAlbum": "Play album",
      "hint.backSources": "Sources",
      "hint.view": "View",
      "hint.playFromHere": "Play from here",
      "hint.backAlbums": "Albums",
      "hint.switch": "Switch",
      "hint.close": "Close",

      "viewer.videoPoster": "Video cannot play, showing poster",

      "kiosk.loading": "Loading…",
      "kiosk.hint": "Colour keys pick a Lofi list · ↑↓ change track · random colour when done · same key again turns it off",
      "kiosk.paused": "Paused",
      "kiosk.musicFailed": "Music playback failed",
      "kiosk.musicOff": "{name} · off",
      "kiosk.stopped": "Playback stopped",
      "kiosk.serverRetry": "Server error, retrying…",
      "kiosk.playFailed": "Playback failed: {msg}",

      "player.serverErrors": "Repeated server errors, playback stopped",
      "player.noPhotos": "No playable photos",

      "app.cannotConnect": "Cannot reach {name}",
      "app.loadFailed": "Failed to load",
      "app.loadFailedMsg": "Failed to load: {msg}",

      "pin.title": "Enter PIN",
      "pin.hint": "D-pad moves · OK enters · RED deletes · BACK cancels",
      "pin.confirmAgain": "Enter again to confirm",
      "pin.set": "PIN set",
      "pin.mismatch": "Entries differ, start over",
      "pin.wrong": "Wrong PIN",
      "pin.createFor": "Set a 4-digit PIN for “{name}”",
      "pin.enterFor": "Enter PIN for “{name}”",
      "pin.change": "Change PIN: enter a new PIN",
      "pin.create": "Set a 4-digit PIN",

      "ipinput.title": "Server address",
      "ipinput.hint": "OK enters a digit · GREEN next segment · RED deletes · BACK cancels",

      "settings.title": "Settings",
      "settings.hintDefault": "←→ adjust · OK select · BACK closes",
      "settings.hintSuffix": " · ←→ adjust · BACK closes",
      "settings.group.playback": "Playback",
      "settings.group.album": "Albums",
      "settings.group.music": "Music",
      "settings.group.server": "Server",
      "settings.group.general": "General",
      "settings.duration": "Slide interval",
      "settings.duration.hint": "How long each photo stays on screen",
      "settings.seconds": "{n} s",
      "settings.playOrder": "Play order",
      "settings.playOrder.hint": "Shuffle or follow the album order",
      "settings.fitMode": "Photo fit",
      "settings.fitMode.hint": "Ambient fill blurs an enlarged backdrop and keeps the photo centred",
      "settings.startup": "Startup",
      "settings.startup.hint": "Resume the last played source right after boot",
      "settings.infoDisplay": "Info display",
      "settings.infoDisplay.hint": "What shows during playback; press a direction key to reveal everything briefly",
      "settings.albumSort": "Sort order",
      "settings.albumSort.hint": "Order of the album list and whole-source sequential playback",
      "settings.mediaScope": "Contents",
      "settings.mediaScope.hint": "Photos only skips videos when browsing and in the slideshow",
      "settings.autoLofi": "Auto-play Lofi",
      "settings.autoLofi.hint": "Start a random Lofi list when entering the slideshow",
      "settings.host": "Address",
      "settings.host.hint": "Change the address of the device running Photofield",
      "settings.rescan": "Rescan",
      "settings.rescan.hint": "Look again for Photofield instances at this address",
      "settings.language": "Language",
      "settings.language.hint": "Interface language",
      "settings.scanning": "Scanning…",
      "settings.scanDone": "Scan complete",
      "settings.hostUpdated": "Address updated, rescan to apply",

      "startup.sources": "Source list",
      "startup.kiosk": "Resume last source",
      "fit.ambient": "Ambient fill",
      "fit.contain": "Fit whole photo",
      "fit.cover": "Crop to fill",
      "order.shuffle": "Shuffle",
      "order.sequential": "Sequential",
      "common.on": "On",
      "common.off": "Off",
      "info.all": "Show all",
      "info.details": "Details only",
      "info.clock": "Clock only",
      "info.hidden": "Hide all",
      "sort.nameAsc": "Name A→Z",
      "sort.nameDesc": "Name Z→A",
      "scope.photos": "Photos only",
      "scope.all": "Photos and videos"
    },

    "zh-CN": {
      "lang.self": "中文",
      "html.lang": "zh-CN",

      "key.red": "红键",
      "key.green": "绿键",
      "key.blue": "蓝键",
      "key.back": "返回",

      "sources.sub": "选择源",
      "sources.empty": "未找到服务器",
      "sources.emptyHint": "按蓝键检查地址并重扫",
      "sources.play": "播放",
      "sources.reading": "正在读取…",
      "sources.connectFailed": "连接失败",
      "sources.countPhotos": "{n} 张",
      "sources.scanProgress": "{phase} {n} 张…",
      "sources.scanFailed": "扫描失败",
      "sources.scanning": "扫描中",
      "sources.busyWait": "扫描中，请稍候",
      "sources.busyScanning": "正在扫描中…",

      "scanPhase.INDEX_FILES": "扫描文件",
      "scanPhase.INDEX_METADATA": "读取照片信息",
      "scanPhase.INDEX_CONTENTS": "生成缩略图",
      "scanPhase.INDEX_FACES": "识别人脸",

      "scan.starting": "正在扫描 {name}…",
      "scan.done": "{name} 扫描完成",
      "scan.failed": "扫描失败：{msg}",

      "collections.sub": "选择相册",
      "collections.coverFailed": "服务器错误，封面加载失败",
      "collections.indexing": "{name} 还在索引中，稍后再试",

      "hint.browse": "浏览",
      "hint.playSource": "播放整源",
      "hint.scanSource": "扫描此源",
      "hint.settings": "设置",
      "hint.playAlbum": "播放此相册",
      "hint.backSources": "源选择",
      "hint.view": "查看",
      "hint.playFromHere": "从此播放",
      "hint.backAlbums": "相册列表",
      "hint.switch": "切换",
      "hint.close": "关闭",

      "viewer.videoPoster": "视频无法播放，显示海报",

      "kiosk.loading": "加载中…",
      "kiosk.hint": "彩色键选 Lofi 列表 · 上下键切歌 · 播完随机换色 · 再按同色键关闭",
      "kiosk.paused": "已暂停",
      "kiosk.musicFailed": "音乐播放失败",
      "kiosk.musicOff": "{name} · 已关闭",
      "kiosk.stopped": "已停止播放",
      "kiosk.serverRetry": "服务器错误，正在重试…",
      "kiosk.playFailed": "播放失败：{msg}",

      "player.serverErrors": "服务器连续错误，已停止播放",
      "player.noPhotos": "没有可播放的照片",

      "app.cannotConnect": "无法连接 {name}",
      "app.loadFailed": "加载失败",
      "app.loadFailedMsg": "加载失败：{msg}",

      "pin.title": "输入 PIN",
      "pin.hint": "方向键移动 · OK 输入 · 红键删除 · 返回取消",
      "pin.confirmAgain": "再次输入以确认",
      "pin.set": "PIN 已设置",
      "pin.mismatch": "两次输入不一致，重新设置",
      "pin.wrong": "PIN 错误",
      "pin.createFor": "为「{name}」设置 4 位 PIN",
      "pin.enterFor": "输入 PIN 进入「{name}」",
      "pin.change": "修改 PIN：输入新 PIN",
      "pin.create": "设置 4 位 PIN",

      "ipinput.title": "服务器地址",
      "ipinput.hint": "OK 输入数字 · 绿键下一段 · 红键删除 · 返回取消",

      "settings.title": "设置",
      "settings.hintDefault": "←→ 调整 · OK 选择 · 返回关闭",
      "settings.hintSuffix": " · ←→ 调整 · 返回关闭",
      "settings.group.playback": "播放",
      "settings.group.album": "相册",
      "settings.group.music": "音乐",
      "settings.group.server": "服务器",
      "settings.group.general": "通用",
      "settings.duration": "播放间隔",
      "settings.duration.hint": "每张照片在屏幕上停留的时间",
      "settings.seconds": "{n} 秒",
      "settings.playOrder": "播放顺序",
      "settings.playOrder.hint": "随机播放或按相册中的顺序播放",
      "settings.fitMode": "相片填充",
      "settings.fitMode.hint": "氛围填充会模糊放大背景，保留照片完整居中",
      "settings.startup": "启动行为",
      "settings.startup.hint": "开机后直接恢复上次播放的源",
      "settings.infoDisplay": "信息显示",
      "settings.infoDisplay.hint": "播放时默认显示的信息；按方向键可临时唤出完整信息",
      "settings.albumSort": "相册排序",
      "settings.albumSort.hint": "相册列表与整源顺序播放的排列顺序",
      "settings.mediaScope": "相册内容",
      "settings.mediaScope.hint": "仅图片时，相册内翻页与幻灯片播放会跳过视频",
      "settings.autoLofi": "自动播放 Lofi",
      "settings.autoLofi.hint": "进入幻灯片时随机开始一组 Lofi 音乐",
      "settings.host": "地址",
      "settings.host.hint": "修改 Photofield 服务所在设备的地址",
      "settings.rescan": "重新扫描",
      "settings.rescan.hint": "重新查找此地址上可用的 Photofield 实例",
      "settings.language": "语言",
      "settings.language.hint": "界面语言",
      "settings.scanning": "扫描中…",
      "settings.scanDone": "扫描完成",
      "settings.hostUpdated": "地址已更新，重新扫描生效",

      "startup.sources": "源选择页",
      "startup.kiosk": "续播上次源",
      "fit.ambient": "氛围填充",
      "fit.contain": "完整显示",
      "fit.cover": "裁切填满",
      "order.shuffle": "随机播放",
      "order.sequential": "顺序播放",
      "common.on": "开启",
      "common.off": "关闭",
      "info.all": "全部显示",
      "info.details": "仅详情",
      "info.clock": "仅时钟",
      "info.hidden": "全部隐藏",
      "sort.nameAsc": "按文件名升序",
      "sort.nameDesc": "按文件名降序",
      "scope.photos": "仅图片",
      "scope.all": "图片和视频"
    }
  };

  function detect() {
    let stored;
    try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    if (stored && DICT[stored]) return stored;
    const nav = String((navigator && navigator.language) || "");
    return nav.toLowerCase().indexOf("zh") === 0 ? "zh-CN" : FALLBACK;
  }

  let lang = detect();
  const listeners = [];

  // Look up a key, falling back to English and then to the key itself so a
  // missing string shows up as `settings.host` rather than as blank UI.
  function t(key, vars) {
    const table = DICT[lang] || DICT[FALLBACK];
    let value = table[key];
    if (value == null) value = DICT[FALLBACK][key];
    if (value == null) return key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (whole, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
    );
  }

  // Write every marked node. No-op outside a DOM (unit tests under Node).
  function apply(root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope) return;
    scope.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    if (document.documentElement) {
      document.documentElement.setAttribute("lang", t("html.lang"));
    }
  }

  function setLang(next) {
    if (!DICT[next] || next === lang) return;
    lang = next;
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  function cycleLang() {
    setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
  }

  // Label for the toggle: always shows the language you would switch TO.
  function nextLangLabel() {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    return DICT[next]["lang.self"];
  }

  window.I18N = {
    t,
    apply,
    setLang,
    cycleLang,
    nextLangLabel,
    onChange(fn) { listeners.push(fn); },
    get lang() { return lang; },
    LANGS,
  };
})();
