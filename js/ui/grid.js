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
  const pending = new Map();
  const cells = new Map(); // i -> element
  let focused = null; // current focused item {i,x,y,w,h,photo}
  let openGeneration = 0;

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
      const candidates = client.thumbCandidates
        ? client.thumbCandidates(it.photo, 512)
        : [client.thumbUrl(it.photo, 512)];
      const request = window.ImageLoader.load(candidates, img);
      cell._imageRequest = request;
      request.promise.catch(() => {
        if (cell.parentNode) {
          img.removeAttribute("src");
          cell.classList.add("image-failed");
        }
      });
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
        if (cell._imageRequest) cell._imageRequest.cancel();
        cell.remove();
        cells.delete(i);
      }
    }
  }

  function clearLoaded() {
    for (const cell of cells.values()) {
      if (cell._imageRequest) cell._imageRequest.cancel();
      cell.remove();
    }
    cells.clear();
    slices.clear();
    pending.clear();
    focused = null;
  }

  async function ensureSlices(gen = openGeneration) {
    if (gen !== openGeneration) return;
    const first = sliceKey(scrollY - SLICE_H);
    const last = sliceKey(scrollY + SLICE_H * 2);
    for (let key = first; key <= last; key += SLICE_H) {
      if (gen !== openGeneration) return;
      if (key < 0 || slices.has(key) || pending.has(key)) continue;
      pending.set(key, gen);
      try {
        const items = await client.slice(collection.id, key, SLICE_H);
        if (gen !== openGeneration) return;
        slices.set(key, items);
        renderSlice(key);
      } catch (e) {
        /* slice stays unfetched; next scroll retries */
      } finally {
        if (pending.get(key) === gen) pending.delete(key);
      }
    }
    if (gen === openGeneration) prune();
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
      // Keep the focused cell inside the viewport. Scrolling is a composited
      // translateY on the canvas (see .grid-canvas) clamped to the real
      // viewport height, so the view can never overshoot the content into
      // bare background the way the old 1080-based scrollTop math could.
      const viewH = $("grid-viewport").clientHeight;
      const target = Math.min(
        Math.max(0, item.y - viewH / 2 + item.h / 2),
        Math.max(0, $("grid-canvas").offsetHeight - viewH)
      );
      if (Math.abs(target - scrollY) > 40) {
        scrollY = target;
        $("grid-canvas").style.transform = "translateY(-" + scrollY + "px)";
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
      ensureSlices(openGeneration);
    }
  }

  window.GridScreen = {
    async open(src, col) {
      const gen = ++openGeneration;
      source = src;
      collection = col;
      client = window.Sources.client(src);
      window.App.show("grid");
      clearLoaded();
      $("grid-canvas").innerHTML = "";
      scrollY = 0;
      $("grid-canvas").style.transform = "translateY(0)";
      try {
        total = await client.photoCount(col.id);
        if (gen !== openGeneration) return;
        const height = await client.sceneHeight(col.id);
        if (gen !== openGeneration) return;
        $("grid-canvas").style.height = height + "px";
      } catch (e) {
        if (gen !== openGeneration) return;
        window.App.toast("加载失败：" + e.message);
        return window.App.show(window.GridScreen.backTarget || "sources");
      }
      await ensureSlices(gen);
      if (gen !== openGeneration) return;
      const first = slices.get(sliceKey(0));
      if (first && first.length) setFocused(first[0]);
      status();
    },

    onKey({ key }) {
      if (key === "left") move(-1, 0);
      else if (key === "right") move(1, 0);
      else if (key === "up") move(0, -1);
      else if (key === "down") move(0, 1);
      else if (key === "ok" && focused) {
        window.ViewerScreen.open(source, collection, focused.i);
      } else if ((key === "play" || key === "green") && focused) {
        window.Playback.start(source, [collection.id], {
          start: { collectionId: collection.id, index: focused.i },
          rememberCollection: collection.id,
        });
      } else if (key === "back") {
        openGeneration++;
        clearLoaded();
        return window.App.show(window.GridScreen.backTarget || "sources");
      }
    },

    backTarget: "collections",
  };
})();
