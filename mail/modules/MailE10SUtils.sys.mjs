/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";

import { ExtensionParent } from "resource://gre/modules/ExtensionParent.sys.mjs";

export var MailE10SUtils = {
  /**
   * Loads about:blank in `browser` without switching remoteness. about:blank
   * can load in a local browser or a remote browser, and `loadURI` will make
   * it load in a remote browser even if you don't want it to.
   *
   * @param {nsIBrowser} browser
   */
  loadAboutBlank(browser) {
    if (!browser.currentURI || browser.currentURI.spec == "about:blank") {
      return;
    }
    browser.loadURI(Services.io.newURI("about:blank"), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      remoteTypeOverride: browser.remoteType,
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
    const multiProcess = browser.ownerGlobal.docShell.QueryInterface(
      Ci.nsILoadContext
    ).useRemoteTabs;
    const remoteSubframes = browser.ownerGlobal.docShell.QueryInterface(
      Ci.nsILoadContext
    ).useRemoteSubframes;

    const isRemote = browser.getAttribute("remote") == "true";
    const remoteType = E10SUtils.getRemoteTypeForURI(
      uri,
      multiProcess,
      remoteSubframes
    );
    const shouldBeRemote = remoteType !== E10SUtils.NOT_REMOTE;

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
   * @see E10SUtils.sys.mjs for remote types.
   *
   * @param {nsIBrowser} browser - the browser to enforce the remoteness of.
   * @param {string} remoteType - the remoteness to enforce.
   * @returns {boolean} true if any change happened on the browser (which would
   *    not be the case if its remoteness is already in the correct state).
   */
  changeRemoteness(browser, remoteType) {
    if (browser.remoteType == remoteType) {
      return false;
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

    return true;
  },
};
