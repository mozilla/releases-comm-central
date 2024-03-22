/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from retention.js */
/* global BigInt */

var { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);

var gMsgFolder;
var gLockedPref = null;

var gDefaultColor = "";

window.addEventListener("load", folderPropsOnLoad);
document.addEventListener("dialogaccept", folderPropsOKButton);
document.addEventListener("dialogcancel", folderCancelButton);

/**
 * The folderPropsSink is the class that gets notified of an imap folder's
 * properties.
 *
 * @implements {nsIMsgImapFolderProps}
 */
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
    const quotaDetails = document.getElementById("quotaDetails");
    const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );

    for (const quota of folderQuota) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = quota.name;
      li.appendChild(name);

      const progress = document.createElement("progress");
      progress.classList.add("quota-percentage");
      progress.setAttribute("value", quota.usage);
      progress.setAttribute("max", quota.limit);

      li.appendChild(progress);

      const percentage = document.createElement("span");
      document.l10n.setAttributes(percentage, "quota-percent-used", {
        percent: Number((100n * BigInt(quota.usage)) / BigInt(quota.limit)),
      });
      li.appendChild(percentage);

      li.appendChild(document.createTextNode(" — "));

      const details = document.createElement("span");
      if (/STORAGE/i.test(quota.name)) {
        const usage = messenger.formatFileSize(quota.usage * 1024);
        const limit = messenger.formatFileSize(quota.limit * 1024);
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
  document.querySelector("dialog").getButton("accept").disabled =
    !nameTextbox.value;
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

    const glodaCheckbox = document.getElementById(
      "folderIncludeInGlobalSearch"
    );
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

    let color = document.getElementById("color").value;
    if (color == gDefaultColor) {
      color = undefined;
    }
    FolderTreeProperties.setColor(gMsgFolder.URI, color);
    // Tell 3-pane tabs to update the folder's color.
    Services.obs.notifyObservers(gMsgFolder, "folder-color-changed", color);
  }

  try {
    // This throws an exception when an illegal folder name was entered.
    top.okCallback(
      document.getElementById("name").value,
      window.arguments[0].name
    );
  } catch (e) {
    event.preventDefault();
  }
}

function folderCancelButton() {
  // Clear any previewed color.
  Services.obs.notifyObservers(gMsgFolder, "folder-color-preview");
}

function folderPropsOnLoad() {
  const styles = getComputedStyle(document.body);
  const folderColors = {
    Inbox: styles.getPropertyValue("--folder-color-inbox"),
    Sent: styles.getPropertyValue("--folder-color-sent"),
    Outbox: styles.getPropertyValue("--folder-color-outbox"),
    Drafts: styles.getPropertyValue("--folder-color-draft"),
    Trash: styles.getPropertyValue("--folder-color-trash"),
    Archive: styles.getPropertyValue("--folder-color-archive"),
    Templates: styles.getPropertyValue("--folder-color-template"),
    Spam: styles.getPropertyValue("--folder-color-spam"),
    Virtual: styles.getPropertyValue("--folder-color-folder-filter"),
    RSS: styles.getPropertyValue("--folder-color-rss"),
    Newsgroup: styles.getPropertyValue("--folder-color-newsletter"),
  };
  gDefaultColor = styles.getPropertyValue("--folder-color-folder");

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
  }

  if (window.arguments[0].name) {
    // Initialize name textbox with the given name and remember this
    // value so we can tell whether the folder needs to be renamed
    // when the dialog is accepted.
    var nameTextbox = document.getElementById("name");
    nameTextbox.value = window.arguments[0].name;
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

    // Check the current folder name against known folder names to set the
    // correct default color, if needed.
    let selectedFolderName = "";

    switch (window.arguments[0].serverType) {
      case "rss":
        selectedFolderName = "RSS";
        break;
      case "nntp":
        selectedFolderName = "Newsgroup";
        break;
      default:
        selectedFolderName = window.arguments[0].name;
        break;
    }

    if (Object.keys(folderColors).includes(selectedFolderName)) {
      gDefaultColor = folderColors[selectedFolderName];
    }

    const colorInput = document.getElementById("color");
    colorInput.value =
      FolderTreeProperties.getColor(gMsgFolder.URI) || gDefaultColor;
    colorInput.addEventListener("input", () => {
      // Preview the chosen color.
      Services.obs.notifyObservers(
        gMsgFolder,
        "folder-color-preview",
        colorInput.value
      );
    });
    const resetColorButton = document.getElementById("resetColor");
    resetColorButton.addEventListener("click", function () {
      colorInput.value = gDefaultColor;
      // Preview the default color.
      Services.obs.notifyObservers(
        gMsgFolder,
        "folder-color-preview",
        gDefaultColor
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
    document.getElementById("folderCheckForNewMessages").checked =
      gMsgFolder.getFlag(Ci.nsMsgFolderFlags.CheckNew);

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
      const glodaFolder = Gloda.getFolderForFolder(gMsgFolder);
      glodaCheckbox.checked =
        glodaFolder.indexingPriority != glodaFolder.kIndexingNeverPriority;
    }
  }

  if (serverType == "imap") {
    const imapFolder = gMsgFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
    imapFolder.fillInFolderProps(gFolderPropsSink);

    const users = [...imapFolder.getOtherUsersWithAccess()];
    if (users.length) {
      document.getElementById("folderOtherUsers").hidden = false;
      document.getElementById("folderOtherUsersText").textContent =
        users.join(", ");
    }

    // Disable "Repair Folder" when offline as that would cause the offline store
    // to get deleted and redownloaded.
    document.getElementById("folderRebuildSummaryButton").disabled =
      gMsgFolder.supportsOffline && Services.io.offline;
  }

  var retentionSettings = gMsgFolder.retentionSettings;
  initCommonRetentionSettings(retentionSettings);
  document.getElementById("retention.useDefault").checked =
    retentionSettings.useServerDefaults;

  // set folder sizes
  const numberOfMsgs = gMsgFolder.getTotalMessages(false);
  if (numberOfMsgs >= 0) {
    document.getElementById("numberOfMessages").value = numberOfMsgs;
  }

  try {
    const sizeOnDisk = Cc["@mozilla.org/messenger;1"]
      .createInstance(Ci.nsIMessenger)
      .formatFileSize(gMsgFolder.sizeOnDisk, true);
    document.getElementById("sizeOnDisk").value = sizeOnDisk;
  } catch (e) {}

  onCheckKeepMsg();
  onUseDefaultRetentionSettings();

  // select the initial tab
  if (window.arguments[0].tabID) {
    document.getElementById("folderPropTabBox").selectedTab =
      document.getElementById(window.arguments[0].tabID);
  }
}

function hideShowControls(serverType) {
  const controls = document.querySelectorAll("[hidefor]");
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
  document.getElementById("retention.keepOldMsgMin").disabled =
    useDefault || keepMsg != Ci.nsIMsgRetentionSettings.nsMsgRetainByAge;
  document.getElementById("retention.keepNewMsgMin").disabled =
    useDefault || keepMsg != Ci.nsIMsgRetentionSettings.nsMsgRetainByNumHeaders;
}

function RebuildSummaryInformation() {
  window.arguments[0].rebuildSummaryCallback();
}
