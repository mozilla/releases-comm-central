/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MailE10SUtils"];

const { E10SUtils } = ChromeUtils.import(
  "resource://gre/modules/E10SUtils.jsm"
);
const { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var MailE10SUtils = {
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
      browser.destroy();

      if (shouldBeRemote) {
        browser.setAttribute("remote", "true");
        browser.setAttribute("remoteType", remoteType);
      } else {
        browser.setAttribute("remote", "false");
        browser.removeAttribute("remoteType");
      }

      browser.changeRemoteness({ remoteType });
      browser.construct();

      ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
    }

    params.triggeringPrincipal =
      params.triggeringPrincipal ||
      Services.scriptSecurityManager.getSystemPrincipal();
    browser.loadURI(uri, params);
  },
};
