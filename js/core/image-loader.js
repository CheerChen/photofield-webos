/* Shared ordered-image loader. A single Image object walks the candidate
 * URLs until one succeeds, so a missing pre-generated variant can fall back
 * to another variant or to the server's dynamic preview. */
(function () {
  function uniqueCandidates(candidates) {
    const seen = new Set();
    return (Array.isArray(candidates) ? candidates : [candidates])
      .filter((url) => typeof url === "string" && url && !seen.has(url) && seen.add(url));
  }

  function load(candidates, target) {
    const urls = uniqueCandidates(candidates);
    const image = target || new Image();
    let cursor = 0;
    let settled = false;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
      rejectPromise = reject;

      function fail() {
        if (settled) return;
        if (cursor >= urls.length) {
          settled = true;
          const error = new Error("image candidates exhausted");
          error.urls = urls.slice();
          reject(error);
          return;
        }
        const url = urls[cursor++];
        image.onload = () => {
          if (settled) return;
          settled = true;
          resolve({ image, url });
        };
        image.onerror = fail;
        try {
          image.src = url;
        } catch (error) {
          fail(error);
        }
      }

      fail();
    });

    return {
      image,
      promise,
      cancel() {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        try { image.src = ""; } catch (e) { /* ignore */ }
        const error = new Error("image load cancelled");
        error.code = "CANCELLED";
        rejectPromise(error);
      },
    };
  }

  window.ImageLoader = { load, uniqueCandidates };
})();
