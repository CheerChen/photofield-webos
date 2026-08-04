/* Cancellable token for async UI work. Starting a new generation invalidates
 * the previous token and runs its cancellation hooks, so late callbacks can
 * neither mutate stale screens nor leave cancelable image requests running. */
(function () {
  function create() {
    let active = null;

    function makeToken() {
      let cancelled = false;
      const callbacks = new Set();
      const token = {
        get cancelled() {
          return cancelled;
        },
        isCurrent() {
          return !cancelled && active === token;
        },
        onCancel(callback) {
          if (typeof callback !== "function") return () => {};
          if (cancelled) {
            try { callback(); } catch (e) { /* cancellation is best-effort */ }
            return () => {};
          }
          callbacks.add(callback);
          return () => callbacks.delete(callback);
        },
        cancel() {
          if (cancelled) return;
          cancelled = true;
          if (active === token) active = null;
          for (const callback of callbacks) {
            try { callback(); } catch (e) { /* cancellation is best-effort */ }
          }
          callbacks.clear();
        },
      };
      return token;
    }

    return {
      next() {
        const previous = active;
        const token = makeToken();
        active = token;
        if (previous) previous.cancel();
        return token;
      },
      cancel() {
        if (active) active.cancel();
      },
      current() {
        return active;
      },
    };
  }

  window.Generation = { create };
})();
