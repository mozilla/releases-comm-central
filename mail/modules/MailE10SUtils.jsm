/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MailE10SUtils"];

const { E10SUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/E10SUtils.sys.mjs"
);
const { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

var MailE10SUtils = {
  /**
   * Loads about:blank in `browser` without switching remoteness. about:blank
   * can load in a local browser or a remote browser, and `loadURI` will make
   * it load in a remote browser even if you don't want it to.
   *
   * @param {nsIBrowser} browser
   */
  loadAboutBlank(browser) {
    browser.loadURI(Services.io.newURI("about:blank"), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  },

  /**
   * Loads `uri` in `browser`, changing to a remote/local browser if necessary.
   *
   * @see `nsIWebNavigation.loadURI`
   *
   * @param {nsIBrowser} browser
   * @param {string} uri
   * @param {object} params
   */
  loadURI(browser, uri, params = {}) {
    let multiProcess = browser.ownerGlobal.docShell.QueryInterface(
      Ci.nsILoadContext
    ).useRemoteTabs;
    let remoteSubframes = browser.ownerGlobal.docShell.QueryInterface(
      Ci.nsILoadContext
    ).useRemoteSubframes;

    let isRemote = browser.getAttribute("remote") == "true";
    let remoteType = E10SUtils.getRemoteTypeForURI(
      uri,
      multiProcess,
      remoteSubframes
    );
    let shouldBeRemote = remoteType !== E10SUtils.NOT_REMOTE;

    if (shouldBeRemote != isRemote) {
      this.changeRemoteness(browser, remoteType);
    }

    params.triggeringPrincipal =
      params.triggeringPrincipal ||
      Services.scriptSecurityManager.getSystemPrincipal();
    browser.fixupAndLoadURIString(uri, params);
  },

  /**
   * Force `browser` to be a remote/local browser.
   *
   * @see E10SUtils.jsm for remote types.
   *
   * @param {nsIBrowser} browser
   * @param {string} remoteType
   */
  changeRemoteness(browser, remoteType) {
    if (browser.remoteType == remoteType) {
      return;
    }

    browser.destroy();

    if (remoteType) {
      browser.setAttribute("remote", "true");
      browser.setAttribute("remoteType", remoteType);
    } else {
      browser.setAttribute("remote", "false");
      browser.removeAttribute("remoteType");
    }

    browser.changeRemoteness({ remoteType });
    browser.construct();
    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
  },
};
