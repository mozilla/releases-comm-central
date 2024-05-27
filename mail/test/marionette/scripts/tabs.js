/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Wait for all content tabs to finish loading, then return the important
 * properties of each open tab in the current window.
 */

/* globals arguments */

const [resolve] = arguments;
const tabmail = document.getElementById("tabmail");
const loadPromises = [];

for (const tab of tabmail.tabInfo) {
  if (tab.mode.name != "contentTab") {
    continue;
  }
  if (tab.browser.isLoadingDocument) {
    loadPromises.push(
      new Promise(function (resolve) {
        tab.browser.addEventListener("load", resolve, {
          once: true,
          capture: true,
        });
      })
    );
  }
}

Promise.all(loadPromises).then(() => {
  resolve(
    tabmail.tabInfo.map(tab => {
      const data = { mode: tab.mode.name };
      if (tab.browser) {
        data.url = tab.browser.currentURI?.spec;
      }
      if (tab.mode.name == "contentTab") {
        // How we handle clicks on links in this tab.
        data.linkHandler = tab.browser.getAttribute("messagemanagergroup");
        // The user context (container in Firefox terms) of this tab.
        if (tab.browser.hasAttribute("usercontextid")) {
          data.userContextId = tab.browser.getAttribute("usercontextid");
        }
      }
      return data;
    })
  );
});
