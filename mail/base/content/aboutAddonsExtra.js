/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/extensions/content/aboutaddons.js */

const THUNDERBIRD_THEME_PREVIEWS = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-light.svg",
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-dark.svg",
  ],
]);

/* This file runs in both the outer window, which controls the categories list, search bar, etc.,
 * and the inner window which is the list of add-ons or the detail view. */
(async function() {
  if (window.location.href == "about:addons") {
    let contentStylesheet = document.createProcessingInstruction(
      "xml-stylesheet",
      'href="chrome://messenger/content/aboutAddonsExtra.css" type="text/css"'
    );
    document.insertBefore(contentStylesheet, document.documentElement);

    // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
    let browser = document.getElementById("html-view-browser");
    if (!/(interactive|complete)/.test(browser.contentDocument.readyState)) {
      await new Promise(resolve =>
        browser.contentWindow.addEventListener("DOMContentLoaded", resolve, {
          once: true,
        })
      );
    }

    let textbox = browser.contentDocument.getElementById("search-addons");
    let placeholder = textbox.getAttribute("placeholder");
    placeholder = placeholder.replace(
      "addons.mozilla.org",
      "addons.thunderbird.net"
    );
    textbox.setAttribute("placeholder", placeholder);
    return;
  }

  window.isCorrectlySigned = function() {
    return true;
  };

  delete window.browserBundle;
  window.browserBundle = Services.strings.createBundle(
    "chrome://messenger/locale/addons.properties"
  );

  let _getScreenshotUrlForAddon = getScreenshotUrlForAddon;
  getScreenshotUrlForAddon = function(addon) {
    if (THUNDERBIRD_THEME_PREVIEWS.has(addon.id)) {
      return THUNDERBIRD_THEME_PREVIEWS.get(addon.id);
    }
    return _getScreenshotUrlForAddon(addon);
  };
})();
