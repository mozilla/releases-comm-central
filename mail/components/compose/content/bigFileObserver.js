/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

/* import-globals-from MsgComposeCommands.js */

var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
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
    const bucket = document.getElementById("attachmentBucket");
    bucket.addEventListener("attachments-added", this);
    bucket.addEventListener("attachments-removed", this);
    bucket.addEventListener("attachment-converted-to-regular", this);
    bucket.addEventListener("attachment-uploading", this);
    bucket.addEventListener("attachment-uploaded", this);
    bucket.addEventListener("attachment-upload-failed", this);

    this.sessionHidden = false;
    this.privacyWarned = false;
    this.bigFiles = [];
  },

  handleEvent(event) {
    if (this.hidden) {
      return;
    }

    switch (event.type) {
      case "attachments-added":
        this.bigFileTrackerAdd(event.detail);
        break;
      case "attachments-removed":
        this.bigFileTrackerRemove(event.detail);
        this.checkAndHidePrivacyNotification();
        break;
      case "attachment-converted-to-regular":
        this.checkAndHidePrivacyNotification();
        break;
      case "attachment-uploading":
        // Remove the currently uploading item from bigFiles, to remove the big
        // file notification already during upload.
        this.bigFileTrackerRemove([event.detail]);
        this.updateUploadingNotification();
        break;
      case "attachment-upload-failed":
        this.updateUploadingNotification();
        break;
      case "attachment-uploaded":
        this.updateUploadingNotification();
        if (this.uploadsInProgress == 0) {
          this.showPrivacyNotification();
        }
        break;
      default:
        // Do not update the notification for other events.
        return;
    }

    this.updateBigFileNotification();
  },

  bigFileTrackerAdd(aAttachments) {
    const threshold =
      Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") *
      1024;

    for (const attachment of aAttachments) {
      if (attachment.size >= threshold && !attachment.sendViaCloud) {
        this.bigFiles.push(attachment);
      }
    }
  },

  bigFileTrackerRemove(aAttachments) {
    for (const attachment of aAttachments) {
      const index = this.bigFiles.findIndex(e => e.url == attachment.url);
      if (index != -1) {
        this.bigFiles.splice(index, 1);
      }
    }
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

  _bigFileNotification: null,
  async updateBigFileNotification() {
    if (this._bigFileNotification) {
      // If `updateBigFileNotification` is called a second time before the
      // first time has finished, we could end up showing two notifications or
      // not removing the first notification, because `getNotificationWithValue`
      // does not account for the async nature of `appendNotification`.
      await this._bigFileNotification;
    }
    const bigFileNotification =
      gComposeNotification.getNotificationWithValue("bigAttachment");
    if (this.bigFiles.length) {
      if (bigFileNotification) {
        bigFileNotification.label = this.formatString(
          "bigFileDescription",
          [this.bigFiles.length],
          this.bigFiles.length
        );
        return;
      }

      const buttons = [
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
          callback: this.hideBigFileNotification.bind(this),
        },
      ];

      const msg = this.formatString(
        "bigFileDescription",
        [this.bigFiles.length],
        this.bigFiles.length
      );

      this._bigFileNotification = gComposeNotification
        .appendNotification(
          "bigAttachment",
          {
            label: msg,
            priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
          },
          buttons
        )
        .catch(console.warn);
    } else if (bigFileNotification) {
      gComposeNotification.removeNotification(bigFileNotification);
      this._bigFileNotification = null;
    }
  },

  openLearnMore() {
    const url = Services.prefs.getCharPref("mail.cloud_files.learn_more_url");
    openContentTab(url);
    return true;
  },

  convertAttachments() {
    let account;
    const accounts = cloudFileAccounts.configuredAccounts;

    if (accounts.length == 1) {
      account = accounts[0];
    } else if (accounts.length > 1) {
      // We once used Services.prompt.select for this UI, but it doesn't support displaying an
      // icon for each item. The following code does the same thing with a replacement dialog.
      const { PromptUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/PromptUtils.sys.mjs"
      );

      const names = accounts.map(i => cloudFileAccounts.getDisplayName(i));
      const icons = accounts.map(i => i.iconURL);
      const args = {
        promptType: "select",
        title: this.formatString("bigFileChooseAccount.title"),
        text: this.formatString("bigFileChooseAccount.text"),
        list: names,
        icons,
        selected: -1,
        ok: false,
      };

      const propBag = PromptUtils.objectToPropBag(args);
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

  hideBigFileNotification() {
    const never = {};
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

  _uploadingNotification: null,
  async updateUploadingNotification() {
    // We will show the uploading notification for a minimum of 2.5 seconds
    // seconds.
    const kThreshold = 2500; // milliseconds

    if (
      !Services.prefs.getBoolPref(
        "mail.compose.big_attachments.insert_notification"
      )
    ) {
      return;
    }

    const activeUploads = this.uploadsInProgress;
    if (this._uploadingNotification) {
      // If `updateUploadingNotification` is called a second time before the
      // first time has finished, we could end up showing two notifications or
      // not removing the first notification, because `getNotificationWithValue`
      // does not account for the async nature of `appendNotification`.
      await this._uploadingNotification;
    }
    const notification = gComposeNotification.getNotificationWithValue(
      kUploadNotificationValue
    );

    if (activeUploads == 0) {
      if (notification) {
        // Check the timestamp that we stashed in the timeout field of the
        // notification...
        const now = Date.now();
        if (now >= notification.timeout) {
          gComposeNotification.removeNotification(notification);
        } else {
          setTimeout(function () {
            gComposeNotification.removeNotification(notification);
          }, notification.timeout - now);
        }
      }
      this._uploadingNotification = null;
      return;
    }

    let message = this.formatString("cloudFileUploadingNotification");
    message = PluralForm.get(activeUploads, message);

    if (notification) {
      notification.label = message;
      return;
    }

    const showUploadButton = {
      accessKey: this.formatString(
        "stopShowingUploadingNotification.accesskey"
      ),
      label: this.formatString("stopShowingUploadingNotification.label"),
      callback() {
        Services.prefs.setBoolPref(
          "mail.compose.big_attachments.insert_notification",
          false
        );
      },
    };
    this._uploadingNotification = gComposeNotification
      .appendNotification(
        kUploadNotificationValue,
        {
          label: message,
          priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
        },
        [showUploadButton]
      )
      .then(notification2 => {
        notification2.timeout = Date.now() + kThreshold;
      }, console.warn);
  },

  hidePrivacyNotification() {
    this.privacyWarned = false;
    const notification = gComposeNotification.getNotificationWithValue(
      kPrivacyWarningNotificationValue
    );

    if (notification) {
      gComposeNotification.removeNotification(notification);
    }
  },

  checkAndHidePrivacyNotification() {
    if (
      !gAttachmentBucket.itemChildren.find(
        item => item.attachment && item.attachment.sendViaCloud
      )
    ) {
      this.hidePrivacyNotification();
    }
  },

  async showPrivacyNotification() {
    if (this.privacyWarned) {
      return;
    }
    this.privacyWarned = true;

    const notification = gComposeNotification.getNotificationWithValue(
      kPrivacyWarningNotificationValue
    );

    if (notification) {
      return;
    }

    const message = this.formatString("cloudFilePrivacyNotification");

    await gComposeNotification
      .appendNotification(
        kPrivacyWarningNotificationValue,
        {
          label: message,
          priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
        },
        null
      )
      .catch(console.warn);
  },

  get uploadsInProgress() {
    const items = [...document.getElementById("attachmentBucket").itemChildren];
    return items.filter(e => e.uploading).length;
  },
};

window.addEventListener(
  "compose-window-init",
  gBigFileObserver.init.bind(gBigFileObserver),
  true
);
