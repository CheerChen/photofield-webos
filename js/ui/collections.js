/* Collection picker as album-cover cards (not a text list).
 *
 * Covers come from photoAt(collection, 0) — the first photo in layout order.
 * That call creates the collection's scene server-side on first use, which
 * costs the pi some CPU, so covers load sequentially with spacing; the
 * created scene is cached by the client and makes a later grid open free. */
(function () {
  const $ = (id) => document.getElementById(id);
  const COLS = 4;
  let source = null;
  let client = null;
  let collections = [];
  let focusIdx = 0;
  // Invalidates in-flight cover loads when leaving.
  const coverGen = window.Generation.create();

  function render() {
    const grid = $("collection-list");
    grid.innerHTML = "";
    grid.className = "collection-grid";
    collections.forEach((c) => {
      const card = document.createElement("div");
      card.className = "collection-card";
      const cover = document.createElement("div");
      cover.className = "collection-cover";
      cover.dataset.cover = c.id;
      cover.innerHTML = window.Icons.photo; // SVG placeholder glyph
      const caption = document.createElement("div");
      caption.className = "collection-caption";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = c.name;
      const countEl = document.createElement("span");
      countEl.className = "count";
      countEl.textContent = c.count.toLocaleString();
      caption.appendChild(name);
      caption.appendChild(countEl);
      card.appendChild(cover);
      card.appendChild(caption);
      grid.appendChild(card);
    });
    applyFocus();
  }

  /* Focus-only update — never rebuilds the DOM, so loaded covers survive. */
  function applyFocus() {
    const grid = $("collection-list");
    for (let i = 0; i < grid.children.length; i++) {
      grid.children[i].classList.toggle("focused", i === focusIdx);
    }
    const focused = grid.children[focusIdx];
    if (focused) focused.scrollIntoView({ block: "nearest" });
  }

  /* Sequential, pi-friendly cover loader. */
  async function loadCovers(token) {
    let errors = 0;
    for (const c of collections) {
      if (!token.isCurrent()) return;
      const slot = document.querySelector('[data-cover="' + c.id + '"]');
      if (!slot || slot.dataset.done) continue;
      try {
        const photo = await client.photoAt(c.id, 0);
        if (!token.isCurrent()) return;
        if (photo) {
          const candidates = client.thumbCandidates
            ? client.thumbCandidates(photo, 640)
            : [client.thumbUrl(photo, 640)];
          const img = document.createElement("img");
          const request = window.ImageLoader.load(candidates, img);
          slot._imageRequest = request;
          const untrack = token.onCancel(() => request.cancel());
          try {
            await request.promise;
          } finally {
            untrack();
          }
          if (!token.isCurrent()) return;
          slot.innerHTML = "";
          slot.appendChild(img);
          slot.dataset.done = "1";
        }
      } catch (e) {
        if (!token.isCurrent()) return;
        errors++;
        if (errors === 1) {
          window.App.toast("服务器错误，封面加载失败");
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  function move(dx, dy) {
    const n = collections.length;
    let next = focusIdx + dx + dy * COLS;
    if (dx === -1 && focusIdx % COLS === 0) return;
    if (dx === 1 && (focusIdx % COLS === COLS - 1 || next >= n)) return;
    if (next < 0) next = 0;
    if (next >= n) next = n - 1;
    focusIdx = next;
    applyFocus();
  }

  window.CollectionsScreen = {
    async open(src) {
      source = src;
      client = window.Sources.client(src);
      const token = coverGen.next();
      window.Navigation.push("collections");
      $("collections-source-name").textContent = src.name;
      $("collection-list").innerHTML = "";
      try {
        const loaded = window.Sources.sortCollections(await client.collections());
        if (!token.isCurrent()) return;
        collections = loaded;
      } catch (e) {
        if (!token.isCurrent()) return;
        window.App.toast("无法连接 " + src.name);
        return window.Navigation.pop();
      }
      if (!token.isCurrent()) return;
      if (!collections.length) {
        window.App.toast(src.name + " 还在索引中，稍后再试");
        return window.Navigation.pop();
      }
      focusIdx = 0;
      render();
      loadCovers(token);
    },

    onKey({ key }) {
      if (key === "left") move(-1, 0);
      else if (key === "right") move(1, 0);
      else if (key === "up") move(0, -1);
      else if (key === "down") move(0, 1);
      else if (key === "ok") {
        window.GridScreen.open(source, collections[focusIdx]);
      } else if (key === "play" || key === "green") {
        const c = collections[focusIdx];
        window.Playback.start(source, [c.id], { rememberCollection: c.id });
      } else if (key === "back") {
        coverGen.cancel();
        return window.Navigation.pop();
      } else return;
    },
  };
})();
