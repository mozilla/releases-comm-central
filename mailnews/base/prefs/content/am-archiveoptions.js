/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gIdentity = null;

window.addEventListener("load", onLoadArchiveOptions);
document.addEventListener("dialogaccept", onAcceptArchiveOptions);

/**
 * Load the archive options dialog, set the radio/checkbox items to the
 * appropriate values, and update the archive hierarchy example.
 */
function onLoadArchiveOptions() {
  // extract the account
  gIdentity = window.arguments[0].identity;

  const granularity = document.getElementById("archiveGranularity");
  granularity.selectedIndex = gIdentity.archiveGranularity;
  granularity.addEventListener("command", updateArchiveExample);

  const kfs = document.getElementById("archiveKeepFolderStructure");
  kfs.checked = gIdentity.archiveKeepFolderStructure;
  kfs.addEventListener("command", updateArchiveExample);

  const ri = document.getElementById("archiveRecreateInbox");
  ri.checked = gIdentity.archiveRecreateInbox;
  ri.addEventListener("command", updateArchiveExample);

  updateArchiveExample();
}

/**
 * Save the archive settings to the current identity.
 */
function onAcceptArchiveOptions() {
  gIdentity.archiveGranularity =
    document.getElementById("archiveGranularity").selectedIndex;
  gIdentity.archiveKeepFolderStructure = document.getElementById(
    "archiveKeepFolderStructure"
  ).checked;
  gIdentity.archiveRecreateInbox = document.getElementById(
    "archiveRecreateInbox"
  ).checked;
}

/**
 * Update the example tree to show what the current options would look like,
 * and set the state of the "Recreate inbox" checkbox.
 */
function updateArchiveExample() {
  const granularity =
    document.getElementById("archiveGranularity").selectedIndex;
  const kfs = document.getElementById("archiveKeepFolderStructure");
  const ri = document.getElementById("archiveRecreateInbox");
  const hierarchy = [
    document.getElementsByClassName("root"),
    document.getElementsByClassName("year"),
    document.getElementsByClassName("month"),
  ];

  // First, show/hide the appropriate levels in the hierarchy and turn the
  // necessary items into containers.
  for (let i = 0; i < hierarchy.length; i++) {
    for (let j = 0; j < hierarchy[i].length; j++) {
      hierarchy[i][j].setAttribute("container", granularity > i);
      hierarchy[i][j].setAttribute("open", granularity > i);
      hierarchy[i][j].hidden = granularity < i;
    }
  }

  // Next, handle the "keep folder structures" case by moving a tree item around
  // and making sure its parent is a container.
  const inboxFolder = document.getElementById("inboxFolder");
  const siblingFolder = document.getElementById("siblingFolder");
  const childFolder = document.getElementById("childFolder");
  inboxFolder.hidden = !kfs.checked || !ri.checked;
  siblingFolder.hidden = !kfs.checked;
  childFolder.hidden = !kfs.checked;
  if (kfs.checked) {
    const parent = hierarchy[granularity][0];
    parent.setAttribute("container", true);
    parent.setAttribute("open", true);
    let childFolderParent = parent;
    if (ri.checked) {
      parent.children[1].appendChild(inboxFolder);
      childFolderParent = inboxFolder;
    }
    parent.children[1].appendChild(siblingFolder);
    inboxFolder.setAttribute("container", ri.checked);
    inboxFolder.setAttribute("open", ri.checked);
    childFolderParent.children[0].appendChild(childFolder);
  }

  // Disable "recreate inbox" if necessary.
  ri.setAttribute("disabled", !kfs.checked);
}
