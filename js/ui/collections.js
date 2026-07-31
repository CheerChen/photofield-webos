/* Collection list within one source. A single-collection source (Wallpaper)
 * skips this screen entirely and goes straight to the grid. */
(function () {
  const $ = (id) => document.getElementById(id);
  let source = null;
  let collections = [];
  let focusIdx = 0;

  function render() {
    const list = $("collection-list");
    list.innerHTML = "";
    collections.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "collection-row" + (i === focusIdx ? " focused" : "");
      row.innerHTML = "<span>" + c.name + "</span>" +
        '<span class="count">' + c.count.toLocaleString() + " 张</span>";
      list.appendChild(row);
    });
    const focused = list.children[focusIdx];
    if (focused) focused.scrollIntoView({ block: "nearest" });
  }

  window.CollectionsScreen = {
    async open(src) {
      source = src;
      window.App.show("collections");
      $("collections-source-name").textContent = src.name;
      $("collection-list").innerHTML = "";
      try {
        collections = await window.Sources.client(src).collections();
      } catch (e) {
        window.App.toast("无法连接 " + src.name);
        return window.App.show("sources");
      }
      if (!collections.length) {
        window.App.toast(src.name + " 还在索引中，稍后再试");
        return window.App.show("sources");
      }
      if (collections.length === 1) {
        window.GridScreen.backTarget = "sources";
        return window.GridScreen.open(source, collections[0]);
      }
      focusIdx = 0;
      render();
    },

    onKey({ key }) {
      const n = collections.length;
      if (key === "up") focusIdx = (focusIdx - 1 + n) % n;
      else if (key === "down") focusIdx = (focusIdx + 1) % n;
      else if (key === "ok") {
        window.GridScreen.backTarget = "collections";
        window.GridScreen.open(source, collections[focusIdx]);
      } else if (key === "play" || key === "green") {
        const c = collections[focusIdx];
        window.Store.set("lastCollection", c.id);
        window.KioskScreen.open(source, [c.id], { shuffle: true });
      } else if (key === "back") {
        return window.App.back();
      } else return;
      render();
    },
  };
})();
