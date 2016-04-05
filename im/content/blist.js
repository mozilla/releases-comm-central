/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cu = Components.utils;

Cu.import("resource:///modules/imStatusUtils.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

var events = ["buddy-authorization-request",
                "buddy-authorization-request-canceled",
                "contact-availability-changed",
                "contact-added",
                "contact-tag-added",
                "contact-tag-removed",
                "showing-ui-conversation",
                "status-changed",
                "tag-hidden",
                "tag-shown",
                "ui-conversation-hidden",
                "user-display-name-changed",
                "user-icon-changed",
                "prpl-quit"];

var showOfflineBuddiesPref = "messenger.buddies.showOffline";

var gBuddyListContextMenu = null;

function buddyListContextMenu(aXulMenu) {
  this.target  = document.popupNode;
  this.menu    = aXulMenu;
  let localName = this.target.localName;
  let hasVisibleBuddies = !!document.getElementById("buddylistbox").firstChild;

  // Don't display a context menu on the headers or the drop target.
  this.shouldDisplay =
    localName != "label" && !this.target.hasAttribute("dummy");
  if (!this.shouldDisplay)
    return;

  this.onContact = localName == "contact";
  this.onBuddy = localName == "buddy";
  this.onGroup = localName == "group";
  this.onConv = localName == "conv";
  let hide = !(this.onContact || this.onBuddy);

  [ "context-edit-buddy-separator",
    "context-alias",
    "context-delete",
    "context-tags"
  ].forEach(function (aId) {
    document.getElementById(aId).hidden = hide;
  });
  if (!hide) {
    Components.utils.import("resource:///modules/ibTagMenu.jsm");
    this.tagMenu = new TagMenu(this, window, "context-tags",
                               this.toggleTag, this.addTag,
                               this.onBuddy ? this.target.contact : this.target);
  }

  document.getElementById("context-hide-tag").hidden = !this.onGroup;

  document.getElementById("context-visible-tags").hidden =
    !hide || this.onConv || !hasVisibleBuddies;

  let uiConv;
  if (!hide) {
    let contact =
      this.onContact ? this.target.contact : this.target.buddy.contact;
    uiConv = Services.conversations.getUIConversationByContactId(contact.id);
  }
  document.getElementById("context-openconversation").hidden = hide || uiConv;
  document.getElementById("context-show-conversation").hidden = !this.onConv && !uiConv;
  document.getElementById("context-close-conversation-separator").hidden = !this.onConv;
  document.getElementById("context-close-conversation").hidden = !this.onConv;
  let showLogsItem = document.getElementById("context-showlogs");
  let hideShowLogsItem = hide && !this.onConv;
  showLogsItem.hidden = hideShowLogsItem;
  if (!hideShowLogsItem)  {
    // Start disabled, then enable if we have logs.
    showLogsItem.setAttribute("disabled", true);
    this._getLogs().then(aLogs => {
      if (aLogs && aLogs.hasMoreElements())
        showLogsItem.removeAttribute("disabled");
    });
  }

  if (this.onGroup) {
    document.getElementById("context-hide-tag").disabled =
      this.target.tag.id == -1;
  }

  document.getElementById("context-show-offline-buddies-separator").hidden =
    this.onConv || !hasVisibleBuddies;

  document.getElementById("context-show-offline-buddies").hidden =
    this.onConv;

  let detach = document.getElementById("context-detach");
  detach.hidden = !this.onBuddy;
  if (this.onBuddy)
    detach.disabled = this.target.buddy.contact.getBuddies().length == 1;

  document.getElementById("context-openconversation").disabled =
    !hide && !this.target.canOpenConversation();
}

// Prototype for buddyListContextMenu "class."
buddyListContextMenu.prototype = {
  openConversation: function blcm_openConversation() {
    if (this.onContact || this.onBuddy || this.onConv)
      this.target.openConversation();
  },
  closeConversation: function blcm_closeConversation() {
    if (this.onConv)
      this.target.closeConversation();
  },
  alias: function blcm_alias() {
    if (this.onContact)
      this.target.startAliasing();
    else if (this.onBuddy)
      this.target.contact.startAliasing();
  },
  detach: function blcm_detach() {
    if (!this.onBuddy)
      return;

    let buddy = this.target.buddy;
    buddy.contact.detachBuddy(buddy);
  },
  delete: function blcm_delete() {
    let buddy;
    if (this.onContact)
      buddy = this.target.contact.preferredBuddy;
    else if (this.onBuddy)
      buddy = this.target.buddy;
    else
      return;

    let bundle = document.getElementById("instantbirdBundle").stringBundle;
    let displayName = this.target.displayName;
    let promptTitle = bundle.formatStringFromName("contact.deletePrompt.title",
                                                  [displayName], 1);
    let userName = buddy.userName;
    if (displayName != userName)
      displayName += " (" + userName + ")";
    let proto = buddy.protocol.name; // FIXME build a list
    let promptMessage = bundle.formatStringFromName("contact.deletePrompt.message",
                                                    [displayName, proto], 2);
    let deleteButton = bundle.GetStringFromName("contact.deletePrompt.button");
    let prompts = Services.prompt;
    let flags = prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
                prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                prompts.BUTTON_POS_1_DEFAULT;
    if (prompts.confirmEx(window, promptTitle, promptMessage, flags,
                          deleteButton, null, null, null, {}))
      return;

    this.target.delete();
  },
  addTag: function blcm_addTag(aTag) {
    // If the contact already has the tag, addTag will return early.
    this.tagMenu.target.contact.addTag(aTag);
  },
  toggleTag: function blcm_toggleTag(aTag) {
    let contact = this.tagMenu.target.contact;
    if (contact.getTags().some(t => t.id == aTag.id))
      contact.removeTag(aTag);
    else
      contact.addTag(aTag);
  },
  _getLogs: function blcm_getLogs() {
    if (this.onContact)
      return Services.logs.getLogsForContact(this.target.contact, true);
    if (this.onBuddy)
      return Services.logs.getLogsForBuddy(this.target.buddy, true);
    if (this.onConv)
      return Services.logs.getLogsForConversation(this.target.conv, true);
    return null;
  },
  showLogs: function blcm_showLogs() {
    this._getLogs().then(aLogs => {
      if (!aLogs || !aLogs.hasMoreElements())
        return;
      window.openDialog("chrome://instantbird/content/viewlog.xul",
                        "Logs", "chrome,resizable", {logs: aLogs},
                        this.target.displayName);
    });
  },
  hideTag: function blcm_hideTag() {
    if (!this.onGroup || this.target.tag.id == -1)
      return;

    this.target.hide();
  },
  visibleTagsPopupShowing: function blcm_visibleTagsPopupShowing() {
    if (this.onBuddy || this.onContact || this.onConv)
      return;

    let popup = document.getElementById("context-visible-tags-popup");
    let item;
    while ((item = popup.firstChild) && item.localName != "menuseparator")
      item.remove();

    Services.tags.getTags()
            .forEach(function (aTag) {
      item = document.createElement("menuitem");
      item.setAttribute("label", aTag.name);
      item.setAttribute("type", "checkbox");
      let id = aTag.id;
      item.groupId = id;
      if (!Services.tags.isTagHidden(aTag))
        item.setAttribute("checked", "true");
      popup.insertBefore(item, popup.firstChild);
    });

    let otherContactsTag = document.getElementById("group-1");
    [ "context-other-contacts-tag-separator",
      "context-other-contacts-tag"
    ].forEach(function (aId) {
      document.getElementById(aId).hidden = !otherContactsTag;
    });
    if (otherContactsTag) {
      // This avoids having the localizable "Other Contacts" string in
      // both a .dtd and .properties file.
      document.getElementById("context-other-contacts-tag").label =
        otherContactsTag.displayName;
    }
  },
  visibleTags: function blcm_visibleTags(aEvent) {
    let id = aEvent.originalTarget.groupId;
    if (!id)
      return;
    let tags = Services.tags;
    let tag = tags.getTagById(id);
    if (tags.isTagHidden(tag))
      tags.showTag(tag);
    else
      tags.hideTag(tag);
  },
  toggleShowOfflineBuddies: function blcm_toggleShowOfflineBuddies() {
    let newValue =
      !!document.getElementById("context-show-offline-buddies")
                .getAttribute("checked");
    Services.prefs.setBoolPref(showOfflineBuddiesPref, newValue);
  }
};

var buddyList = {
  observe: function bl_observe(aSubject, aTopic, aMsg) {
    if (aTopic == "prpl-quit") {
      window.close();
      return;
    }

    if (aTopic == "nsPref:changed" && aMsg == showOfflineBuddiesPref) {
      let showOffline = Services.prefs.getBoolPref(showOfflineBuddiesPref);
      this._showOffline = showOffline;
      let item = document.getElementById("context-show-offline-buddies");
      if (showOffline)
        item.setAttribute("checked", "true");
      else
        item.removeAttribute("checked");

      Services.tags.getTags().forEach(function (aTag) {
        let elt = document.getElementById("group" + aTag.id);
        if (elt)
          elt.showOffline = showOffline;
        else if (showOffline) {
          if (Services.tags.isTagHidden(aTag))
            this.showOtherContacts();
          else
            this.displayGroup(aTag);
        }
      }, this);
      let elt = document.getElementById("group-1"); // "Other contacts"
      if (elt)
        elt.showOffline = showOffline;
      return;
    }

    if (aTopic == "status-changed") {
      this.displayCurrentStatus();
      return;
    }

    if (aTopic == "tag-hidden") {
      this.showOtherContacts();
      return;
    }

    if (aTopic == "tag-shown") {
      if (!document.getElementById("group" + aSubject.id))
        this.displayGroup(aSubject);
      return;
    }

    if (aTopic == "user-icon-changed") {
      this.displayUserIcon();
      return;
    }

    if (aTopic == "user-display-name-changed") {
      this.displayUserDisplayName();
      return;
    }

    if (aTopic == "ui-conversation-hidden") {
      let convElt = document.createElement("conv");
      let name = aSubject.title.toLowerCase();
      let ref = this.convBox.firstChild;
      while (ref &&
             ref.displayName.toLowerCase().localeCompare(name) < 0)
        ref = ref.nextSibling;
      this.convBox.insertBefore(convElt, ref);
      convElt.build(aSubject);
      return;
    }
    if (aTopic == "showing-ui-conversation") {
      if (this.convBox.listedConvs.hasOwnProperty(aSubject.id))
        this.convBox.listedConvs[aSubject.id].removeNode();
      return;
    }

    if (aTopic == "buddy-authorization-request") {
      aSubject.QueryInterface(Ci.prplIBuddyRequest);
      let bundle = document.getElementById("instantbirdBundle").stringBundle;
      let label = bundle.formatStringFromName("buddy.authRequest.label",
                                              [aSubject.userName], 1);
      let value =
        "buddy-auth-request-" + aSubject.account.id + aSubject.userName;
      let acceptButton = {
        accessKey: bundle.GetStringFromName("buddy.authRequest.allow.accesskey"),
        label: bundle.GetStringFromName("buddy.authRequest.allow.label"),
        callback: function() { aSubject.grant(); }
      };
      let denyButton = {
        accessKey: bundle.GetStringFromName("buddy.authRequest.deny.accesskey"),
        label: bundle.GetStringFromName("buddy.authRequest.deny.label"),
        callback: function() { aSubject.deny(); }
      };
      let box = document.getElementById("buddyListMsg");
      box.appendNotification(label, value, null, box.PRIORITY_INFO_HIGH,
                            [acceptButton, denyButton]);
      window.getAttention();
      return;
    }
    if (aTopic == "buddy-authorization-request-canceled") {
      aSubject.QueryInterface(Ci.prplIBuddyRequest);
      let value =
        "buddy-auth-request-" + aSubject.account.id + aSubject.userName;
      let notification =
        document.getElementById("buddyListMsg")
                .getNotificationWithValue(value);
      if (notification)
        notification.close();
      return;
    }

    // aSubject is an imIContact
    if (aSubject.online || this._showOffline) {
      aSubject.getTags().forEach(function (aTag) {
        if (Services.tags.isTagHidden(aTag))
          this.showOtherContacts();
        else if (!document.getElementById("group" + aTag.id))
          this.displayGroup(aTag);
      }, this);
    }
  },

  displayUserIcon: function bl_displayUserIcon() {
    let icon = Services.core.globalUserStatus.getUserIcon();
    document.getElementById("userIcon").src = icon ? icon.spec : "";
  },

  displayUserDisplayName: function bl_displayUserDisplayName() {
    let displayName = Services.core.globalUserStatus.displayName;
    let elt = document.getElementById("displayName");
    if (displayName)
      elt.removeAttribute("usingDefault");
    else {
      let bundle = document.getElementById("instantbirdBundle");
      displayName = bundle.getString("displayNameEmptyText");
      elt.setAttribute("usingDefault", displayName);
    }
    elt.setAttribute("value", displayName);
  },

  displayStatusType: function bl_displayStatusType(aStatusType) {
    document.getElementById("statusMessage")
            .setAttribute("statusType", aStatusType);
    let statusString = Status.toLabel(aStatusType);
    let statusTypeIcon = document.getElementById("statusTypeIcon");
    statusTypeIcon.setAttribute("status", aStatusType);
    statusTypeIcon.setAttribute("tooltiptext", statusString);
    return statusString;
  },

  displayCurrentStatus: function bl_displayCurrentStatus() {
    let us = Services.core.globalUserStatus;
    let status = Status.toAttribute(us.statusType);
    let message = status == "offline" ? "" : us.statusText;
    let statusString = this.displayStatusType(status);
    let statusMessage = document.getElementById("statusMessage");
    if (message)
      statusMessage.removeAttribute("usingDefault");
    else {
      statusMessage.setAttribute("usingDefault", statusString);
      message = statusString;
    }
    statusMessage.setAttribute("value", message);
    statusMessage.setAttribute("tooltiptext", message);
  },

  editStatus: function bl_editStatus(aEvent) {
    let status = aEvent.originalTarget.getAttribute("status");
    if (status == "offline") {
      let statusMessage = document.getElementById("statusMessage");
      if (statusMessage.hasAttribute("editing"))
        buddyList.finishEditStatusMessage(false);
      Services.core.globalUserStatus.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
    }
    else if (status)
      this.startEditStatus(status);
  },

  startEditStatus: function bl_startEditStatus(aStatusType) {
    let currentStatusType =
      document.getElementById("statusTypeIcon").getAttribute("status");
    if (aStatusType != currentStatusType) {
      this._statusTypeBeforeEditing = currentStatusType;
      this._statusTypeEditing = aStatusType;
      this.displayStatusType(aStatusType);
    }
    this.statusMessageClick();
  },

  statusMessageClick: function bl_statusMessageClick(event) {
    let statusTypeIcon = document.getElementById("statusTypeIcon");
    if (event && event.button == 0) {
      // If the mouse clicked the statusTypeIcon with the primary
      // button, we should open the dropdown menu. (The statusMessage
      // "covers" the icon due to its enlarged focusring.)
      let box = statusTypeIcon.getBoundingClientRect();
      if (event.clientX >= box.left && event.clientX < box.right &&
          event.clientY >= box.top && event.clientY < box.bottom) {
        this.openStatusTypePopup();
        return;
      }
    }
    let statusType = statusTypeIcon.getAttribute("status");
    if (statusType == "offline")
      return;

    let elt = document.getElementById("statusMessage");
    if (!elt.hasAttribute("editing")) {
      elt.setAttribute("editing", "true");
      elt.removeAttribute("role");
      elt.removeAttribute("aria-haspopup");
      elt.addEventListener("blur", this.statusMessageBlur);
      if (elt.hasAttribute("usingDefault")) {
        if ("_statusTypeBeforeEditing" in this &&
            this._statusTypeBeforeEditing == "offline")
          elt.setAttribute("value", Services.core.globalUserStatus.statusText);
        else
          elt.removeAttribute("value");
      }
      if (!("TextboxSpellChecker" in window))
        Components.utils.import("resource:///modules/imTextboxUtils.jsm");
      TextboxSpellChecker.registerTextbox(elt);
      // force binding attachment by forcing layout
      elt.getBoundingClientRect();
      elt.select();
    }

    this.statusMessageRefreshTimer();
  },

  statusMessageRefreshTimer: function bl_statusMessageRefreshTimer() {
    const timeBeforeAutoValidate = 20 * 1000;
    if ("_stopEditStatusTimeout" in this)
      clearTimeout(this._stopEditStatusTimeout);
    this._stopEditStatusTimeout = setTimeout(this.finishEditStatusMessage,
                                             timeBeforeAutoValidate, true);
  },

  statusMessageBlur: function bl_statusMessageBlur(aEvent) {
    if (aEvent.originalTarget == document.getElementById("statusMessage").inputField)
      buddyList.finishEditStatusMessage(true);
  },

  statusMessageKeyPress: function bl_statusMessageKeyPress(aEvent) {
    let editing = document.getElementById("statusMessage").hasAttribute("editing");
    if (!editing) {
      switch (aEvent.keyCode) {
        case aEvent.DOM_VK_DOWN:
          buddyList.openStatusTypePopup();
          aEvent.preventDefault();
          return;

        case aEvent.DOM_VK_TAB:
          break;

        default:
          if (aEvent.charCode == aEvent.DOM_VK_SPACE)
            buddyList.statusMessageClick();
          return;
      }
    }
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
        buddyList.finishEditStatusMessage(true);
        break;

      case aEvent.DOM_VK_ESCAPE:
        buddyList.finishEditStatusMessage(false);
        break;

      case aEvent.DOM_VK_TAB:
        if (aEvent.shiftKey)
          break;
        // Ensure some item is selected when navigating by keyboard.
        if (!this.selectFirstItem("convlistbox"))
          this.selectFirstItem("buddylistbox");
        break;

      default:
        buddyList.statusMessageRefreshTimer();
    }
  },

  finishEditStatusMessage: function bl_finishEditStatusMessage(aSave) {
    clearTimeout(this._stopEditStatusTimeout);
    delete this._stopEditStatusTimeout;
    let elt = document.getElementById("statusMessage");
    if (aSave) {
      let newStatus = Ci.imIStatusInfo.STATUS_UNKNOWN;
      if ("_statusTypeEditing" in this) {
        let statusType = this._statusTypeEditing;
        if (statusType == "available")
          newStatus = Ci.imIStatusInfo.STATUS_AVAILABLE;
        else if (statusType == "unavailable")
          newStatus = Ci.imIStatusInfo.STATUS_UNAVAILABLE;
        else if (statusType == "offline")
          newStatus = Ci.imIStatusInfo.STATUS_OFFLINE;
        delete this._statusTypeBeforeEditing;
        delete this._statusTypeEditing;
      }
      // apply the new status only if it is different from the current one
      if (newStatus != Ci.imIStatusInfo.STATUS_UNKNOWN ||
          elt.value != elt.getAttribute("value"))
        Services.core.globalUserStatus.setStatus(newStatus, elt.value);
    }
    else if ("_statusTypeBeforeEditing" in this) {
      this.displayStatusType(this._statusTypeBeforeEditing);
      delete this._statusTypeBeforeEditing;
      delete this._statusTypeEditing;
    }

    if (elt.hasAttribute("usingDefault"))
      elt.setAttribute("value", elt.getAttribute("usingDefault"));
    TextboxSpellChecker.unregisterTextbox(elt);
    elt.removeAttribute("editing");
    elt.setAttribute("role", "button");
    elt.setAttribute("aria-haspopup", "true");
    elt.removeEventListener("blur", this.statusMessageBlur, false);
    if (!elt.getAttribute("focused"))
      return;
    // Force layout to remove input binding.
    elt.getBoundingClientRect();
    elt.focus();
  },

  openStatusTypePopup: function() {
    let button = document.getElementById("statusTypeIcon");
    document.getElementById("setStatusTypeMenupopup").openPopup(button, "after_start");
  },

  onStatusTypePopupShown: function() {
    // Without this, the #userIcon gains focus when the popup is opened
    // from the #statusMessage whenever the #statusMessage has been edited
    // at least once (thus changing the binding).
    document.getElementById("statusMessage").focus();
  },

  userIconKeyPress: function bl_userIconKeyPress(aEvent) {
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
        this.chooseUserIcon();
        break;

      case aEvent.DOM_VK_TAB:
        if (!aEvent.shiftKey)
          break;
        // Ensure a contact is selected when navigating by keyboard.
        this.selectFirstItem("buddylistbox");
        break;

      default:
        if (aEvent.charCode == aEvent.DOM_VK_SPACE)
          this.chooseUserIcon();
        break;
    }
  },

  chooseUserIcon: function bl_chooseUserIcon() {
    const nsIFilePicker = Components.interfaces.nsIFilePicker;
    let fp = Components.classes["@mozilla.org/filepicker;1"]
                       .createInstance(nsIFilePicker);
    let bundle = document.getElementById("instantbirdBundle");
    fp.init(window, bundle.getString("userIconFilePickerTitle"),
            nsIFilePicker.modeOpen);
    fp.appendFilters(nsIFilePicker.filterImages);
    if (fp.show() == nsIFilePicker.returnOK)
      Services.core.globalUserStatus.setUserIcon(fp.file);
  },

  webcamSuccessCallback: function bl_webcamSuccessCallback(aStream) {
    if (document.getElementById("changeUserIconPanel").state != "open" ||
        document.getElementById("userIconPanel").selectedIndex != 1) {
      this.stopWebcamStream();
      return;
    }

    let video = document.getElementById("webcamVideo");
    video.srcObject = aStream;
    video.onplaying = function() { document.getElementById("captureButton")
                                           .removeAttribute("disabled"); }
    video.play();
  },

  takePictureButton: function bl_takePictureButton() {
    document.getElementById("userIconPanel").selectedIndex = 1;
    navigator.mediaDevices.getUserMedia({audio: false, video: true})
             .then(aStream => this.webcamSuccessCallback(aStream),
                   Cu.reportError);
  },

  takePicture: function bl_takePicture() {
    document.getElementById("userIconPanel").selectedIndex = 2;
    let canvas = document.getElementById("userIconCanvas");
    let ctx    = canvas.getContext("2d");
    ctx.save();
    let video = document.getElementById("webcamVideo");
    ctx.drawImage(video, 80, 0, 480, 480, 0, 0, canvas.height, canvas.height);
    document.getElementById("webcamPhoto")
            .setAttribute("src", canvas.toDataURL("image/png"));
    ctx.restore();
  },

  captureBackButton: function bl_captureBackButton() {
    document.getElementById("userIconPanel").selectedIndex = 0;
    document.getElementById("webcamPhoto").removeAttribute("src");
    this.stopWebcamStream();
  },

  retake: function bl_retake() {
    document.getElementById("userIconPanel").selectedIndex = 1;
  },

  removeUserIcon: function bl_removeUserIcon() {
    Services.core.globalUserStatus.setUserIcon(null);
    document.getElementById("changeUserIconPanel").hidePopup();
  },

  setWebcamImage: function bl_setWebcamImage() {
    let canvas = document.getElementById("userIconCanvas");
    canvas.toBlob(function(blob) {
      let read = new FileReader();
      read.addEventListener("loadend", function() {
        // FIXME: This is a workaround for Bug 1011878.
        // Writing the new icon to a temporary file and then creating an
        // nsIFile to pass it to Service.core is a temporary fix.
        // An ArrayBufferView is needed as input to OS.File.WriteAtomic. Any
        // other would have worked too.
        let view      = new Int8Array(read.result);
        let newName   = OS.Path.join(OS.Constants.Path.tmpDir, "tmpUserIcon.png");
        let writeFile = OS.File.writeAtomic(newName, view);
        document.getElementById("changeUserIconPanel").hidePopup();
        writeFile.then(function() {
          let userIconFile = Cc["@mozilla.org/file/local;1"]
                             .createInstance(Ci.nsILocalFile);
          userIconFile.initWithPath(newName);
          Services.core.globalUserStatus.setUserIcon(userIconFile);
          userIconFile.remove(newName);
        });
      });
      read.readAsArrayBuffer(blob);
    }, "image/png", 1.0);
  },

  updateUserIconPanelItems: function bl_updateUserIconPanelItems() {
    document.getElementById("userIconPanel").selectedIndex = 0;
    let icon = Services.core.globalUserStatus.getUserIcon();
    document.getElementById("userIconPanelImage").src = icon ? icon.spec : "";

    let webcamButton = document.getElementById("takePictureButton");
    webcamButton.disabled = true;
    navigator.mediaDevices.enumerateDevices().then(aDevices => {
      webcamButton.disabled =
        !aDevices.some(aDevice => aDevice.kind == "videoinput");
    }, Cu.reportError);
  },

  stopWebcamStream: function bl_stopWebcamStream() {
    let webcamVideo = document.getElementById("webcamVideo");
    let webcamStream = webcamVideo.srcObject;
    if (webcamStream) {
      webcamStream.stop();
      webcamVideo.srcObject = null;
    }

    document.getElementById("captureButton").disabled = true;
    document.getElementById("webcamPhoto").removeAttribute("src");
  },

  displayNameClick: function bl_displayNameClick() {
    let elt = document.getElementById("displayName");
    if (!elt.hasAttribute("editing")) {
      elt.setAttribute("editing", "true");
      elt.removeAttribute("role");
      if (elt.hasAttribute("usingDefault"))
        elt.removeAttribute("value");
      elt.addEventListener("blur", this.displayNameBlur);
      // force binding attachment by forcing layout
      elt.getBoundingClientRect();
      elt.select();
    }

    this.displayNameRefreshTimer();
  },

  _stopEditDisplayNameTimeout: 0,
  displayNameRefreshTimer: function bl_displayNameRefreshTimer() {
    const timeBeforeAutoValidate = 20 * 1000;
    clearTimeout(this._stopEditDisplayNameTimeout);
    this._stopEditDisplayNameTimeout =
      setTimeout(this.finishEditDisplayName, timeBeforeAutoValidate, true);
  },

  displayNameBlur: function bl_displayNameBlur(aEvent) {
    if (aEvent.originalTarget == document.getElementById("displayName").inputField)
      buddyList.finishEditDisplayName(true);
  },

  displayNameKeyPress: function bl_displayNameKeyPress(aEvent) {
    let editing = document.getElementById("displayName").hasAttribute("editing");
    if (!editing) {
      if (aEvent.charCode == aEvent.DOM_VK_SPACE)
        buddyList.displayNameClick();
      return;
    }
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_RETURN:
        buddyList.finishEditDisplayName(true);
        break;

      case aEvent.DOM_VK_ESCAPE:
        buddyList.finishEditDisplayName(false);
        break;

      default:
        buddyList.displayNameRefreshTimer();
    }
  },

  finishEditDisplayName: function bl_finishEditDisplayName(aSave) {
    clearTimeout(this._stopEditDisplayNameTimeout);
    let elt = document.getElementById("displayName");
    // Apply the new display name only if it is different from the current one.
    if (aSave && elt.value != elt.getAttribute("value"))
      Services.core.globalUserStatus.displayName = elt.value;
    else if (elt.hasAttribute("usingDefault"))
      elt.setAttribute("value", elt.getAttribute("usingDefault"));

    elt.removeAttribute("editing");
    elt.setAttribute("role", "button");
    elt.removeEventListener("blur", this.displayNameBlur, false);
    if (!elt.getAttribute("focused"))
      return;
    // Force layout to remove input binding.
    elt.getBoundingClientRect();
    elt.focus();
  },

  load: function bl_load() {
    var blistWindows = Services.wm.getEnumerator("Messenger:blist");
    while (blistWindows.hasMoreElements()) {
      var win = blistWindows.getNext();
      if (win != window) {
        win.QueryInterface(Ci.nsIDOMWindow).focus();
        window.close();
        return;
      }
    }

    // Move the window to the right of the screen on new profiles.
    let docElt = document.documentElement;
    if (!docElt.hasAttribute("height")) {
      docElt.setAttribute("height", screen.availHeight || 600);
      let width = parseInt(docElt.getAttribute("width"));
      window.moveTo(screen.availLeft + screen.availWidth - width,
                    screen.availTop);
    }

    // TODO remove this once we cleanup the way the menus are inserted
    let menubar = document.getElementById("blistMenubar");
    let statusArea = document.getElementById("statusArea");
    statusArea.parentNode.insertBefore(menubar, statusArea);

    buddyList.displayCurrentStatus();
    buddyList.displayUserDisplayName();
    buddyList.displayUserIcon();

    let prefBranch = Services.prefs;
    buddyList._showOffline = prefBranch.getBoolPref(showOfflineBuddiesPref);
    if (buddyList._showOffline) {
      document.getElementById("context-show-offline-buddies")
              .setAttribute("checked", "true");
    }

    let blistBox = document.getElementById("buddylistbox");
    blistBox.removeGroup = function(aGroupElt) {
      let index = buddyList._displayedGroups.indexOf(aGroupElt);
      if (index != -1)
        buddyList._displayedGroups.splice(index, 1);
      aGroupElt.remove();
    };
    let showOtherContacts = false;
    Services.tags.getTags().forEach(function (aTag) {
      if (Services.tags.isTagHidden(aTag))
        showOtherContacts = true;
      else
        buddyList.displayGroup(aTag);
    });
    if (showOtherContacts)
      buddyList.showOtherContacts();
    blistBox.focus();

    buddyList.convBox = document.getElementById("convlistbox");
    buddyList.convBox.listedConvs = {};
    buddyList.convBox._updateListConvCount = function() {
      let count = Object.keys(this.listedConvs).length;
      this.parentNode.setAttribute("listedConvCount", count);
    }.bind(buddyList.convBox);
    let convs = Services.conversations.getUIConversations();
    if (convs.length != 0) {
      if (!("Conversations" in window))
        Components.utils.import("resource:///modules/imWindows.jsm");
      convs.sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      for (let conv of convs) {
        if (!Conversations.isUIConversationDisplayed(conv)) {
          let convElt = document.createElement("conv");
          buddyList.convBox.appendChild(convElt);
          convElt.build(conv);
        }
      }
      buddyList.convBox._updateListConvCount();
    }
    new MutationObserver(buddyList.convBox._updateListConvCount)
      .observe(buddyList.convBox, {childList: true});

    prefBranch.addObserver(showOfflineBuddiesPref, buddyList, false);
    for (let event of events)
      Services.obs.addObserver(buddyList, event, false);

    this.addEventListener("unload", buddyList.unload);
  },
  _displayedGroups: [],
  _getGroupIndex: function(aName) {
    let start = 0;
    let end = this._displayedGroups.length;
    let name = aName.toLowerCase();
    while (start < end) {
      let middle = start + Math.floor((end - start) / 2);
      if (name < this._displayedGroups[middle].displayName.toLowerCase())
        end = middle;
      else
        start = middle + 1;
    }
    return end;
  },
  displayGroup: function(aTag) {
    let blistBox = document.getElementById("buddylistbox");
    let groupElt = document.createElement("group");
    let index;
    let ref = null;
    if (aTag.id != -1) {
      index = this._getGroupIndex(aTag.name);
      if (index == this._displayedGroups.length)
        ref = document.getElementById("group-1"); // 'Other Contacts'
      else
        ref = this._displayedGroups[index];
    }
    blistBox.insertBefore(groupElt, ref);

    if (this._showOffline)
      groupElt._showOffline = true;
    if (!groupElt.build(aTag))
      groupElt.remove();
    else if (index !== undefined)
      this._displayedGroups.splice(index, 0, groupElt);
  },
  _showOtherContactsRequested: false,
  showOtherContacts: function bl_showOtherContacts() {
    if (this._showOtherContactsRequested)
      return;
    this._showOtherContactsRequested = true;
    setTimeout(function(aSelf) {
      if (!document.getElementById("group-1"))
        aSelf.displayGroup(Services.tags.otherContactsTag);
      aSelf._showOtherContactsRequested = false;
    }, 0, this);
  },
  onblur: function bl_onblur() {
    // Clear the buddy list selection. Contacts expand to two lines
    // when selected, but only when the buddy list has focus. This makes
    // it hard to select the right contact by clicking on an unfocused
    // contact list, as the contact will reexpand before the click is handled.
    document.getElementById("buddylistbox").clearSelection();
  },
  unload: function bl_unload() {
    for (let event of events)
      Services.obs.removeObserver(buddyList, event);
    Services.prefs.removeObserver(showOfflineBuddiesPref, buddyList);
   },

  selectFirstItem: function (aListboxID) {
    let listbox = document.getElementById(aListboxID);
    if (!listbox.itemCount)
      return false;
    if (listbox.selectedIndex == -1)
      listbox.selectedIndex = 0;
    return true;
  },

  // Handle key pressing
  keyPress: function bl_keyPress(aEvent) {
    let target = aEvent.target;
    while (target && target.localName != "richlistbox")
      target = target.parentNode;
    if (aEvent.keyCode == aEvent.DOM_VK_TAB) {
      // Ensure some item is selected when navigating by keyboard.
      if (target.id == "convlistbox" && !aEvent.shiftKey)
        this.selectFirstItem("buddylistbox");
      if (target.id == "buddylistbox" && aEvent.shiftKey)
        this.selectFirstItem("convlistbox");
      return;
    }
    var item = target.selectedItem;
    if (!item || !item.parentNode) // empty list or item no longer in the list
      return;
    item.keyPress(aEvent);
  },

  buddylistboxFocus: function() {
    let selectedItem = document.getElementById("buddylistbox").selectedItem;
    if (selectedItem) {
      // Ensure binding changes immediately to avoid the firing of a
      // spurious accessibility focus event referring to the old binding that
      // causes problems for screen readers (BIO bug 1626, BMO bug 786508)
      selectedItem.getBoundingClientRect();
    }
  },

  // Usually, a scrollable richlistbox will ensure that a newly selected item is
  // automatically scrolled into view. However, buddylistbox and convlistbox are
  // both zero-flex children of a flexible notification box, and don't have
  // scrollboxes themselves - so it's necessary to manually set the scroll of the
  // notification box when an item is selected to ensure its visibility.
  listboxSelect: function(event) {
    if (!event.target.selectedItem)
      return;
    let notifbox = document.getElementById('buddyListMsg');
    let itemBounds = event.target.selectedItem.getBoundingClientRect();
    let notifboxBounds = notifbox.getBoundingClientRect();
    // The offset of the top of the notification box from the top of the item.
    let offsetAboveTop = notifboxBounds.top - itemBounds.top;
    // The offset of the bottom of the item from the bottom of the notification box.
    let offsetBelowBottom = itemBounds.top + itemBounds.height -
                            (notifboxBounds.top + notifboxBounds.height);
    // If the item is not fully in view, one of the offsets will be positive.
    if (offsetAboveTop < 0 && offsetBelowBottom < 0)
      return;
    if (offsetAboveTop >= 0) {
      // We need to scroll up to bring the item into view.
      notifbox.scrollTop -= offsetAboveTop;
      return;
    }
    // We need to scroll down to bring the item into view.
    notifbox.scrollTop += offsetBelowBottom;
  }
};

this.addEventListener("load", buddyList.load);
