/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When the dialog window loads, add a stylesheet to the shadow DOM of the
 * dialog to style the accept and cancel buttons, etc.
 */
window.addEventListener("load", () => {
  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", "chrome://messenger/skin/themeableDialog.css");
  document.querySelector("dialog").shadowRoot.appendChild(link);
});
