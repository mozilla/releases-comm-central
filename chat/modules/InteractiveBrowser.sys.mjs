/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class CancelledError extends Error {
  constructor() {
    super("Interactive browser request was cancelled");
  }
}

export var InteractiveBrowser = {
  /**
   * URL to redirect to for completion of the redirect.
   *
   * @type {string}
   */
  COMPLETION_URL: "https://localhost",

  /**
   * Open an interactive browser prompt that should be redirected to the completion URL.
   *
   * @param {string} url - URL to start the interaction from.
   * @param {string} promptText - Prompt for the user for context to the interaction.
   * @returns {Promise<object>} Resolves when the redirect succeeds, else rejects.
   */
  waitForRedirect(url, promptText) {
    return this._browserRequest(url).then(({ window, webProgress, signal }) => {
      window.document.title = promptText;
      return this._listenForRedirect({
        window,
        webProgress,
        signal,
      });
    });
  },

  /**
   * Open a browser window to request an interaction from the user.
   *
   * @param {string} url - URL to load in the browser window
   * @returns {Promise<object>} If the url is loaded, resolves with an object
   * containing the |window|, |webRequest| and a |signal|. The |signal| is an
   * AbortSignal that gets triggered, when the "request is cancelled", i.e. the
   * window is closed.
   */
  _browserRequest(url) {
    return new Promise((resolve, reject) => {
      const browserRequest = {
        promptText: "",
        iconURI: "",
        url,
        _active: true,
        abortController: new AbortController(),
        cancelled() {
          if (!this._active) {
            return;
          }
          reject(new CancelledError());
          this.abortController.abort();
          this._active = false;
        },
        loaded(window, webProgress) {
          if (!this._active) {
            return;
          }
          resolve({ window, webProgress, signal: this.abortController.signal });
        },
      };
      Services.obs.notifyObservers(browserRequest, "browser-request");
    });
  },

  /**
   * Listen for a browser window to redirect to the specified URL.
   *
   * @param {Window} param0.window - Window to listen in.
   * @param {nsIWebProgress} param0.webProgress - Web progress instance.
   * @param {AbortSignal} param0.signal - Abort signal indicating that this should no longer listen for redirects.
   * @returns {Promise<string>} Resolves with the resulting redirect URL.
   */
  _listenForRedirect({ window, webProgress, signal }) {
    return new Promise((resolve, reject) => {
      const listener = {
        QueryInterface: ChromeUtils.generateQI([
          Ci.nsIWebProgressListener,
          Ci.nsISupportsWeakReference,
        ]),
        _abortListener: () => {
          listener._cleanUp();
          reject(new CancelledError());
        },
        _cleanUp() {
          signal.removeEventListener("abort", listener._abortListener);
          webProgress.removeProgressListener(this);
          window.close();
        },
        _checkForRedirect(currentUrl) {
          if (!currentUrl.startsWith(InteractiveBrowser.COMPLETION_URL)) {
            return;
          }
          resolve(currentUrl);

          this._cleanUp();
        },
        onStateChange(aWebProgress, request, stateFlags) {
          const wpl = Ci.nsIWebProgressListener;
          if (stateFlags & (wpl.STATE_START | wpl.STATE_IS_NETWORK)) {
            try {
              this._checkForRedirect(request.name);
            } catch (error) {
              // Ignore |name| not implemented exception
              if (error.result !== Cr.NS_ERROR_NOT_IMPLEMENTED) {
                throw error;
              }
            }
          }
        },
        onLocationChange(webProgress, request, location) {
          this._checkForRedirect(location.spec);
        },
        onProgressChange() {},
        onStatusChange() {},
        onSecurityChange() {},
      };

      if (signal.aborted) {
        reject(new CancelledError());
        return;
      }
      signal.addEventListener("abort", listener._abortListener);
      webProgress.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_ALL);
      const browser = window.document.getElementById("requestFrame");
      if (browser.currentURI.spec) {
        listener._checkForRedirect(browser.currentURI.spec);
      }
    });
  },
};
