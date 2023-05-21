/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
});

/**
 * Populates the "Mail Libraries" section of the troubleshooting information page.
 */
function populateLibrarySection() {
  let { min_version, loaded_version, status, path } =
    BondOpenPGP.getRNPLibStatus();

  document.getElementById("rnp-expected-version").textContent = min_version;
  document.getElementById("rnp-loaded-version").textContent = loaded_version;
  document.getElementById("rnp-path").textContent = path;
  document.l10n.setAttributes(document.getElementById("rnp-status"), status);
}
