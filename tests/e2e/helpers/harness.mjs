// tests/e2e/helpers/harness.mjs — boot the app in Chromium with a fake backend.
import {
  COLLECTIONS,
  PHOTOS,
  SOURCE_BASE,
  SOURCE_ID,
  photosOf,
  regionBounds,
  sceneHeight,
} from "../fixtures/data.mjs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

// Boots to the source screen with a seeded cached source and a fully faked
// photofield backend. Returns a state object with collected page errors and
// API call logs so specs can assert on both.
export async function bootToSources(page) {
  const state = createBackendState();
  state.errors = [];
  state.apiCalls = [];
  state.probeCalls = [];
  page.on("pageerror", (err) => state.errors.push(String(err)));

  await page.route("**/api/**", (route) => handleApi(route, state));
  await page.route("https://api.bigdatacloud.net/**", (route) => json(route, {
    countryName: "日本",
    principalSubdivision: "千叶县",
    city: "千叶市",
    locality: "美滨区",
  }));

  // Seed a cached source pointing at the mock server plus deterministic
  // settings (1s kiosk interval, sequential order, no lofi autostart) so
  // behavior is stable and transitions are observable in reasonable time.
  await page.addInitScript(({ sources, settings }) => {
    localStorage.setItem("photofield.sources.v1", JSON.stringify(sources));
    localStorage.setItem("photofield.settings.v1", JSON.stringify(settings));
  }, {
    sources: [{ id: SOURCE_ID, name: "Photos", baseUrl: SOURCE_BASE, locked: false }],
    settings: {
      startup: "sources",
      duration: 1,
      fitMode: "contain",
      playOrder: "sequential",
      albumSort: "nameAsc",
      mediaScope: "photos",
      autoLofi: false,
      infoDisplay: "clock",
      pinHash: null,
      lastSource: SOURCE_ID,
      lastCollection: null,
    },
  });

  await page.goto("/index.html");
  await page.waitForFunction(
    () => {
      const screen = document.getElementById("screen-sources");
      const card = document.querySelector("#source-row .source-card.focused");
      const count = card && card.querySelector(".source-card-count");
      return !!screen && !screen.hidden && !!count && /\d/.test(count.textContent) && !/正在读取/.test(count.textContent);
    },
    null,
    { timeout: 15000 }
  );
  // Let cover loading and scan sync settle before specs start pressing keys.
  await page.waitForTimeout(300);
  return state;
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function createBackendState() {
  let sceneSeq = 0;
  const scenes = new Map(); // sceneId -> scene object
  return {
    createScene(collectionId) {
      sceneSeq += 1;
      const count = photosOf(collectionId).length;
      const scene = {
        id: "scene-" + sceneSeq,
        collection_id: collectionId,
        loading: false,
        stale: false,
        file_count: count,
        bounds: { x: 0, y: 0, w: 1920, h: sceneHeight(count) },
      };
      scenes.set(scene.id, scene);
      return scene;
    },
    sceneById(id) {
      return scenes.get(id) || null;
    },
  };
}

function handleApi(route, state) {
  const req = route.request();
  const u = new URL(req.url());
  const method = req.method();

  // Boot probes the default host's port range; every probe must fail so
  // discover() keeps the seeded cached source list (empty scan preserves it).
  if (u.hostname === "192.168.0.110") {
    state.probeCalls.push(u.href);
    return route.abort();
  }

  const p = u.pathname;
  state.apiCalls.push(method + " " + p);

  if (p === "/api/collections") return json(route, { items: COLLECTIONS });

  if (p === "/api/tasks") {
    if (method === "POST") return json(route, { items: [] }, 202);
    return json(route, { items: [] });
  }

  if (p === "/api/scenes") {
    if (method === "POST") {
      const body = req.postDataJSON();
      return json(route, state.createScene(body.collection_id));
    }
    // Scene-reuse query: nothing pre-exists, so the client creates its own.
    return json(route, { items: [] });
  }

  let m = p.match(/^\/api\/scenes\/([^/]+)$/);
  if (m) {
    const scene = state.sceneById(m[1]);
    if (!scene) return json(route, { error: "scene not found" }, 404);
    return json(route, scene);
  }

  m = p.match(/^\/api\/scenes\/([^/]+)\/regions\/(\d+)$/);
  if (m) {
    const scene = state.sceneById(m[1]);
    if (!scene) return json(route, { error: "scene not found" }, 404);
    const idx = Number(m[2]) - 1;
    const photos = photosOf(scene.collection_id);
    if (idx < 0 || idx >= photos.length) return json(route, { error: "no region" }, 404);
    return json(route, { data: photos[idx] });
  }

  m = p.match(/^\/api\/scenes\/([^/]+)\/regions$/);
  if (m) {
    const scene = state.sceneById(m[1]);
    if (!scene) return json(route, { error: "scene not found" }, 404);
    const y = Number(u.searchParams.get("y")) || 0;
    const h = Number(u.searchParams.get("h")) || 0;
    const items = photosOf(scene.collection_id)
      .map((photo, i) => ({ id: i + 1, bounds: regionBounds(i), data: photo }))
      .filter((it) => it.bounds.y + it.bounds.h > y && it.bounds.y < y + h);
    return json(route, { items });
  }

  if (p.startsWith("/api/files/")) {
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  }

  return json(route, { error: "unmocked endpoint " + method + " " + p }, 500);
}
