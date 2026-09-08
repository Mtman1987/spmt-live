(() => {
  if (window.__spmtMutationObserverGuardInstalled || typeof window.MutationObserver !== 'function') return;
  window.__spmtMutationObserverGuardInstalled = true;

  const NativeMutationObserver = window.MutationObserver;

  class SpmtMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.pending = [];
      this.timer = null;
      this.highFanout = false;
      this.native = new NativeMutationObserver((records) => {
        if (!this.highFanout) {
          callback(records, this);
          return;
        }
        this.pending.push(...records);
        if (this.timer) return;
        this.timer = window.setTimeout(() => {
          this.timer = null;
          const batch = this.pending.splice(0);
          if (batch.length) callback(batch, this);
        }, 50);
      });
    }

    observe(target, options) {
      this.highFanout = Boolean(
        target === document.documentElement
        && options?.subtree
        && (options?.childList || options?.attributes)
      );
      return this.native.observe(target, options);
    }

    disconnect() {
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = null;
      this.pending.length = 0;
      return this.native.disconnect();
    }

    takeRecords() {
      return this.native.takeRecords();
    }
  }

  window.MutationObserver = SpmtMutationObserver;
})();
