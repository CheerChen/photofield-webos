/* Browse grid: renders the server's wall layout directly — regions arrive
 * with absolute coordinates, the canvas is one tall strip, and slices are
 * fetched/rendered on scroll with DOM pruning beyond +-2 viewports. */
(function () {
  const $ = (id) => document.getElementById(id);
  const SLICE_H = 1080;
  const PRUNE_DIST = SLICE_H * 3;

  let source = null;
  let collection = null;
  let client = null;
  let total = 0;
  let scrollY = 0;
  const slices = new Map(); // sliceY -> [{i,x,y,w,h,photo}]
  const pending = new Set();
  const cells = new Map(); // i -> element
  let focused = null; // current focused item {i,x,y,w,h,photo}

  function sliceKey(y) {
    return Math.floor(y / SLICE_H) * SLICE_H;
  }

  function status() {
    $("grid-status").textContent =
      collection.name + " · " + (focused ? focused.i + 1 : 0) + " / " + total.toLocaleString();
  }

  function renderSlice(key) {
    const items = slices.get(key);
    if (!items) return;
    const canvas = $("grid-canvas");
    for (const it of items) {
      if (cells.has(it.i)) continue;
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.style.left = it.x + "px";
      cell.style.top = it.y + "px";
      cell.style.width = it.w + "px";
      cell.style.height = it.h + "px";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = client.thumbUrl(it.photo, 512); // FLEX cells run ~280-600px wide
      cell.appendChild(img);
      if (it.photo.isVideo) {
        const badge = document.createElement("span");
        badge.className = "video-badge";
        badge.innerHTML = window.Icons.play;
        cell.appendChild(badge);
      }
      canvas.appendChild(cell);
      cells.set(it.i, cell);
    }
  }

  function prune() {
    for (const [i, cell] of cells) {
      const y = parseFloat(cell.style.top);
      if (Math.abs(y - scrollY) > PRUNE_DIST) {
        cell.remove();
        cells.delete(i);
      }
    }
  }

  async function ensureSlices() {
    const first = sliceKey(scrollY - SLICE_H);
    const last = sliceKey(scrollY + SLICE_H * 2);
    for (let key = first; key <= last; key += SLICE_H) {
      if (key < 0 || slices.has(key) || pending.has(key)) continue;
      pending.add(key);
      try {
        const items = await client.slice(collection.id, key, SLICE_H);
        slices.set(key, items);
        renderSlice(key);
      } catch (e) {
        /* slice stays unfetched; next scroll retries */
      } finally {
        pending.delete(key);
      }
    }
    prune();
  }

  function setFocused(item) {
    if (focused) {
      const old = cells.get(focused.i);
      if (old) old.classList.remove("focused");
    }
    focused = item;
    if (item) {
      const cell = cells.get(item.i);
      if (cell) cell.classList.add("focused");
      // Keep the focused cell inside the viewport.
      const target = Math.min(
        Math.max(0, item.y - 1080 / 2 + item.h / 2),
        Math.max(0, $("grid-canvas").offsetHeight - 1080)
      );
      if (Math.abs(target - scrollY) > 40) {
        scrollY = target;
        $("grid-viewport").scrollTop = scrollY;
      }
    }
    status();
  }

  /* Nearest-neighbor spatial nav over loaded cells, directional. */
  function move(dx, dy) {
    if (!focused) return;
    const cx = focused.x + focused.w / 2;
    const cy = focused.y + focused.h / 2;
    let best = null;
    let bestScore = Infinity;
    for (const items of slices.values()) {
      for (const it of items) {
        if (it === focused) continue;
        const ix = it.x + it.w / 2;
        const iy = it.y + it.h / 2;
        const ox = ix - cx;
        const oy = iy - cy;
        if (dx && Math.sign(ox) !== dx) continue;
        if (dy && Math.sign(oy) !== dy) continue;
        if (dx && Math.abs(oy) > Math.max(focused.h, it.h)) continue;
        if (dy && Math.abs(ox) > 1920) continue;
        const score = dx
          ? Math.abs(ox) + Math.abs(oy) * 3
          : Math.abs(oy) + Math.abs(ox) * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
    }
    if (best) {
      setFocused(best);
      ensureSlices();
    }
  }

  /* Page up/down by one viewport. Long-press is filtered globally in
   * keys.js, so without these keys a multi-thousand-photo album can only
   * be navigated one cell at a time. Red/yellow are otherwise idle in the
   * grid. After scrolling, focus the cell nearest the viewport center. */
  async function page(dir) {
    const vp = 1080;
    const max = Math.max(0, $("grid-canvas").offsetHeight - vp);
    scrollY = Math.max(0, Math.min(max, scrollY + dir * vp));
    $("grid-viewport").scrollTop = scrollY;
    await ensureSlices();
    const targetY = scrollY + vp / 2;
    let best = null;
    let bestDist = Infinity;
    for (const items of slices.values()) {
      for (const it of items) {
        const d = Math.abs(it.y + it.h / 2 - targetY);
        if (d < bestDist) { bestDist = d; best = it; }
      }
    }
    if (best) setFocused(best);
  }

  window.GridScreen = {
    async open(src, col) {
      source = src;
      collection = col;
      client = window.Sources.client(src);
      window.App.show("grid");
      $("grid-canvas").innerHTML = "";
      slices.clear();
      cells.clear();
      focused = null;
      scrollY = 0;
      $("grid-viewport").scrollTop = 0;
      try {
        total = await client.photoCount(col.id);
        const height = await client.sceneHeight(col.id);
        $("grid-canvas").style.height = height + "px";
      } catch (e) {
        window.App.toast("加载失败：" + e.message);
        return window.App.show(window.GridScreen.backTarget || "sources");
      }
      await ensureSlices();
      const first = slices.get(sliceKey(0));
      if (first && first.length) setFocused(first[0]);
      status();
    },

    onScroll(y) {
      scrollY = y;
      ensureSlices();
    },

    onKey({ key }) {
      if (key === "left") move(-1, 0);
      else if (key === "right") move(1, 0);
      else if (key === "up") move(0, -1);
      else if (key === "down") move(0, 1);
      else if (key === "red") page(-1);
      else if (key === "yellow") page(1);
      else if (key === "ok" && focused) {
        window.ViewerScreen.open(source, collection, focused.i);
      } else if ((key === "play" || key === "green") && focused) {
        window.Playback.start(source, [collection.id], {
          start: { collectionId: collection.id, index: focused.i },
          rememberCollection: collection.id,
        });
      } else if (key === "back") {
        return window.App.show(window.GridScreen.backTarget || "sources");
      }
    },

    backTarget: "collections",
  };
})();
