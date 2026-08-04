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
  // honors image_height — 420px rows give roughly 15 photos per 1080p screen,
  // a TV-friendly density that also keeps focus scrolling cheap.
  const GRID_LAYOUT = "FLEX";
  const GRID_IMAGE_H = 420;
  // Decoded-bitmap budget per surface: fullscreen holds at most three images
  // (the player window), but the grid decodes about 15 cells per screen, so it
  // gets a stricter cap. Animated GIFs are never admitted as originals.
  const ORIGINAL_MAX_EDGE_PREVIEW = 4096;
  const ORIGINAL_MAX_EDGE_THUMB = 2048;
  const SCENE_POLL_MS = 800;
  const SCENE_POLL_MAX = 120; // ~96s worst case for a fresh index

  function create(source) {
    const base = source.baseUrl;
    const scenes = new Map(); // collectionId -> {id, fileCount, height}
    // App boot and source-screen routing can request counts more than once in
    // quick succession. Share the expensive zero-count scene fallback while
    // it is in flight so those refreshes do not create duplicate scenes.
    let collectionsInFlight = null;
    // photoAt metadata cache: player.js preload() and show() both call
    // photoAt for the same (collection, index), so without a cache every
    // slide costs two region requests on the pi. Keyed by "collectionId:i",
    // value is the photo object or null (a hole). Bounded LRU so a long
    // slideshow does not grow unbounded.
    const PHOTO_CACHE_MAX = 64;
    const photoCache = window.LRU.create(PHOTO_CACHE_MAX);

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
      // Scene layout is async (202): poll until the layout settles. A settled
      // empty scene is also a valid result. Requiring file_count > 0 made a
      // genuinely empty collection spin for the full 96-second timeout.
      for (let i = 0; i < SCENE_POLL_MAX; i++) {
        const s = await api("/scenes/" + scene.id);
        if (!s.loading) return s;
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
        latlng: d.latlng || null,
        isVideo: !!d.video,
        filename: d.filename,
        thumbnails: d.thumbnails || [],
      };
    }

    function variantWidth(variant) {
      const width = Number(variant && variant.width);
      return Number.isFinite(width) ? width : 0;
    }

    function variantName(variant) {
      return String(variant && variant.name || "").toLowerCase();
    }

    /* Photofield exposes both persistent files and virtual sources in the
     * thumbnails list. Only the known dJPEG/FFmpeg sources do per-request
     * decoding; sqlite, thumb files, and embedded EXIF thumbnails are already
     * persisted somewhere, while original is the untouched source file. */
    function variantKind(variant) {
      const name = variantName(variant);
      if (/^(djpeg|ffmpeg)/.test(name)) return "dynamic";
      if (
        name === "sqlite" ||
        name === "goexif" ||
        /^thumb(?:-|$)/.test(name)
      ) return "persistent";
      if (name === "original") return "original";
      return "other";
    }

    function sortVariants(variants, want) {
      return variants
        .map((variant, index) => ({
          variant,
          index,
          distance: Math.abs(variantWidth(variant) - want),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .map(({ variant }) => variant);
    }

    function variantUrl(photo, variant) {
      if (!variant || !variant.name || !variant.filename) return null;
      return base + "/api/files/" + photo.id + "/variants/" +
        encodeURIComponent(variant.name) + "/" + encodeURIComponent(variant.filename);
    }

    function originalUrl(photo) {
      return base + "/api/files/" + photo.id + "/original/" +
        encodeURIComponent(photo.filename);
    }

    function candidateUrls(photo, variants, width) {
      const ordered = [];
      const add = (url) => {
        if (url && !ordered.includes(url)) ordered.push(url);
      };
      variants.forEach((variant) => add(variantUrl(photo, variant)));

      // Photofield's preview API calls the target-width parameter `w`.
      // This is the final on-demand fallback after all named sources fail.
      add(base + "/api/files/" + photo.id + "/previews/" +
        encodeURIComponent(photo.filename) + "?w=" + width);
      return ordered;
    }

    function canUseOriginal(photo, maxEdge) {
      if (!photo || photo.isVideo) return false;

      const width = Number(photo.width);
      const height = Number(photo.height);
      if (
        !Number.isFinite(width) || !Number.isFinite(height) ||
        width <= 0 || height <= 0 || Math.max(width, height) > maxEdge
      ) return false;

      return /\.(?:jpe?g|png|webp)$/i.test(String(photo.filename || ""));
    }

    function thumbCandidates(photo, target) {
      const want = target || 384;
      const variants = (photo.thumbnails || [])
        .filter((variant) => variant && variantKind(variant) !== "original");
      const persistent = variants.filter((variant) => variantKind(variant) === "persistent");
      const sqlite = persistent.filter((variant) => variantName(variant) === "sqlite");
      const otherPersistent = persistent.filter((variant) => variantName(variant) !== "sqlite");
      const other = variants.filter((variant) => variantKind(variant) === "other");
      const dynamic = variants.filter((variant) => variantKind(variant) === "dynamic");
      const persistentFallback = [
        ...sortVariants(sqlite, want),
        ...sortVariants(otherPersistent, want),
        ...sortVariants(other, want),
      ];
      const dynamicFallback = sortVariants(dynamic, want);

      const eligible = canUseOriginal(photo, ORIGINAL_MAX_EDGE_THUMB);
      // A photo that is only over the pixel cap should render from a dynamic
      // source rather than becoming soft from the 256px SQLite thumbnail.
      // Videos and unsupported formats keep the cheap persistent order.
      const oversizePhoto = !eligible && canUseOriginal(photo, Infinity);

      if (eligible) {
        return [
          originalUrl(photo),
          ...candidateUrls(photo, [...persistentFallback, ...dynamicFallback], want),
        ];
      }
      if (oversizePhoto) {
        return candidateUrls(photo, [...dynamicFallback, ...persistentFallback], want);
      }
      return candidateUrls(photo, [...persistentFallback, ...dynamicFallback], want);
    }

    function ambienceCandidates(photo, width) {
      // Dedicated low-resolution feed for blurred ambience layers. The layer
      // is blurred anyway, so persistent small variants come first and the
      // original is never a candidate: TV GPUs pay per decoded pixel.
      const want = width || 256;
      const persistent = (photo.thumbnails || [])
        .filter((variant) => variant && variantKind(variant) === "persistent");
      return candidateUrls(photo, sortVariants(persistent, want), want);
    }

    function previewCandidates(photo, width) {
      const want = width || 1920;
      const dynamic = (photo.thumbnails || [])
        .filter((variant) => variant && variantKind(variant) === "dynamic");
      const candidates = candidateUrls(photo, sortVariants(dynamic, want), want);

      // Use the original directly for browser-decodable, non-video photos
      // that fit the TV's texture and three-image memory limits. Large images,
      // videos, and formats such as HEIC stay on the dynamic path.
      if (canUseOriginal(photo, ORIGINAL_MAX_EDGE_PREVIEW)) {
        candidates.unshift(originalUrl(photo));
      }
      return candidates;
    }

    return {
      async collections() {
        if (!collectionsInFlight) {
          collectionsInFlight = (async () => {
            const r = await api("/collections");
            const collections = (r.items || [])
              .map((c) => ({ id: c.id, name: c.name, count: c.indexed_count }))
              .sort((a, b) => a.name.localeCompare(b.name));

            // Recent Photofield builds can leave indexed_count at 0 after a
            // successful first index even though scenes contain all files.
            // Resolve only zero/invalid values through the scene API;
            // positive indexed_count values keep the inexpensive fast path.
            // Do this sequentially to avoid making a newly indexed Raspberry
            // Pi lay out every collection at once.
            for (const collection of collections) {
              const count = Number(collection.count);
              if (Number.isFinite(count) && count > 0) {
                collection.count = count;
                continue;
              }
              collection.count = await this.photoCount(collection.id);
            }
            return collections;
          })();
        }
        const request = collectionsInFlight;
        try {
          return await request;
        } finally {
          // A reset/new request may have installed a different promise while
          // this call was awaiting; never clear that newer request.
          if (collectionsInFlight === request) collectionsInFlight = null;
        }
      },

      async photoCount(collectionId) {
        const s = await withSceneRetry(collectionId, (x) => x);
        return s.file_count;
      },

      async sceneHeight(collectionId) {
        await withSceneRetry(collectionId, (x) => x);
        return scenes.get(collectionId).height;
      },

      /* Regions are 1-based and sequential in layout order. Results are
       * cached: the same (collection, index) is requested by both preload()
       * and show() in player.js, and the layout for a given collection is
       * deterministic, so a cached photo stays valid for the session. */
      async photoAt(collectionId, i) {
        const key = collectionId + ":" + i;
        const cached = photoCache.get(key);
        if (cached !== undefined) return cached;
        const result = await withSceneRetry(collectionId, async (s) => {
          try {
            const r = await api("/scenes/" + s.id + "/regions/" + (i + 1));
            return r.data ? Object.assign(mapPhoto(r.data), { collectionId }) : null;
          } catch (e) {
            if (e.status === 404) return null; // id hole — caller skips
            throw e;
          }
        });
        photoCache.set(key, result);
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
      ambienceCandidates,
      previewCandidates,
      thumbUrl(photo, target) {
        return thumbCandidates(photo, target)[0];
      },
      previewUrl(photo, width) {
        return previewCandidates(photo, width)[0];
      },

      originalUrl(photo) {
        return originalUrl(photo);
      },

      // Videos are intentionally served as the untouched source. Photofield
      // does not transcode or expose HLS; the client decides whether the
      // browser can decode this URL and falls back to the already-loaded
      // preview when it cannot.
      videoUrl(photo) {
        return originalUrl(photo);
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
        // A 202 response includes the current task list. Returning it lets
        // the scan UI show progress immediately instead of waiting for the
        // first poll (fast INDEX_FILES tasks may be gone by then).
        try {
          const data = await r.json();
          return data.items || [];
        } catch (e) {
          return [];
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
        collectionsInFlight = null;
      },
    };
  }

  window.PhotofieldClient = { create };
})();
