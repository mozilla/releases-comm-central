/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.onload = function () {
  document.getElementById("link-webservices")
          .addEventListener("click", function () {
    document.getElementById("webservices-container").hidden = false;
  });
  document.getElementById("link-disabling-webservices")
          .addEventListener("click", function () {
    document.getElementById("disabling-webservices-container").hidden = false;
  });
}
