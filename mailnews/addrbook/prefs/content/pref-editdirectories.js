/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mail/components/addrbook/content/abCommon.js */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

window.addEventListener("DOMContentLoaded", onInitEditDirectories);

// Listener to refresh the list items if something changes. In all these
// cases we just rebuild the list as it is easier than searching/adding in the
// correct places an would be an infrequent operation.
var gAddressBookAbListener = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  init() {
    for (const topic of [
      "addrbook-directory-created",
      "addrbook-directory-updated",
      "addrbook-directory-deleted",
    ]) {
      Services.obs.addObserver(this, topic, true);
    }
  },

  observe(subject) {
    subject.QueryInterface(Ci.nsIAbDirectory);
    fillDirectoryList(subject);
  },
};

function onInitEditDirectories() {
  // If the pref is locked disable the "Add" button
  if (Services.prefs.prefIsLocked("ldap_2.disable_button_add")) {
    document.getElementById("addButton").setAttribute("disabled", true);
  }

  // Fill out the directory list
  fillDirectoryList();

  // Add a listener so we can update correctly if the list should change
  gAddressBookAbListener.init();
}

function fillDirectoryList(aItem = null) {
  var abList = document.getElementById("directoriesList");

  // Empty out anything in the list
  while (abList.hasChildNodes()) {
    abList.lastChild.remove();
  }

  // Init the address book list
  const holdingArray = [];
  for (const ab of MailServices.ab.directories) {
    if (ab.isRemote) {
      holdingArray.push(ab);
    }
  }

  holdingArray.sort(function (a, b) {
    return a.dirName.localeCompare(b.dirName);
  });

  holdingArray.forEach(function (ab) {
    const item = document.createXULElement("richlistitem");
    const label = document.createXULElement("label");
    label.setAttribute("value", ab.dirName);
    item.appendChild(label);
    item.setAttribute("value", ab.URI);

    abList.appendChild(item);
  });

  // Forces the focus back on the list and on the first item.
  // We also select an edited or recently added item.
  abList.focus();
  if (aItem) {
    abList.selectedIndex = holdingArray.findIndex(d => {
      return d && d.URI == aItem.URI;
    });
  }
}

function selectDirectory() {
  var abList = document.getElementById("directoriesList");
  var editButton = document.getElementById("editButton");
  var removeButton = document.getElementById("removeButton");

  if (abList && abList.selectedItem) {
    editButton.removeAttribute("disabled");

    // If the disable delete button pref for the selected directory is set,
    // disable the delete button for that directory.
    const ab = MailServices.ab.getDirectory(abList.value);
    const disable = Services.prefs.getBoolPref(
      ab.dirPrefId + ".disable_delete",
      false
    );
    if (disable) {
      removeButton.setAttribute("disabled", true);
    } else {
      removeButton.removeAttribute("disabled");
    }
  } else {
    editButton.setAttribute("disabled", true);
    removeButton.setAttribute("disabled", true);
  }
}

function dblClickDirectory(event) {
  // We only care about left click events.
  if (event.button != 0) {
    return;
  }

  editDirectory();
}

function addDirectory() {
  parent.gSubDialog.open(
    "chrome://messenger/content/addressbook/pref-directory-add.xhtml",
    { features: "resizable=no" }
  );
}

function editDirectory() {
  var abList = document.getElementById("directoriesList");

  if (abList && abList.selectedItem) {
    const abURI = abList.value;
    const ab = MailServices.ab.getDirectory(abURI);

    parent.gSubDialog.open(
      "chrome://messenger/content/addressbook/pref-directory-add.xhtml",
      { features: "resizable=no" },
      { selectedDirectory: ab }
    );
  }
}

async function removeDirectory() {
  const abList = document.getElementById("directoriesList");

  if (!abList.selectedItem) {
    return;
  }

  const directory = GetDirectoryFromURI(abList.value);
  if (
    !directory ||
    ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(
      directory.dirPrefId
    )
  ) {
    return;
  }

  let action = "delete-book";
  if (directory.isMailList) {
    action = "delete-lists";
  } else if (
    [
      Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE,
      Ci.nsIAbManager.LDAP_DIRECTORY_TYPE,
    ].includes(directory.dirType)
  ) {
    action = "remove-remote-book";
  }

  const [title, message] = await document.l10n.formatValues([
    { id: `about-addressbook-confirm-${action}-title`, args: { count: 1 } },
    {
      id: `about-addressbook-confirm-${action}`,
      args: { name: directory.dirName, count: 1 },
    },
  ]);

  if (Services.prompt.confirm(window, title, message)) {
    MailServices.ab.deleteAddressBook(directory.URI);
  }
}
