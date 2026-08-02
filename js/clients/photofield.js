/* photofield implementation of the source contract.
 *
 * photofield is scene/region oriented, not list oriented:
 *   - a "scene" is an ephemeral (in-memory, TTL'd) server-side layout of a
 *     collection for a given viewport; it can expire or vanish on restart
 *   - photos in a scene are "regions" with sequential 1-based ids
 *   - scene lifecycle (reuse -> 404 -> recreate -> poll loading) is entirely
 *     encapsulated here; callers see a stable collection view
 */
(function () {
  const VIEWPORT_W = 1920;
  const VIEWPORT_H = 1080;
  // WALL layout scales rows to ~1.7% of viewport width (it's a zoomable tile
  // map, image_height is ignored). FLEX is the justified-gallery layout and
  // honors image_height — 300px rows give ~29 photos per 1080p screen.
  const GRID_LAYOUT = "FLEX";
  const GRID_IMAGE_H = 300;
  const SCENE_POLL_MS = 800;
  const SCENE_POLL_MAX = 120; // ~96s worst case for a fresh index

  function create(source) {
    const base = source.baseUrl;
    const scenes = new Map(); // collectionId -> {id, fileCount, height}
    // photoAt metadata cache: player.js preload() and show() both call
    // photoAt for the same (collection, index), so without a cache every
    // slide costs two region requests on the pi. Keyed by "collectionId:i",
    // value is the photo object or null (a hole). Bounded LRU so a long
    // slideshow does not grow unbounded.
    const photoCache = new Map();
    const PHOTO_CACHE_MAX = 64;

    function photoCacheGet(key) {
      if (!photoCache.has(key)) return undefined;
      const v = photoCache.get(key);
      photoCache.delete(key);
      photoCache.set(key, v); // move to most-recent
      return v;
    }
    function photoCacheSet(key, v) {
      if (photoCache.has(key)) photoCache.delete(key);
      photoCache.set(key, v);
      if (photoCache.size > PHOTO_CACHE_MAX) {
        photoCache.delete(photoCache.keys().next().value);
      }
    }

    async function api(path, opts) {
      const r = await fetch(base + "/api" + path, opts);
      if (r.status === 500) {
        // 500 is typically a transient SQLite pool exhaustion on the pi.
        // Retry once after a brief pause before surfacing the error.
        await new Promise((r) => setTimeout(r, 2000));
        const r2 = await fetch(base + "/api" + path, opts);
        if (r2.ok) return r2.json();
        const err = new Error("photofield " + r2.status);
        err.status = r2.status;
        throw err;
      }
      if (!r.ok) {
        const err = new Error("photofield " + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    }

    async function createScene(collectionId) {
      const scene = await api("/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: collectionId,
          viewport_width: VIEWPORT_W,
          viewport_height: VIEWPORT_H,
          image_height: GRID_IMAGE_H,
          layout: GRID_LAYOUT,
        }),
      });
      // Scene layout is async (202): poll until the layout settles.
      for (let i = 0; i < SCENE_POLL_MAX; i++) {
        const s = await api("/scenes/" + scene.id);
        if (!s.loading && s.file_count > 0) return s;
        await new Promise((r) => setTimeout(r, SCENE_POLL_MS));
      }
      throw new Error("scene never finished loading");
    }

    async function ensureScene(collectionId) {
      const cached = scenes.get(collectionId);
      if (cached) {
        // Scenes are ephemeral: verify it is still alive.
        try {
          const s = await api("/scenes/" + cached.id);
          if (!s.stale) return s;
        } catch (e) {
          /* fall through to recreate */
        }
      }
      // Reuse a matching scene the server already has (e.g. from the web UI).
      const list = await api(
        "/scenes?collection_id=" + encodeURIComponent(collectionId) +
          "&viewport_width=" + VIEWPORT_W + "&image_height=" + GRID_IMAGE_H +
          "&layout=" + GRID_LAYOUT
      );
      const existing = (list.items || []).find((s) => !s.loading && !s.stale);
      const scene = existing || (await createScene(collectionId));
      scenes.set(collectionId, {
        id: scene.id,
        fileCount: scene.file_count,
        height: scene.bounds.h,
      });
      return scene;
    }

    /* Drop cached scene and retry once — the recovery path for a scene that
     * expired mid-session. */
    async function withSceneRetry(collectionId, fn) {
      try {
        return await fn(await ensureScene(collectionId));
      } catch (e) {
        if (e.status !== 404) throw e;
        scenes.delete(collectionId);
        return fn(await ensureScene(collectionId));
      }
    }

    function mapPhoto(d) {
      return {
        id: d.id,
        width: d.width,
        height: d.height,
        takenAt: d.created_at,
        isVideo: !!d.video,
        filename: d.filename,
        thumbnails: d.thumbnails || [],
      };
    }

    function variantWidth(variant) {
      const width = Number(variant && variant.width);
      return Number.isFinite(width) ? width : 0;
    }

    function variantUrl(photo, variant) {
      if (!variant || !variant.name || !variant.filename) return null;
      return base + "/api/files/" + photo.id + "/variants/" +
        encodeURIComponent(variant.name) + "/" + encodeURIComponent(variant.filename);
    }

    function candidateUrls(photo, variants, preferred, want, dynamicWidth) {
      const ordered = [];
      const add = (url) => {
        if (url && !ordered.includes(url)) ordered.push(url);
      };
      const addVariant = (variant) => add(variantUrl(photo, variant));

      addVariant(preferred);
      variants
        .filter((variant) => variant !== preferred)
        .map((variant, index) => ({
          variant,
          index,
          distance: Math.abs(variantWidth(variant) - want),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .forEach(({ variant }) => addVariant(variant));

      // Unlike a generated variant, this endpoint creates the requested
      // preview from the original on demand and is therefore the reliable
      // end of the chain whenever the photo itself is available.
      add(base + "/api/files/" + photo.id + "/previews/" +
        encodeURIComponent(photo.filename) + "?width=" + dynamicWidth);
      return ordered;
    }

    function thumbCandidates(photo, target) {
      const want = target || 384;
      const variants = (photo.thumbnails || []).filter((t) => t && t.name !== "original");
      const preferred = variants
        .filter((t) => variantWidth(t) >= want)
        .sort((a, b) => variantWidth(a) - variantWidth(b))[0] ||
        variants.slice().sort((a, b) => variantWidth(b) - variantWidth(a))[0];
      return candidateUrls(photo, variants, preferred, want, want);
    }

    function previewCandidates(photo, width) {
      // Prefer a pre-generated variant near the target size: indexing
      // already produced e.g. ffmpeg-1280x1280-in, so the server just
      // reads a file instead of resizing on the pi's CPU. The rest of the
      // variants are still useful fallbacks when that file is absent.
      const want = width || 1920;
      const variants = (photo.thumbnails || []).filter(Boolean);
      const preferred = variants
        .filter((t) => variantWidth(t) >= want * 0.6)
        .sort((a, b) => variantWidth(a) - variantWidth(b))[0];
      return candidateUrls(photo, variants, preferred, want, want);
    }

    return {
      async collections() {
        const r = await api("/collections");
        return (r.items || [])
          .map((c) => ({ id: c.id, name: c.name, count: c.indexed_count }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      async photoCount(collectionId) {
        const s = await withSceneRetry(collectionId, (x) => x);
        return s.file_count;
      },

      async sceneHeight(collectionId) {
        const s = await withSceneRetry(collectionId, (x) => x);
        return scenes.get(collectionId).height;
      },

      /* Regions are 1-based and sequential in layout order. Results are
       * cached: the same (collection, index) is requested by both preload()
       * and show() in player.js, and the layout for a given collection is
       * deterministic, so a cached photo stays valid for the session. */
      async photoAt(collectionId, i) {
        const key = collectionId + ":" + i;
        const cached = photoCacheGet(key);
        if (cached !== undefined) return cached;
        const result = await withSceneRetry(collectionId, async (s) => {
          try {
            const r = await api("/scenes/" + s.id + "/regions/" + (i + 1));
            return r.data ? mapPhoto(r.data) : null;
          } catch (e) {
            if (e.status === 404) return null; // id hole — caller skips
            throw e;
          }
        });
        photoCacheSet(key, result);
        return result;
      },

      /* Horizontal band of the wall layout for the browse grid. */
      async slice(collectionId, y, h) {
        return withSceneRetry(collectionId, async (s) => {
          const r = await api(
            "/scenes/" + s.id + "/regions?x=0&y=" + Math.max(0, y) +
              "&w=" + VIEWPORT_W + "&h=" + h + "&limit=500"
          );
          return (r.items || [])
            .filter((it) => it.data)
            .map((it) => ({
              i: it.id - 1,
              x: it.bounds.x,
              y: it.bounds.y,
              w: it.bounds.w,
              h: it.bounds.h,
              photo: mapPhoto(it.data),
            }));
        });
      },

      /* A thumbnail/preview entry describes a possible generated file, not a
       * guarantee that the file exists for this particular photo. Keep the
       * old single-URL helpers for callers outside this app, but make the
       * candidate-chain methods the source of truth for image loading. */
      thumbCandidates,
      previewCandidates,
      thumbUrl(photo, target) {
        return thumbCandidates(photo, target)[0];
      },
      previewUrl(photo, width) {
        return previewCandidates(photo, width)[0];
      },

      originalUrl(photo) {
        return base + "/api/files/" + photo.id + "/original/" +
          encodeURIComponent(photo.filename);
      },

      /* Trigger a filesystem rescan for one collection. Photofield returns
       * 202 when it creates the task and 409 when one is already running for
       * that collection; both are acceptable "scan in progress" states, so
       * 409 is swallowed. Uses a raw fetch instead of the shared api()
       * helper because the task body is not needed and api() would try to
       * parse it. INDEX_FILES is the only type that discovers new files;
       * Photofield auto-queues INDEX_METADATA / CONTENTS / FACES after it. */
      async createIndexFiles(collectionId) {
        const r = await fetch(base + "/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "INDEX_FILES",
            collection_id: collectionId,
          }),
        });
        if (r.status !== 202 && r.status !== 409) {
          const err = new Error("photofield " + r.status);
          err.status = r.status;
          throw err;
        }
      },

      /* Running tasks for the instance. With a collectionId the server
       * filters server-side; without it every running task is returned,
       * which the scan orchestrator attributes back to a source by matching
       * each task's collection_id against the source's collection ids. */
      async tasks(collectionId) {
        const path = collectionId != null
          ? "/tasks?collection_id=" + encodeURIComponent(collectionId)
          : "/tasks";
        const r = await api(path);
        return r.items || [];
      },

      /* Drop scene and photo-metadata caches. Called after a scan finishes
       * because file order may have changed and a stale scene would show the
       * pre-scan layout (wrong photos / wrong positions). */
      reset() {
        scenes.clear();
        photoCache.clear();
      },
    };
  }

  window.PhotofieldClient = { create };
})();
