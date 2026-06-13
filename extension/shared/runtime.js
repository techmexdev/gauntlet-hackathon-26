const sdfRuntime = {
  invalidateCallbacks: new Set(),

  isAvailable() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  },

  onInvalidate(callback) {
    this.invalidateCallbacks.add(callback);
    return () => this.invalidateCallbacks.delete(callback);
  },

  invalidate() {
    for (const cb of this.invalidateCallbacks) {
      try {
        cb();
      } catch {
        // Ignore teardown errors from stale scripts.
      }
    }
    this.invalidateCallbacks.clear();
  },

  sendMessage(message, { retries = 3, delayMs = 250 } = {}) {
    if (!this.isAvailable()) {
      this.invalidate();
      return Promise.reject(new Error('Extension context invalidated'));
    }

    const attempt = (remaining) =>
      new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              const retryable =
                remaining > 0 &&
                /Receiving end does not exist|message port closed/i.test(err.message);
              if (retryable) {
                setTimeout(() => {
                  attempt(remaining - 1).then(resolve, reject);
                }, delayMs);
                return;
              }
              if (/Extension context invalidated/i.test(err.message)) {
                this.invalidate();
              }
              reject(new Error(err.message));
              return;
            }
            resolve(response);
          });
        } catch (error) {
          this.invalidate();
          reject(error);
        }
      });

    return attempt(retries);
  },
};
