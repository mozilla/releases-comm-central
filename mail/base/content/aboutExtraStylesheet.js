/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(async function () {
  // Add the variables stylesheet.
  const contentStylesheet = document.createElement("link");
  contentStylesheet.rel = "stylesheet";
  contentStylesheet.href = "chrome://messenger/skin/aboutExtra.css";
  document.head.appendChild(contentStylesheet);
})();
