/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global addMenuItem */

var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

/**
 * @callback onOkCallback
 * @param {nsIMsgIdentity} identity - The identity the user selected.
 */

/**
 * @typdef {object} CalendarItipIdentityDialogArgs
 * @property {nsIMsgIdentity[]} identities - List of identities to select from.
 * @property {number} responseMode         - One of the response mode constants
 *                                           from calIItipItem indicating the
 *                                           mode the user choose.
 * @property {Function} onCancel           - Called when the user clicks cancel.
 * @property {onOkCallback} onOk           - Called when the user selects an
 *                                           identity.
 */

/**
 * Populates the identity menu list with the available identities.
 */
function onLoad() {
  const label = document.getElementById("identity-menu-label");
  document.l10n.setAttributes(
    label,
    window.arguments[0].responseMode == Ci.calIItipItem.NONE
      ? "calendar-itip-identity-label-none"
      : "calendar-itip-identity-label"
  );

  const identityMenu = document.getElementById("identity-menu");
  for (const identity of window.arguments[0].identities) {
    const menuitem = addMenuItem(identityMenu, identity.fullAddress, identity.fullAddress);
    menuitem.identity = identity;
  }

  identityMenu.selectedIndex = 0;

  document.addEventListener("dialogaccept", () => {
    window.arguments[0].onOk(identityMenu.selectedItem.identity);
  });

  document.addEventListener("dialogcancel", window.arguments[0].onCancel);
}

window.addEventListener("load", onLoad);
