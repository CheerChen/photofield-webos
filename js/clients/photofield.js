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
  const GRID_IMAGE_H = 220; // wall layout row height for the TV grid
  const SCENE_POLL_MS = 800;
  const SCENE_POLL_MAX = 120; // ~96s worst case for a fresh index

  function create(source) {
    const base = source.baseUrl;
    const scenes = new Map(); // collectionId -> {id, fileCount, height}

    async function api(path, opts) {
      const r = await fetch(base + "/api" + path, opts);
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
          "&viewport_width=" + VIEWPORT_W + "&image_height=" + GRID_IMAGE_H
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

      /* Regions are 1-based and sequential in layout order. */
      async photoAt(collectionId, i) {
        return withSceneRetry(collectionId, async (s) => {
          try {
            const r = await api("/scenes/" + s.id + "/regions/" + (i + 1));
            return r.data ? mapPhoto(r.data) : null;
          } catch (e) {
            if (e.status === 404) return null; // id hole — caller skips
            throw e;
          }
        });
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

      thumbUrl(photo) {
        // Pre-generated variant (~256px, made at index time) beats dynamic
        // previews for grid density. Fall back to a dynamic preview.
        const t = photo.thumbnails.find((t) => t.width >= 200 && t.width <= 512) ||
          photo.thumbnails[0];
        if (t) {
          return base + "/api/files/" + photo.id + "/variants/" +
            encodeURIComponent(t.name) + "/" + encodeURIComponent(t.filename);
        }
        return base + "/api/files/" + photo.id + "/previews/" +
          encodeURIComponent(photo.filename) + "?width=384";
      },

      previewUrl(photo, width) {
        return base + "/api/files/" + photo.id + "/previews/" +
          encodeURIComponent(photo.filename) + "?width=" + (width || 1920);
      },

      originalUrl(photo) {
        return base + "/api/files/" + photo.id + "/original/" +
          encodeURIComponent(photo.filename);
      },
    };
  }

  window.PhotofieldClient = { create };
})();
