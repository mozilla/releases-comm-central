/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var { OTRLibLoader } = ChromeUtils.importESModule(
  "resource:///modules/OTRLib.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.sys.mjs",
});

/**
 * Populates the "Mail Libraries" section of the troubleshooting information page.
 */
function populateLibrarySection() {
  const { min_version, loaded_version, status, path } =
    BondOpenPGP.getRNPLibStatus();

  document.getElementById("rnp-expected-version").textContent = min_version;
  document.getElementById("rnp-loaded-version").textContent = loaded_version;
  document.getElementById("rnp-path").textContent = path;
  document.l10n.setAttributes(document.getElementById("rnp-status"), status);

  document.getElementById("otr-path").textContent = OTRLibLoader.libotrPath;
  document.l10n.setAttributes(
    document.getElementById("otr-status"),
    OTRLibLoader.status
  );
}
