/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

var gAccount, gServer, gDialog, gRelatedItems;

window.addEventListener("DOMContentLoaded", onLoad);
document.addEventListener("dialogdisclosure", showInfo);
document.addEventListener("dialogaccept", onAccept);
document.subDialogSetDefaultFocus = () => {
  gDialog.getButton("cancel").focus();
  delete document.subDialogSetDefaultFocus;
};

async function onLoad() {
  gAccount = window.arguments[0].account;
  gServer = gAccount.incomingServer;
  gDialog = document.querySelector("dialog");

  document.l10n.setAttributes(
    gDialog.getButton("accept"),
    "remove-account-dialog-accept"
  );

  document.l10n.setAttributes(
    document.getElementById("accountName"),
    "remove-account-question",
    { accountName: gServer.prettyName }
  );

  // Allow to remove account data if it has a local storage.
  const localDirectory = gServer.localPath;
  if (localDirectory && localDirectory.exists()) {
    localDirectory.normalize();

    // Do not allow removal if localPath is outside of profile folder.
    const profilePath = Services.dirsvc.get("ProfD", Ci.nsIFile);
    profilePath.normalize();

    // TODO: bug 77652, decide what to do for deferred accounts.
    // And inform the user if the account localPath is outside the profile.
    if (
      gServer.isDeferredTo ||
      (gServer instanceof Ci.nsIPop3IncomingServer &&
        gServer.deferredToAccount) ||
      !profilePath.contains(localDirectory)
    ) {
      document.getElementById("removeData").disabled = true;
    }
  } else {
    document.getElementById("removeDataPossibility").collapsed = true;
  }

  document.l10n.setAttributes(
    document.getElementById("removeData"),
    gServer.type == "im" ? "remove-chat-data-checkbox" : "remove-data-checkbox"
  );

  const formatter = new Intl.ListFormat(undefined, {
    style: "long",
    type: "conjunction",
  });

  gRelatedItems = await MailUtils.findRelatedItems(gAccount);
  const { outgoingServers, addressBooks, calendars, logins } = gRelatedItems;
  if (outgoingServers.size) {
    const section = document.getElementById("removeOutgoingsPossibility");
    document.l10n.setAttributes(
      section.querySelector("checkbox"),
      "remove-outgoing-servers-checkbox",
      { count: outgoingServers.size }
    );
    section.querySelector("description").textContent = formatter.format(
      Array.from(outgoingServers, o => o.description || o.username)
    );
    section.collapsed = false;
  }
  if (addressBooks.size) {
    const section = document.getElementById("removeAddressBooksPossibility");
    document.l10n.setAttributes(
      section.querySelector("checkbox"),
      "remove-address-books-checkbox",
      { count: addressBooks.size }
    );
    section.querySelector("description").textContent = formatter.format(
      Array.from(addressBooks, b => b.dirName)
    );
    section.collapsed = false;
  }
  if (calendars.size) {
    const section = document.getElementById("removeCalendarsPossibility");
    document.l10n.setAttributes(
      section.querySelector("checkbox"),
      "remove-calendars-checkbox",
      { count: calendars.size }
    );
    section.querySelector("description").textContent = formatter.format(
      Array.from(calendars, c => c.name)
    );
    section.collapsed = false;
  }
  if (logins.size) {
    const section = document.getElementById("removeLoginsPossibility");
    section.collapsed = false;
  }

  updateItems();

  if (document.readyState == "complete") {
    await document.l10n.translateRoots();
    window.sizeToContent();
    parent.gSubDialog._topDialog.resizeDialog();
  }

  document
    .getElementById("removeAccountSection")
    .addEventListener("command", onCommand);
  window.dispatchEvent(new CustomEvent("relatedItemsLoaded"));
}

function onCommand(event) {
  if (event.target.id == "showLocalDirectory") {
    openLocalDirectory();
  } else {
    updateItems();
  }
}

function updateItems() {
  if (gRelatedItems.logins.length == 0) {
    return;
  }

  const itemsToRemove = new Set([gAccount]);
  if (document.getElementById("removeOutgoings").checked) {
    for (const o of gRelatedItems.outgoingServers) {
      itemsToRemove.add(o);
    }
  }
  if (document.getElementById("removeAddressBooks").checked) {
    for (const b of gRelatedItems.addressBooks) {
      itemsToRemove.add(b);
    }
  }
  if (document.getElementById("removeCalendars").checked) {
    for (const c of gRelatedItems.calendars) {
      itemsToRemove.add(c);
    }
  }
  const loginsToRemove = new Set();
  for (const [l, items] of gRelatedItems.logins) {
    if (items.difference(itemsToRemove).size == 0) {
      loginsToRemove.add(l);
    }
  }

  const checkbox = document.getElementById("removeLogins");
  document.l10n.setAttributes(
    checkbox,
    gServer.authMethod == Ci.nsMsgAuthMethod.OAuth2
      ? "remove-oauth-tokens-checkbox"
      : "remove-passwords-checkbox",
    { count: loginsToRemove.size || 1 }
  );
  checkbox.disabled = loginsToRemove.size == 0;
}

/**
 * Show the local directory.
 */
function openLocalDirectory() {
  const nsLocalFile = Components.Constructor(
    "@mozilla.org/file/local;1",
    "nsIFile",
    "initWithPath"
  );
  const localDir = gServer.localPath.path;
  try {
    new nsLocalFile(localDir).reveal();
  } catch (e) {
    // Reveal may fail e.g. on Linux, then just show the path as a string.
    document.getElementById("localDirectory").value = localDir;
    document.getElementById("localDirectory").collapsed = false;
  }
}

function showInfo() {
  const descs = document.querySelectorAll("vbox.indent");
  for (const desc of descs) {
    desc.collapsed = false;
  }

  if (gServer.type == "imap" || gServer.type == "nntp") {
    document.getElementById("serverAccount").collapsed = false;
  } else if (gServer.type == "im") {
    document.getElementById("chatAccount").collapsed = false;
  } else {
    document.getElementById("localAccount").collapsed = false;
  }

  parent.gSubDialog._topDialog.resizeDialog();
  gDialog.getButton("disclosure").blur();
  gDialog.getButton("disclosure").hidden = true;
}

async function removeAccount() {
  try {
    // Remove account
    const removeData = document.getElementById("removeData").checked;
    MailServices.accounts.removeAccount(gAccount, removeData);
    window.arguments[0].result = true;

    const itemsRemoved = new Set([gAccount]);
    if (document.getElementById("removeOutgoings").checked) {
      for (const o of gRelatedItems.outgoingServers) {
        MailServices.outgoingServer.deleteServer(o);
        itemsRemoved.add(o);
      }
    }
    if (document.getElementById("removeAddressBooks").checked) {
      for (const b of gRelatedItems.addressBooks) {
        MailServices.ab.deleteAddressBook(b.URI);
        itemsRemoved.add(b);
      }
    }
    if (document.getElementById("removeCalendars").checked) {
      for (const c of gRelatedItems.calendars) {
        cal.manager.removeCalendar(c);
        itemsRemoved.add(c);
      }
    }
    const removeLogins = document.getElementById("removeLogins");
    if (!removeLogins.disabled && removeLogins.checked) {
      for (const [guid, items] of gRelatedItems.logins) {
        if (items.difference(itemsRemoved).size == 0) {
          const [login] = await Services.logins.searchLoginsAsync({ guid });
          if (login) {
            Services.logins.removeLoginAsync(login);
          }
        }
      }
    }

    document.getElementById("success").hidden = false;
  } catch (ex) {
    document.getElementById("failure").hidden = false;
    console.error("Failure to remove account: ", ex);
    window.arguments[0].result = false;
  }
}

function onAccept(event) {
  // If Cancel is disabled, we already tried to remove the account
  // and can only close the dialog.
  if (gDialog.getButton("cancel").disabled) {
    return;
  }

  const acceptButton = gDialog.getButton("accept");
  acceptButton.disabled = true;
  gDialog.getButton("cancel").disabled = true;
  gDialog.getButton("disclosure").disabled = true;

  // Change the "Remove" to an "OK" button by clearing the custom label.
  delete acceptButton.dataset.l10nId;
  acceptButton.removeAttribute("label");
  acceptButton.removeAttribute("accesskey");
  gDialog.buttons = "accept";

  document.getElementById("removeAccountSection").hidden = true;
  document.getElementById("confirmationSection").hidden = false;
  window.sizeToContent();

  event.preventDefault();
  removeAccount().then(() => {
    acceptButton.disabled = false;
  });
}
