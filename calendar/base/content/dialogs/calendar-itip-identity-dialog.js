/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global addMenuItem */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

/**
 * Populates the identity menu list with the available identities.
 */
function onLoad() {
  let identityMenu = document.getElementById("identity-menu");

  for (let identity of MailServices.accounts.allIdentities) {
    let menuitem = addMenuItem(identityMenu, identity.fullAddress, identity.fullAddress);
    menuitem.identity = identity;
  }

  identityMenu.selectedIndex = 0;

  document.addEventListener("dialogaccept", () => {
    window.arguments[0].onOk(identityMenu.selectedItem.identity);
  });

  document.addEventListener("dialogcancel", window.arguments[0].onCancel);
}

window.addEventListener("load", onLoad);
