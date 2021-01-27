/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from retention.js */
/* global BigInt */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");

var gFolderTreeView;
var gMsgFolder;
var gLockedPref = null;
var kCurrentColor = "";
var kDefaultColor = "#363959";
var gNeedToRestoreFolderSelection = false;

document.addEventListener("dialogaccept", folderPropsOKButton);
document.addEventListener("dialogcancel", folderCancelButton);

// The folderPropsSink is the class that gets notified of an imap folder's properties

var gFolderPropsSink = {
  setFolderType(folderTypeString) {
    var typeLabel = document.getElementById("folderType.text");
    if (typeLabel) {
      typeLabel.setAttribute("value", folderTypeString);
    }
    // get the element for the folder type label and set value on it.
  },

  setFolderTypeDescription(folderDescription) {
    var folderTypeLabel = document.getElementById("folderDescription.text");
    if (folderTypeLabel) {
      folderTypeLabel.setAttribute("value", folderDescription);
    }
  },

  setFolderPermissions(folderPermissions) {
    var permissionsLabel = document.getElementById("folderPermissions.text");
    var descTextNode = document.createTextNode(folderPermissions);
    permissionsLabel.appendChild(descTextNode);
  },

  serverDoesntSupportACL() {
    var typeLabel = document.getElementById("folderTypeLabel");
    if (typeLabel) {
      typeLabel.setAttribute("hidden", "true");
    }
    var permissionsLabel = document.getElementById("permissionsDescLabel");
    if (permissionsLabel) {
      permissionsLabel.setAttribute("hidden", "true");
    }
  },

  setQuotaStatus(folderQuotaStatus) {
    var quotaStatusLabel = document.getElementById("folderQuotaStatus");
    if (quotaStatusLabel) {
      quotaStatusLabel.setAttribute("value", folderQuotaStatus);
    }
  },

  showQuotaData(showData) {
    var quotaStatusLabel = document.getElementById("folderQuotaStatus");
    var folderQuotaData = document.getElementById("folderQuotaData");

    if (quotaStatusLabel && folderQuotaData) {
      quotaStatusLabel.hidden = showData;
      folderQuotaData.hidden = !showData;
    }
  },

  setQuotaData(folderQuota) {
    let quotaDetails = document.getElementById("quotaDetails");
    let bundle = document.getElementById("bundle_messenger");
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );

    for (let quota of folderQuota) {
      let li = document.createElement("li");
      let name = document.createElement("span");
      name.textContent = quota.name;
      li.appendChild(name);

      let progress = document.createElement("progress");
      progress.classList.add("quota-percentage");
      progress.setAttribute("value", quota.usage);
      progress.setAttribute("max", quota.limit);

      li.appendChild(progress);

      let percentage = document.createElement("span");
      percentage.textContent = bundle.getFormattedString("quotaPercentUsed", [
        Number((100n * BigInt(quota.usage)) / BigInt(quota.limit)),
      ]);
      li.appendChild(percentage);

      li.appendChild(document.createTextNode(" — "));

      let details = document.createElement("span");
      if (/STORAGE/i.test(quota.name)) {
        let usage = messenger.formatFileSize(quota.usage * 1024);
        let limit = messenger.formatFileSize(quota.limit * 1024);
        details.textContent = `${usage} / ${limit}`;
      } else {
        details.textContent = `${quota.usage} / ${quota.limit}`;
      }
      li.appendChild(details);

      quotaDetails.appendChild(li);
    }
  },
};

function doEnabling() {
  var nameTextbox = document.getElementById("name");
  document
    .querySelector("dialog")
    .getButton("accept").disabled = !nameTextbox.value;
}

/**
 * Clear the tree selection if the user opens the color picker in order to
 * guarantee a proper color preview of the highlighted tree item.
 */
function inputColorClicked() {
  window.arguments[0].clearFolderSelectionCallback();
  gNeedToRestoreFolderSelection = true;
}

/**
 * Reset the folder color to the default value.
 */
function resetColor() {
  inputColorClicked();
  document.getElementById("color").value = kDefaultColor;
  window.arguments[0].previewSelectedColorCallback(gMsgFolder, null);
}

function folderPropsOKButton(event) {
  if (gMsgFolder) {
    if (
      document.getElementById("offline.selectForOfflineFolder").checked ||
      document.getElementById("offline.selectForOfflineNewsgroup").checked
    ) {
      gMsgFolder.setFlag(Ci.nsMsgFolderFlags.Offline);
    } else {
      gMsgFolder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    }

    if (document.getElementById("folderCheckForNewMessages").checked) {
      gMsgFolder.setFlag(Ci.nsMsgFolderFlags.CheckNew);
    } else {
      gMsgFolder.clearFlag(Ci.nsMsgFolderFlags.CheckNew);
    }

    let glodaCheckbox = document.getElementById("folderIncludeInGlobalSearch");
    if (!glodaCheckbox.hidden) {
      if (glodaCheckbox.checked) {
        // We pass true here so that folders such as trash and junk can still
        // have a priority set.
        Gloda.resetFolderIndexingPriority(gMsgFolder, true);
      } else {
        Gloda.setFolderIndexingPriority(
          gMsgFolder,
          Gloda.getFolderForFolder(gMsgFolder).kIndexingNeverPriority
        );
      }
    }

    var retentionSettings = saveCommonRetentionSettings(
      gMsgFolder.retentionSettings
    );
    retentionSettings.useServerDefaults = document.getElementById(
      "retention.useDefault"
    ).checked;
    gMsgFolder.retentionSettings = retentionSettings;

    // Check if the icon color was updated.
    if (
      kCurrentColor !=
      gFolderTreeView.getFolderCacheProperty(gMsgFolder, "folderIconColor")
    ) {
      window.arguments[0].updateColorCallback(gMsgFolder);
    }

    restoreFolderSelection();
  }

  try {
    // This throws an exception when an illegal folder name was entered.
    top.okCallback(
      document.getElementById("name").value,
      window.arguments[0].name,
      gMsgFolder.URI
    );
  } catch (e) {
    event.preventDefault();
  }
}

function folderCancelButton(event) {
  // Restore the icon to the previous color and discard edits.
  if (gMsgFolder && window.arguments[0].previewSelectedColorCallback) {
    window.arguments[0].previewSelectedColorCallback(gMsgFolder, kCurrentColor);
  }

  restoreFolderSelection();
}

/**
 * If the user interacted with the color picker, it means the folder was
 * deselected to ensure a proper preview of the color, so we need to re-select
 * the folder when done.
 */
function restoreFolderSelection() {
  if (
    gNeedToRestoreFolderSelection &&
    window.arguments[0].selectFolderCallback
  ) {
    window.arguments[0].selectFolderCallback(gMsgFolder);
  }
}

function folderPropsOnLoad() {
  // look in arguments[0] for parameters
  if (window.arguments && window.arguments[0]) {
    if (window.arguments[0].title) {
      document.title = window.arguments[0].title;
    }
    if (window.arguments[0].okCallback) {
      top.okCallback = window.arguments[0].okCallback;
    }
  }

  if (window.arguments[0].folder) {
    // Fill in folder name, based on what they selected in the folder pane.
    gMsgFolder = window.arguments[0].folder;
    gFolderTreeView = window.arguments[0].treeView;
    // Store the current icon color to allow discarding edits.
    kCurrentColor = gFolderTreeView.getFolderCacheProperty(
      gMsgFolder,
      "folderIconColor"
    );
  } else {
    dump("passed null for folder, do nothing\n");
  }

  if (window.arguments[0].name) {
    // Initialize name textbox with the given name and remember this
    // value so we can tell whether the folder needs to be renamed
    // when the dialog is accepted.
    var nameTextbox = document.getElementById("name");
    nameTextbox.value = window.arguments[0].name;

    // name.setSelectionRange(0,-1);
    // name.focusTextField();
  }

  const serverType = window.arguments[0].serverType;

  // Do this first, because of gloda we may want to override some of the hidden
  // statuses.
  hideShowControls(serverType);

  if (gMsgFolder) {
    // We really need a functioning database, so we'll detect problems
    // and create one if we have to.
    try {
      gMsgFolder.msgDatabase;
    } catch (e) {
      gMsgFolder.updateFolder(window.arguments[0].msgWindow);
    }

    let colorInput = document.getElementById("color");
    colorInput.value = kCurrentColor ? kCurrentColor : kDefaultColor;
    colorInput.addEventListener("input", event => {
      window.arguments[0].previewSelectedColorCallback(
        gMsgFolder,
        event.target.value
      );
    });

    var locationTextbox = document.getElementById("location");

    // Decode the displayed mailbox:// URL as it's useful primarily for debugging,
    // whereas imap and news urls are sent around.
    locationTextbox.value =
      serverType == "imap" || serverType == "nntp"
        ? gMsgFolder.folderURL
        : decodeURI(gMsgFolder.folderURL);

    if (gMsgFolder.canRename) {
      document.getElementById("name").removeAttribute("readonly");
    }

    if (gMsgFolder.getFlag(Ci.nsMsgFolderFlags.Offline)) {
      if (serverType == "imap" || serverType == "pop3") {
        document.getElementById(
          "offline.selectForOfflineFolder"
        ).checked = true;
      }

      if (serverType == "nntp") {
        document.getElementById(
          "offline.selectForOfflineNewsgroup"
        ).checked = true;
      }
    } else {
      if (serverType == "imap" || serverType == "pop3") {
        document.getElementById(
          "offline.selectForOfflineFolder"
        ).checked = false;
      }

      if (serverType == "nntp") {
        document.getElementById(
          "offline.selectForOfflineNewsgroup"
        ).checked = false;
      }
    }

    // set check for new mail checkbox
    document.getElementById(
      "folderCheckForNewMessages"
    ).checked = gMsgFolder.getFlag(Ci.nsMsgFolderFlags.CheckNew);

    // if gloda indexing is off, hide the related checkbox
    var glodaCheckbox = document.getElementById("folderIncludeInGlobalSearch");
    var glodaEnabled = Services.prefs.getBoolPref(
      "mailnews.database.global.indexer.enabled"
    );
    if (
      !glodaEnabled ||
      gMsgFolder.flags &
        (Ci.nsMsgFolderFlags.Queue | Ci.nsMsgFolderFlags.Newsgroup)
    ) {
      glodaCheckbox.hidden = true;
    } else {
      // otherwise, the user can choose whether this file gets indexed
      let glodaFolder = Gloda.getFolderForFolder(gMsgFolder);
      glodaCheckbox.checked =
        glodaFolder.indexingPriority != glodaFolder.kIndexingNeverPriority;
    }
  }

  if (serverType == "imap") {
    var imapFolder = gMsgFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
    if (imapFolder) {
      imapFolder.fillInFolderProps(gFolderPropsSink);
    }

    let users = [...imapFolder.getOtherUsersWithAccess()];
    if (users.length) {
      document.getElementById("folderOtherUsers").hidden = false;
      document.getElementById("folderOtherUsersText").textContent = users.join(
        ", "
      );
    }
  }

  var retentionSettings = gMsgFolder.retentionSettings;
  initCommonRetentionSettings(retentionSettings);
  document.getElementById("retention.useDefault").checked =
    retentionSettings.useServerDefaults;

  // set folder sizes
  let numberOfMsgs = gMsgFolder.getTotalMessages(false);
  if (numberOfMsgs >= 0) {
    document.getElementById("numberOfMessages").value = numberOfMsgs;
  }

  try {
    let sizeOnDisk = Cc["@mozilla.org/messenger;1"]
      .createInstance(Ci.nsIMessenger)
      .formatFileSize(gMsgFolder.sizeOnDisk, true);
    document.getElementById("sizeOnDisk").value = sizeOnDisk;
  } catch (e) {}

  // select the initial tab
  if (window.arguments[0].tabID) {
    try {
      document.getElementById(
        "folderPropTabBox"
      ).selectedTab = document.getElementById(window.arguments[0].tabID);
    } catch (ex) {}
  }
  onCheckKeepMsg();
  onUseDefaultRetentionSettings();
}

function hideShowControls(serverType) {
  let controls = document.querySelectorAll("[hidefor]");
  var len = controls.length;
  for (var i = 0; i < len; i++) {
    var control = controls[i];
    var hideFor = control.getAttribute("hidefor");
    if (!hideFor) {
      throw new Error("hidefor empty");
    }

    // hide unsupported server type
    // adding support for hiding multiple server types using hideFor="server1,server2"
    var hideForBool = false;
    var hideForTokens = hideFor.split(",");
    for (var j = 0; j < hideForTokens.length; j++) {
      if (hideForTokens[j] == serverType) {
        hideForBool = true;
        break;
      }
    }
    control.hidden = hideForBool;
  }

  // hide the privileges button if the imap folder doesn't have an admin url
  // maybe should leave this hidden by default and only show it in this case instead
  try {
    var imapFolder = gMsgFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
    if (imapFolder) {
      var privilegesButton = document.getElementById("imap.FolderPrivileges");
      if (privilegesButton) {
        if (!imapFolder.hasAdminUrl) {
          privilegesButton.setAttribute("hidden", "true");
        }
      }
    }
  } catch (ex) {}

  if (gMsgFolder) {
    // Hide "check for new mail" checkbox if this is an Inbox.
    if (gMsgFolder.getFlag(Ci.nsMsgFolderFlags.Inbox)) {
      document.getElementById("folderCheckForNewMessages").hidden = true;
    }
    // Retention policy doesn't apply to Drafts/Templates/Outbox.
    if (
      gMsgFolder.isSpecialFolder(
        Ci.nsMsgFolderFlags.Drafts |
          Ci.nsMsgFolderFlags.Templates |
          Ci.nsMsgFolderFlags.Queue,
        true
      )
    ) {
      document.getElementById("Retention").hidden = true;
    }
  }
}

function onOfflineFolderDownload() {
  // we need to create a progress window and pass that in as the second parameter here.
  gMsgFolder.downloadAllForOffline(null, window.arguments[0].msgWindow);
}

function onFolderPrivileges() {
  var imapFolder = gMsgFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
  if (imapFolder) {
    imapFolder.folderPrivileges(window.arguments[0].msgWindow);
  }
  // let's try closing the modal dialog to see if it fixes the various problems running this url
  window.close();
}

function onUseDefaultRetentionSettings() {
  var useDefault = document.getElementById("retention.useDefault").checked;
  document.getElementById("retention.keepMsg").disabled = useDefault;
  document.getElementById("retention.keepNewMsgMinLabel").disabled = useDefault;
  document.getElementById("retention.keepOldMsgMinLabel").disabled = useDefault;

  var keepMsg = document.getElementById("retention.keepMsg").value;
  const nsIMsgRetentionSettings = Ci.nsIMsgRetentionSettings;
  document.getElementById("retention.keepOldMsgMin").disabled =
    useDefault || keepMsg != nsIMsgRetentionSettings.nsMsgRetainByAge;
  document.getElementById("retention.keepNewMsgMin").disabled =
    useDefault || keepMsg != nsIMsgRetentionSettings.nsMsgRetainByNumHeaders;
}

function RebuildSummaryInformation() {
  window.arguments[0].rebuildSummaryCallback(gMsgFolder);
}
