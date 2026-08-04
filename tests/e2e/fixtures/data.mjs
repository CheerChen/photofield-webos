// tests/e2e/fixtures/data.mjs — fake photofield backend data.
//
// The app talks to one "source" (an upstream photofield server). The cached
// source in localStorage points baseUrl at the e2e static server, and every
// /api/* request is intercepted by the harness, so this module fully defines
// the backend the app sees.

export const SOURCE_HOST = "127.0.0.1";
export const SOURCE_PORT = 4174;
export const SOURCE_BASE = `http://${SOURCE_HOST}:${SOURCE_PORT}`;
export const SOURCE_ID = "port-8000";

// Region layout constants. These mimic a FLEX-ish wall layout: regions are
// 1-based and sequential in layout order, with absolute x/y coordinates.
export const TILE_W = 480;
export const TILE_H = 420;
export const PER_ROW = 4;

export function regionBounds(i) {
  return {
    x: (i % PER_ROW) * TILE_W,
    y: Math.floor(i / PER_ROW) * TILE_H,
    w: TILE_W,
    h: TILE_H,
  };
}

export function sceneHeight(count) {
  return Math.ceil(count / PER_ROW) * TILE_H;
}

function makePhotos(collectionId, count) {
  const photos = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${collectionId}-${i + 1}`;
    photos.push({
      id,
      width: 1600,
      height: 1200,
      created_at: `2024-01-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
      latlng: i === 0 ? { lat: 35.6762, lng: 139.6503 } : null,
      video: false,
      filename: `${id}.jpg`,
      // A persistent small variant plus the on-demand preview keep the
      // candidate chain realistic; the original stays eligible and first.
      thumbnails: [
        { name: "sqlite", filename: `${id}-thumb.jpg`, width: 256 },
        { name: "djpeg", filename: `${id}-dyn.jpg`, width: 800 },
      ],
    });
  }
  return photos;
}

// Two collections so source totals, album navigation, and kiosk ordering all
// have something to work with.
export const COLLECTIONS = [
  { id: "col-alpha", name: "Alpha", indexed_count: 5, dirs: ["/Alpha"] },
  { id: "col-beta", name: "Beta", indexed_count: 3, dirs: ["/Beta"] },
];

export const PHOTOS = {
  "col-alpha": makePhotos("col-alpha", 5),
  "col-beta": makePhotos("col-beta", 3),
};

export function collectionById(id) {
  return COLLECTIONS.find((c) => c.id === id) || null;
}

export function photosOf(collectionId) {
  return PHOTOS[collectionId] || [];
}
