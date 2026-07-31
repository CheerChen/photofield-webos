/* Fullscreen single-photo viewer overlay, entered from the grid. */
(function () {
  const $ = (id) => document.getElementById(id);
  let source = null;
  let collection = null;
  let client = null;
  let index = 0;
  let count = 0;
  let loading = false;

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  async function show() {
    if (loading) return;
    loading = true;
    try {
      const photo = await client.photoAt(collection.id, index);
      if (!photo) return;
      const stage = $("viewer-stage");
      stage.innerHTML = "";
      const img = document.createElement("img");
      img.src = client.previewUrl(photo, 1920);
      stage.appendChild(img);
      $("viewer-meta").textContent =
        fmtDate(photo.takenAt) + "  " + photo.filename +
        "  ·  " + (index + 1) + " / " + count.toLocaleString();
    } catch (e) {
      window.App.toast("加载失败");
    } finally {
      loading = false;
    }
  }

  window.ViewerScreen = {
    async open(src, col, startIndex) {
      source = src;
      collection = col;
      client = window.Sources.client(src);
      index = startIndex;
      count = await client.photoCount(col.id);
      $("screen-viewer").hidden = false;
      window.Keys.activate("viewer");
      show();
    },

    onKey({ key }) {
      if (key === "left" && index > 0) {
        index--;
        show();
      } else if (key === "right" && index < count - 1) {
        index++;
        show();
      } else if (key === "green" || key === "longok") {
        $("screen-viewer").hidden = true;
        window.Store.set("lastCollection", collection.id);
        window.KioskScreen.open(source, [collection.id], {
          shuffle: false,
          start: { collectionId: collection.id, index },
        });
      } else if (key === "back" || key === "ok") {
        $("screen-viewer").hidden = true;
        window.Keys.activate("grid");
      }
    },
  };
})();
