/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("DOMContentLoaded", onLoad, { once: true });
function onLoad() {
  let { calendarName, originalURI, targetURI } = window.arguments[0];

  document.l10n.setAttributes(
    document.getElementById("calendar-uri-redirect-description"),
    "calendar-uri-redirect-description",
    { calendarName }
  );

  document.getElementById("originalURI").textContent = originalURI;
  document.getElementById("targetURI").textContent = targetURI;
  window.sizeToContent();
}

document.addEventListener("dialogaccept", () => {
  window.arguments[0].returnValue = true;
});

document.addEventListener("dialogcancel", () => {
  window.arguments[0].returnValue = false;
});
