/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

/* import-globals-from MsgComposeCommands.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

var kUploadNotificationValue = "bigAttachmentUploading";
var kPrivacyWarningNotificationValue = "bigAttachmentPrivacyWarning";

var gBigFileObserver = {
  bigFiles: [],
  sessionHidden: false,
  privacyWarned: false,

  get hidden() {
    return (
      this.sessionHidden ||
      !Services.prefs.getBoolPref("mail.cloud_files.enabled") ||
      !Services.prefs.getBoolPref("mail.compose.big_attachments.notify") ||
      Services.io.offline
    );
  },

  hide(aPermanent) {
    if (aPermanent) {
      Services.prefs.setBoolPref("mail.compose.big_attachments.notify", false);
    } else {
      this.sessionHidden = true;
    }
  },

  init() {
    let bucket = document.getElementById("attachmentBucket");
    bucket.addEventListener("attachments-added", this);
    bucket.addEventListener("attachments-removed", this);
    bucket.addEventListener("attachments-uploading", this);
    bucket.addEventListener("attachment-uploaded", this);
    bucket.addEventListener("attachment-upload-failed", this);
    bucket.addEventListener("attachments-converted", this);

    this.sessionHidden = false;
    this.privacyWarned = false;
    this.bigFiles = [];
  },

  handleEvent(event) {
    if (this.hidden) {
      return;
    }

    const bucketCallbacks = {
      "attachments-added": this.attachmentsAdded,
      "attachments-removed": this.attachmentsRemoved,
      "attachments-converted": this.attachmentsConverted,
      "attachments-uploading": this.attachmentsUploading,
    };

    const itemCallbacks = {
      "attachment-uploaded": this.attachmentUploaded,
      "attachment-upload-failed": this.attachmentUploadFailed,
    };

    if (event.type in bucketCallbacks) {
      bucketCallbacks[event.type].call(this, event.detail);
    }

    if (event.type in itemCallbacks) {
      itemCallbacks[event.type].call(
        this,
        event.target,
        "detail" in event ? event.detail : null
      );
    }

    this.updateNotification();
  },

  formatString(key, replacements, plural) {
    let str = getComposeBundle().getString(key);
    if (plural !== undefined) {
      str = PluralForm.get(plural, str);
    }
    if (replacements !== undefined) {
      for (let i = 0; i < replacements.length; i++) {
        str = str.replace("#" + (i + 1), replacements[i]);
      }
    }
    return str;
  },

  attachmentsAdded(aAttachments) {
    let threshold =
      Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") *
      1024;

    for (let attachment of aAttachments) {
      if (attachment.size >= threshold && !attachment.sendViaCloud) {
        this.bigFiles.push(attachment);
      }
    }
  },

  attachmentsRemoved(aAttachments) {
    for (let attachment of aAttachments) {
      let index = this.bigFiles.indexOf(attachment);
      if (index != -1) {
        this.bigFiles.splice(index, 1);
      }
    }
  },

  attachmentsConverted(aAttachments) {
    let uploaded = [];

    for (let attachment of aAttachments) {
      if (attachment.sendViaCloud) {
        this.attachmentsRemoved([attachment]);
        uploaded.push(attachment);
      }
    }

    if (uploaded.length) {
      this.showUploadingNotification(uploaded);
    }
  },

  attachmentsUploading(aAttachments) {
    this.showUploadingNotification(aAttachments);
  },

  attachmentUploaded(aAttachment) {
    if (!this._anyUploadsInProgress()) {
      this.hideUploadingNotification();

      if (!this.privacyWarned) {
        this.showPrivacyNotification();
        this.privacyWarned = true;
      }
    }
  },

  attachmentUploadFailed(aAttachment, aStatusCode) {
    if (!this._anyUploadsInProgress()) {
      this.hideUploadingNotification();
    }
  },

  updateNotification() {
    let notification = gComposeNotification.getNotificationWithValue(
      "bigAttachment"
    );

    if (this.bigFiles.length) {
      if (notification) {
        notification.label = this.formatString(
          "bigFileDescription",
          [this.bigFiles.length],
          this.bigFiles.length
        );
        return;
      }

      let buttons = [
        {
          label: getComposeBundle().getString("learnMore.label"),
          accessKey: getComposeBundle().getString("learnMore.accesskey"),
          callback: this.openLearnMore.bind(this),
        },
        {
          label: this.formatString("bigFileShare.label", []),
          accessKey: this.formatString("bigFileShare.accesskey"),
          callback: this.convertAttachments.bind(this),
        },
        {
          label: this.formatString("bigFileAttach.label", []),
          accessKey: this.formatString("bigFileAttach.accesskey"),
          callback: this.hideNotification.bind(this),
        },
      ];

      let msg = this.formatString(
        "bigFileDescription",
        [this.bigFiles.length],
        this.bigFiles.length
      );

      notification = gComposeNotification.appendNotification(
        msg,
        "bigAttachment",
        null,
        gComposeNotification.PRIORITY_WARNING_MEDIUM,
        buttons
      );
    } else if (notification) {
      gComposeNotification.removeNotification(notification);
    }
  },

  openLearnMore() {
    let url = Services.prefs.getCharPref("mail.cloud_files.learn_more_url");
    openContentTab(url);
    return true;
  },

  convertAttachments() {
    let account;
    let accounts = cloudFileAccounts.configuredAccounts;

    if (accounts.length == 1) {
      account = accounts[0];
    } else if (accounts.length > 1) {
      // We once used Services.prompt.select for this UI, but it doesn't support displaying an
      // icon for each item. The following code does the same thing with a replacement dialog.
      let { PromptUtils } = ChromeUtils.import(
        "resource://gre/modules/SharedPromptUtils.jsm"
      );

      let names = accounts.map(i => cloudFileAccounts.getDisplayName(i));
      let icons = accounts.map(i => i.iconURL);
      let args = {
        promptType: "select",
        title: this.formatString("bigFileChooseAccount.title"),
        text: this.formatString("bigFileChooseAccount.text"),
        list: names,
        icons,
        selected: -1,
        ok: false,
      };

      let propBag = PromptUtils.objectToPropBag(args);
      openDialog(
        "chrome://messenger/content/cloudfile/selectDialog.xhtml",
        "_blank",
        "centerscreen,chrome,modal,titlebar",
        propBag
      );
      PromptUtils.propBagToObject(propBag, args);

      if (args.ok) {
        account = accounts[args.selected];
      }
    } else {
      openPreferencesTab("paneCompose", "compositionAttachmentsCategory");
      return true;
    }

    if (account) {
      convertToCloudAttachment(this.bigFiles, account);
    }

    return false;
  },

  hideNotification() {
    let never = {};
    if (
      Services.prompt.confirmCheck(
        window,
        this.formatString("bigFileHideNotification.title"),
        this.formatString("bigFileHideNotification.text"),
        this.formatString("bigFileHideNotification.check"),
        never
      )
    ) {
      this.hide(never.value);
      return false;
    }
    return true;
  },

  showUploadingNotification(aAttachments) {
    // We will show the uploading notification for a minimum of 2.5 seconds
    // seconds.
    const kThreshold = 2500; // milliseconds

    if (
      !aAttachments.length ||
      !Services.prefs.getBoolPref(
        "mail.compose.big_attachments.insert_notification"
      )
    ) {
      return;
    }

    let notification = gComposeNotification.getNotificationWithValue(
      kUploadNotificationValue
    );

    if (notification) {
      return;
    }

    let message = this.formatString("cloudFileUploadingNotification");
    message = PluralForm.get(aAttachments.length, message);
    let showUploadButton = {
      accessKey: this.formatString(
        "stopShowingUploadingNotification.accesskey"
      ),
      label: this.formatString("stopShowingUploadingNotification.label"),
      callback(aNotificationBar, aButton) {
        Services.prefs.setBoolPref(
          "mail.compose.big_attachments.insert_notification",
          false
        );
      },
    };
    notification = gComposeNotification.appendNotification(
      message,
      kUploadNotificationValue,
      null,
      gComposeNotification.PRIORITY_WARNING_MEDIUM,
      [showUploadButton]
    );
    notification.timeout = Date.now() + kThreshold;
  },

  hideUploadingNotification() {
    let notification = gComposeNotification.getNotificationWithValue(
      kUploadNotificationValue
    );

    if (notification) {
      // Check the timestamp that we stashed in the timeout field of the
      // notification...
      let now = Date.now();
      if (now >= notification.timeout) {
        gComposeNotification.removeNotification(notification);
      } else {
        setTimeout(function() {
          gComposeNotification.removeNotification(notification);
        }, notification.timeout - now);
      }
    }
  },

  showPrivacyNotification() {
    const kPrivacyNotificationValue = "bigAttachmentPrivacyWarning";
    let notification = gComposeNotification.getNotificationWithValue(
      kPrivacyNotificationValue
    );

    if (notification) {
      return;
    }

    let message = this.formatString("cloudFilePrivacyNotification");
    gComposeNotification.appendNotification(
      message,
      kPrivacyNotificationValue,
      null,
      gComposeNotification.PRIORITY_WARNING_MEDIUM,
      null
    );
  },

  _anyUploadsInProgress() {
    let bucket = document.getElementById("attachmentBucket");
    for (let i = 0, rowCount = bucket.getRowCount(); i < rowCount; ++i) {
      let item = bucket.getItemAtIndex(i);
      if (item && item.uploading) {
        return true;
      }
    }
    return false;
  },
};

window.addEventListener(
  "compose-window-init",
  gBigFileObserver.init.bind(gBigFileObserver),
  true
);
