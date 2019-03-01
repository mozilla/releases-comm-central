/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["getHiddenHTMLWindow"];

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "hiddenWindow", () =>
  Services.appShell.hiddenDOMWindow
);

function getHiddenHTMLWindow() {
  if (Services.appinfo.OS == "Darwin") {
    let browser = hiddenWindow.document.getElementById("hiddenBrowser");
    return browser.docShell ? browser.contentWindow : hiddenWindow;
  }
  return hiddenWindow;
}
