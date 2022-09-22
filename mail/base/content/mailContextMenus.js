/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from mailWindow.js */
/* import-globals-from nsContextMenu.js */

var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gContextMenu;

/**
 * Function to clear out the global nsContextMenu.
 *
 * @param {Event} event - The onpopuphiding event.
 */
function mailContextOnPopupHiding(aEvent) {
  // Don't do anything if it's a submenu's onpopuphiding that's just bubbling
  // up to the top.
  if (aEvent.target != aEvent.currentTarget) {
    return;
  }

  gContextMenu.hiding();
  gContextMenu = null;
}

/**
 * Function to set the global nsContextMenu.
 *
 * @param {Event} event - The onpopupshowing event.
 */
function fillMailContextMenu(event) {
  gContextMenu = new nsContextMenu(event.target, event.shiftKey);
  return gContextMenu.shouldDisplay;
}

// message pane context menu helper methods
function addEmail(url = gContextMenu.linkURL) {
  let addresses = getEmail(url);
  toAddressBook({
    action: "create",
    address: addresses,
  });
}

function composeEmailTo(linkURL, identity) {
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  fields.to = getEmail(linkURL);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  if (identity) {
    params.identity = identity;
  } else if (gFolderDisplay?.displayedFolder) {
    params.identity = accountManager.getFirstIdentityForServer(
      gFolderDisplay.displayedFolder.server
    );
  }
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

// Extracts email address from url string
function getEmail(url) {
  var mailtolength = 7;
  var qmark = url.indexOf("?");
  var addresses;

  if (qmark > mailtolength) {
    addresses = url.substring(mailtolength, qmark);
  } else {
    addresses = url.substr(mailtolength);
  }
  // Let's try to unescape it using a character set
  try {
    addresses = Services.textToSubURI.unEscapeURIForUI(addresses);
  } catch (ex) {
    // Do nothing.
  }
  return addresses;
}
