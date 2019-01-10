/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals browser */

(async () => {
  for (let element of document.querySelectorAll("[data-message]")) {
    element.textContent = browser.i18n.getMessage(element.dataset.message);
  }

  let resp = await fetch("https://backgrounds.wetransfer.net/moment/list.json");
  let items = await resp.json();
  let item = items[Math.floor(Math.random() * items.length)];
  if (item.url.startsWith("https:") && item.file.startsWith("https:")) {
    document.getElementById("background").src = item.file;
    document.getElementById("story").href = item.url;
    document.getElementById("title").textContent = item.title;
  }
})();
