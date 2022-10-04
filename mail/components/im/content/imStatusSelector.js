/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Status } = ChromeUtils.importESModule(
  "resource:///modules/imStatusUtils.sys.mjs"
);
var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

var statusSelector = {
  observe(aSubject, aTopic, aMsg) {
    if (aTopic == "status-changed") {
      this.displayCurrentStatus();
    } else if (aTopic == "user-icon-changed") {
      this.displayUserIcon();
    } else if (aTopic == "user-display-name-changed") {
      this.displayUserDisplayName();
    }
  },

  displayUserIcon() {
    let icon = IMServices.core.globalUserStatus.getUserIcon();
    ChatIcons.setUserIconSrc(
      document.getElementById("userIcon"),
      icon?.spec,
      true
    );
  },

  displayUserDisplayName() {
    let displayName = IMServices.core.globalUserStatus.displayName;
    let elt = document.getElementById("displayName");
    if (displayName) {
      elt.removeAttribute("usingDefault");
    } else {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/chat.properties"
      );
      displayName = bundle.GetStringFromName("displayNameEmptyText");
      elt.setAttribute("usingDefault", displayName);
    }
    elt.setAttribute("value", displayName);
  },

  displayStatusType(aStatusType) {
    document
      .getElementById("statusMessageLabel")
      .setAttribute("statusType", aStatusType);
    let statusString = Status.toLabel(aStatusType);
    let statusTypeIcon = document.getElementById("statusTypeIcon");
    statusTypeIcon.setAttribute("status", aStatusType);
    statusTypeIcon.setAttribute("tooltiptext", statusString);
    return statusString;
  },

  displayCurrentStatus() {
    let us = IMServices.core.globalUserStatus;
    let status = Status.toAttribute(us.statusType);
    let message = status == "offline" ? "" : us.statusText;
    let statusMessage = document.getElementById("statusMessageLabel");
    if (!statusMessage) {
      // Chat toolbar not in the DOM yet
      return;
    }
    if (message) {
      statusMessage.removeAttribute("usingDefault");
    } else {
      let statusString = this.displayStatusType(status);
      statusMessage.setAttribute("usingDefault", statusString);
      message = statusString;
    }
    statusMessage.setAttribute("value", message);
    statusMessage.setAttribute("tooltiptext", message);
  },

  editStatus(aEvent) {
    let status = aEvent.target.getAttribute("status");
    if (status == "offline") {
      IMServices.core.globalUserStatus.setStatus(
        Ci.imIStatusInfo.STATUS_OFFLINE,
        ""
      );
    } else if (status) {
      this.startEditStatus(status);
    }
  },

  startEditStatus(aStatusType) {
    let currentStatusType = document
      .getElementById("statusTypeIcon")
      .getAttribute("status");
    if (aStatusType != currentStatusType) {
      this._statusTypeBeforeEditing = currentStatusType;
      this._statusTypeEditing = aStatusType;
      this.displayStatusType(aStatusType);
    }
    this.statusMessageClick();
  },

  statusMessageClick() {
    let statusMessage = document.getElementById("statusMessageLabel");
    let statusMessageInput = document.getElementById("statusMessageInput");
    statusMessage.setAttribute("hidden", "true");
    statusMessageInput.removeAttribute("hidden");
    let statusType = document
      .getElementById("statusTypeIcon")
      .getAttribute("status");
    if (statusType == "offline" || statusMessage.disabled) {
      return;
    }

    if (!statusMessageInput.hasAttribute("editing")) {
      statusMessageInput.setAttribute("editing", "true");
      statusMessageInput.addEventListener("blur", event => {
        this.finishEditStatusMessage(true);
      });
      if (statusMessage.hasAttribute("usingDefault")) {
        if (
          "_statusTypeBeforeEditing" in this &&
          this._statusTypeBeforeEditing == "offline"
        ) {
          statusMessageInput.setAttribute(
            "value",
            IMServices.core.globalUserStatus.statusText
          );
        } else {
          statusMessageInput.removeAttribute("value");
        }
      } else {
        statusMessageInput.setAttribute(
          "value",
          statusMessage.getAttribute("value")
        );
      }

      if (Services.prefs.getBoolPref("mail.spellcheck.inline")) {
        statusMessageInput.setAttribute("spellcheck", "true");
      } else {
        statusMessageInput.removeAttribute("spellcheck");
      }

      // force binding attachment by forcing layout
      statusMessageInput.getBoundingClientRect();
      statusMessageInput.select();
    }

    this.statusMessageRefreshTimer();
  },

  statusMessageRefreshTimer() {
    const timeBeforeAutoValidate = 20 * 1000;
    if ("_stopEditStatusTimeout" in this) {
      clearTimeout(this._stopEditStatusTimeout);
    }
    this._stopEditStatusTimeout = setTimeout(
      this.finishEditStatusMessage,
      timeBeforeAutoValidate,
      true
    );
  },

  statusMessageKeyPress(aEvent) {
    if (!this.hasAttribute("editing")) {
      if (aEvent.keyCode == aEvent.DOM_VK_DOWN) {
        let button = document.getElementById("statusTypeIcon");
        document.getElementById("setStatusTypeMenupopup").openPopup(button);
      }
      return;
    }

    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
        statusSelector.finishEditStatusMessage(true);
        break;

      case aEvent.DOM_VK_ESCAPE:
        statusSelector.finishEditStatusMessage(false);
        break;

      default:
        statusSelector.statusMessageRefreshTimer();
    }
  },

  finishEditStatusMessage(aSave) {
    clearTimeout(this._stopEditStatusTimeout);
    delete this._stopEditStatusTimeout;
    let statusMessage = document.getElementById("statusMessageLabel");
    let statusMessageInput = document.getElementById("statusMessageInput");
    statusMessage.removeAttribute("hidden");
    statusMessageInput.toggleAttribute("hidden", "true");
    if (aSave) {
      let newStatus = Ci.imIStatusInfo.STATUS_UNKNOWN;
      if ("_statusTypeEditing" in this) {
        let statusType = this._statusTypeEditing;
        if (statusType == "available") {
          newStatus = Ci.imIStatusInfo.STATUS_AVAILABLE;
        } else if (statusType == "unavailable") {
          newStatus = Ci.imIStatusInfo.STATUS_UNAVAILABLE;
        } else if (statusType == "offline") {
          newStatus = Ci.imIStatusInfo.STATUS_OFFLINE;
        }
        delete this._statusTypeBeforeEditing;
        delete this._statusTypeEditing;
      }
      // apply the new status only if it is different from the current one
      if (
        newStatus != Ci.imIStatusInfo.STATUS_UNKNOWN ||
        statusMessageInput.value != statusMessageInput.getAttribute("value")
      ) {
        IMServices.core.globalUserStatus.setStatus(
          newStatus,
          statusMessageInput.value
        );
      }
    } else if ("_statusTypeBeforeEditing" in this) {
      this.displayStatusType(this._statusTypeBeforeEditing);
      delete this._statusTypeBeforeEditing;
      delete this._statusTypeEditing;
    }

    if (statusMessage.hasAttribute("usingDefault")) {
      statusMessage.setAttribute(
        "value",
        statusMessage.getAttribute("usingDefault")
      );
    }

    statusMessageInput.removeAttribute("editing");
    statusMessageInput.removeEventListener("blur", event => {
      this.finishEditStatusMessage(true);
    });

    // We need to put the focus back on the label after the textbox
    // binding has been detached, otherwise the focus gets lost (it's
    // on none of the elements in the document), but before that we
    // need to flush the layout.
    statusMessageInput.getBoundingClientRect();
    statusMessageInput.focus();
  },

  userIconClick() {
    const nsIFilePicker = Ci.nsIFilePicker;
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/chat.properties"
    );
    fp.init(
      window,
      bundle.GetStringFromName("userIconFilePickerTitle"),
      nsIFilePicker.modeOpen
    );
    fp.appendFilters(nsIFilePicker.filterImages);
    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      IMServices.core.globalUserStatus.setUserIcon(fp.file);
    });
  },

  displayNameClick() {
    let displayName = document.getElementById("displayName");
    let displayNameInput = document.getElementById("displayNameInput");
    displayName.setAttribute("hidden", "true");
    displayNameInput.removeAttribute("hidden");
    if (!displayNameInput.hasAttribute("editing")) {
      displayNameInput.setAttribute("editing", "true");
      if (displayName.hasAttribute("usingDefault")) {
        displayNameInput.removeAttribute("value");
      } else {
        displayNameInput.setAttribute(
          "value",
          displayName.getAttribute("value")
        );
      }
      displayNameInput.addEventListener("keypress", this.displayNameKeyPress);
      displayNameInput.addEventListener("blur", event => {
        this.finishEditDisplayName(true);
      });
      // force binding attachment by forcing layout
      displayNameInput.getBoundingClientRect();
      displayNameInput.select();
    }

    this.displayNameRefreshTimer();
  },

  _stopEditDisplayNameTimeout: 0,
  displayNameRefreshTimer() {
    const timeBeforeAutoValidate = 20 * 1000;
    clearTimeout(this._stopEditDisplayNameTimeout);
    this._stopEditDisplayNameTimeout = setTimeout(
      this.finishEditDisplayName,
      timeBeforeAutoValidate,
      true
    );
  },

  displayNameKeyPress(aEvent) {
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
        statusSelector.finishEditDisplayName(true);
        break;

      case aEvent.DOM_VK_ESCAPE:
        statusSelector.finishEditDisplayName(false);
        break;

      default:
        statusSelector.displayNameRefreshTimer();
    }
  },

  finishEditDisplayName(aSave) {
    clearTimeout(this._stopEditDisplayNameTimeout);
    let displayName = document.getElementById("displayName");
    let displayNameInput = document.getElementById("displayNameInput");
    displayName.removeAttribute("hidden");
    displayNameInput.toggleAttribute("hidden", "true");
    // Apply the new display name only if it is different from the current one.
    if (
      aSave &&
      displayNameInput.value != displayNameInput.getAttribute("value")
    ) {
      IMServices.core.globalUserStatus.displayName = displayNameInput.value;
    } else if (displayName.hasAttribute("usingDefault")) {
      displayName.setAttribute(
        "value",
        displayName.getAttribute("usingDefault")
      );
    }

    displayNameInput.removeAttribute("editing");
    displayNameInput.removeEventListener("keypress", this.displayNameKeyPress);
    displayNameInput.removeEventListener("blur", event => {
      this.finishEditDisplayName(true);
    });
  },

  init() {
    let events = ["status-changed"];
    statusSelector.displayCurrentStatus();

    if (document.getElementById("displayName")) {
      events.push("user-display-name-changed");
      statusSelector.displayUserDisplayName();
    }

    if (document.getElementById("userIcon")) {
      events.push("user-icon-changed");
      statusSelector.displayUserIcon();
    }

    let statusMessage = document.getElementById("statusMessageLabel");
    let statusMessageInput = document.getElementById("statusMessageInput");
    if (statusMessage && statusMessageInput) {
      statusMessage.addEventListener("keypress", this.statusMessageKeyPress);
      statusMessageInput.addEventListener(
        "keypress",
        this.statusMessageKeyPress
      );
    }

    for (let event of events) {
      Services.obs.addObserver(statusSelector, event);
    }
    statusSelector._events = events;

    window.addEventListener("unload", statusSelector.unload);
  },

  unload() {
    for (let event of statusSelector._events) {
      Services.obs.removeObserver(statusSelector, event);
    }
  },
};
