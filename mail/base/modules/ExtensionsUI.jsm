/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [];

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});

XPCOMUtils.defineLazyGetter(this, "addonsBundle", function() {
  return new StringBundle("chrome://messenger/locale/addons.properties");
});
XPCOMUtils.defineLazyGetter(this, "brandBundle", function() {
  return new StringBundle("chrome://branding/locale/brand.properties");
});

function getNotification(id, browser) {
  return browser.ownerGlobal.PopupNotifications.getNotification(id, browser);
}

function showNotification(browser, ...args) {
  let notifications = browser.ownerGlobal.PopupNotifications;
  return notifications.show(browser, ...args);
}

// Removes a doorhanger notification if all of the installs it was notifying
// about have ended in some way.
function removeNotificationOnEnd(notification, installs) {
  let count = installs.length;

  function maybeRemove(install) {
    install.removeListener(this);

    if (--count == 0) {
      // Check that the notification is still showing
      let current = getNotification(notification.id, notification.browser);
      if (current === notification) {
        notification.remove();
      }
    }
  }

  for (let install of installs) {
    install.addListener({
      onDownloadCancelled: maybeRemove,
      onDownloadFailed: maybeRemove,
      onInstallFailed: maybeRemove,
      onInstallEnded: maybeRemove,
    });
  }
}

var gXPInstallObserver = {
  pendingInstalls: new WeakMap(),

  showInstallConfirmation(browser, installInfo, height = undefined) {
    let document = browser.ownerDocument;
    // If the confirmation notification is already open cache the installInfo
    // and the new confirmation will be shown later
    if (getNotification("addon-install-confirmation", browser)) {
      let pending = this.pendingInstalls.get(browser);
      if (pending) {
        pending.push(installInfo);
      } else {
        this.pendingInstalls.set(browser, [installInfo]);
      }
      return;
    }

    let showNextConfirmation = () => {
      let pending = this.pendingInstalls.get(browser);
      if (pending && pending.length) {
        this.showInstallConfirmation(browser, pending.shift());
      }
    };

    // If all installs have already been cancelled in some way then just show
    // the next confirmation.
    if (installInfo.installs.every(i => i.state != AddonManager.STATE_DOWNLOADED)) {
      showNextConfirmation();
      return;
    }

    const anchorID = "addons-notification-icon";

    // Make notifications persistent
    var options = {
      displayURI: installInfo.originatingURI,
      persistent: true,
      hideClose: true,
    };

    let acceptInstallation = () => {
      for (let install of installInfo.installs) {
        install.install();
      }
      installInfo = null;
    };

    let cancelInstallation = () => {
      if (installInfo) {
        for (let install of installInfo.installs) {
          // The notification may have been closed because the add-ons got
          // cancelled elsewhere, only try to cancel those that are still
          // pending install.
          if (install.state != AddonManager.STATE_CANCELLED) {
            install.cancel();
          }
        }
      }

      showNextConfirmation();
    };

    options.eventCallback = event => {
      switch (event) {
        case "removed":
          cancelInstallation();
          break;
        case "shown":
          let addonList = document.getElementById("addon-install-confirmation-content");
          while (addonList.firstChild) {
            addonList.firstChild.remove();
          }

          for (let install of installInfo.installs) {
            let container = document.createXULElement("hbox");

            let name = document.createXULElement("label");
            name.setAttribute("value", install.addon.name);
            name.setAttribute("class", "addon-install-confirmation-name");
            container.appendChild(name);

            addonList.appendChild(container);
          }
          break;
      }
    };

    options.learnMoreURL = Services.urlFormatter.formatURLPref("app.support.baseURL");

    let messageString;
    let notification = document.getElementById("addon-install-confirmation-notification");
    messageString = addonsBundle.getString("addonConfirmInstall.message");
    notification.removeAttribute("warning");
    options.learnMoreURL += "find-and-install-add-ons";

    let brandShortName = brandBundle.getString("brandShortName");

    messageString = PluralForm.get(installInfo.installs.length, messageString);
    messageString = messageString.replace("#1", brandShortName);
    messageString = messageString.replace("#2", installInfo.installs.length);

    let action = {
      label: addonsBundle.getString("addonInstall.acceptButton2.label"),
      accessKey: addonsBundle.getString("addonInstall.acceptButton2.accesskey"),
      callback: acceptInstallation,
    };

    let secondaryAction = {
      label: addonsBundle.getString("addonInstall.cancelButton.label"),
      accessKey: addonsBundle.getString("addonInstall.cancelButton.accesskey"),
      callback: () => {},
    };

    if (height) {
      notification.style.minHeight = height + "px";
    }

    let popup = showNotification(browser, "addon-install-confirmation", messageString, anchorID,
                                 action, [secondaryAction], options);
    removeNotificationOnEnd(popup, installInfo.installs);
  },

  observe(subject, topic, data) {
    let installInfo = subject.wrappedJSObject;
    let browser = installInfo.browser;
    let window = browser.ownerGlobal;

    const anchorID = "addons-notification-icon";
    var messageString, action;
    var brandShortName = brandBundle.getString("brandShortName");

    var notificationID = topic;
    // Make notifications persistent
    var options = {
      displayURI: installInfo.originatingURI,
      persistent: true,
      hideClose: true,
      timeout: Date.now() + 30000,
    };

    switch (topic) {
      case "addon-install-disabled": {
        notificationID = "xpinstall-disabled";
        let secondaryActions = null;

        if (Services.prefs.prefIsLocked("xpinstall.enabled")) {
          messageString = addonsBundle.getString("xpinstallDisabledMessageLocked");
        } else {
          messageString = addonsBundle.getString("xpinstallDisabledMessage");

          action = {
            label: addonsBundle.getString("xpinstallDisabledButton"),
            accessKey: addonsBundle.getString("xpinstallDisabledButton.accesskey"),
            callback: () => {
              Services.prefs.setBoolPref("xpinstall.enabled", true);
            },
          };

          secondaryActions = [{
            label: addonsBundle.getString("addonInstall.cancelButton.label"),
            accessKey: addonsBundle.getString("addonInstall.cancelButton.accesskey"),
            callback: () => {},
          }];
        }

        showNotification(browser, notificationID, messageString, anchorID,
                         action, secondaryActions, options);
        break;
      }
      case "addon-install-origin-blocked": {
        messageString = addonsBundle.getFormattedString("xpinstallPromptMessage", [brandShortName]);

        options.removeOnDismissal = true;
        options.persistent = false;

        let popup = showNotification(browser, notificationID, messageString, anchorID,
                                     null, null, options);
        removeNotificationOnEnd(popup, installInfo.installs);
        break;
      }
      case "addon-install-blocked": {
        messageString = addonsBundle.getFormattedString("xpinstallPromptMessage", [brandShortName]);

        action = {
          label: addonsBundle.getString("xpinstallPromptAllowButton"),
          accessKey: addonsBundle.getString("xpinstallPromptAllowButton.accesskey"),
          callback() {
            installInfo.install();
          },
        };
        let secondaryAction = {
          label: addonsBundle.getString("xpinstallPromptMessage.dontAllow"),
          accessKey: addonsBundle.getString("xpinstallPromptMessage.dontAllow.accesskey"),
          callback: () => {
            for (let install of installInfo.installs) {
              if (install.state != AddonManager.STATE_CANCELLED) {
                install.cancel();
              }
            }
          },
        };

        let popup = showNotification(browser, notificationID, messageString, anchorID,
                                     action, [secondaryAction], options);
        removeNotificationOnEnd(popup, installInfo.installs);
        break;
      }
      case "addon-install-started": {
        let needsDownload = function(install) {
          return install.state != AddonManager.STATE_DOWNLOADED;
        };
        // If all installs have already been downloaded then there is no need to
        // show the download progress.
        if (!installInfo.installs.some(needsDownload)) {
          return;
        }
        notificationID = "addon-progress";
        messageString = addonsBundle.getString("addonDownloadingAndVerifying");
        messageString = PluralForm.get(installInfo.installs.length, messageString);
        messageString = messageString.replace("#1", installInfo.installs.length);
        options.installs = installInfo.installs;
        options.contentWindow = browser.contentWindow;
        options.sourceURI = browser.currentURI;
        options.eventCallback = function(event) {
          switch (event) {
            case "shown":
              let notificationElement = [...this.owner.panel.children]
                                        .find(n => n.notification == this);
              if (notificationElement) {
                notificationElement.setAttribute("mainactiondisabled", "true");
              }
              break;
            case "removed":
              options.contentWindow = null;
              options.sourceURI = null;
              break;
          }
        };
        action = {
          label: addonsBundle.getString("addonInstall.acceptButton2.label"),
          accessKey: addonsBundle.getString("addonInstall.acceptButton2.accesskey"),
          callback: () => {},
        };
        let secondaryAction = {
          label: addonsBundle.getString("addonInstall.cancelButton.label"),
          accessKey: addonsBundle.getString("addonInstall.cancelButton.accesskey"),
          callback: () => {
            for (let install of installInfo.installs) {
              if (install.state != AddonManager.STATE_CANCELLED) {
                install.cancel();
              }
            }
          },
        };
        let notification = showNotification(browser, notificationID, messageString, anchorID,
                                            action, [secondaryAction], options);
        notification._startTime = Date.now();
        break;
      }
      case "addon-install-failed": {
        options.removeOnDismissal = true;
        options.persistent = false;

        // TODO This isn't terribly ideal for the multiple failure case
        for (let install of installInfo.installs) {
          let host;
          try {
            host  = options.displayURI.host;
          } catch (e) {
            // displayURI might be missing or 'host' might throw for non-nsStandardURL nsIURIs.
          }

          if (!host) {
            host = (install.sourceURI instanceof Ci.nsIStandardURL) &&
                   install.sourceURI.host;
          }

          let error = (host || install.error == 0) ? "addonInstallError" : "addonLocalInstallError";
          let args;
          if (install.error < 0) {
            error += install.error;
            args = [brandShortName, install.name];
          } else if (install.addon.blocklistState == Ci.nsIBlocklistService.STATE_BLOCKED) {
            error += "Blocklisted";
            args = [install.name];
          } else {
            error += "Incompatible";
            args = [brandShortName, Services.appinfo.version, install.name];
          }

          messageString = addonsBundle.getFormattedString(error, args);

          showNotification(browser, notificationID, messageString, anchorID,
                           action, null, options);

          // Can't have multiple notifications with the same ID, so stop here.
          break;
        }
        this._removeProgressNotification(browser);
        break;
      }
      case "addon-install-confirmation": {
        let showNotification = () => {
          let height;
          if (window.PopupNotifications.isPanelOpen) {
            let rect = browser.ownerDocument.getElementById("addon-progress-notification")
                                            .getBoundingClientRect();
            height = rect.height;
          }

          this._removeProgressNotification(browser);
          this.showInstallConfirmation(browser, installInfo, height);
        };

        let progressNotification = getNotification("addon-progress", browser);
        if (progressNotification) {
          let downloadDuration = Date.now() - progressNotification._startTime;
          let securityDelay = Services.prefs.getIntPref("security.dialog_enable_delay");
          if (securityDelay > downloadDuration) {
            setTimeout(() => {
              // The download may have been cancelled during the security delay
              if (getNotification("addon-progress", browser)) {
                showNotification();
              }
            }, securityDelay - downloadDuration);
            break;
          }
        }
        showNotification();
        break;
      }
      case "addon-install-complete": {
        let secondaryActions = null;
        let numAddons = installInfo.installs.length;

        if (numAddons == 1) {
          messageString = addonsBundle.getFormattedString("addonInstalled",
                                                          [installInfo.installs[0].name]);
        } else {
          messageString = addonsBundle.getString("addonsGenericInstalled");
          messageString = PluralForm.get(numAddons, messageString);
          messageString = messageString.replace("#1", numAddons);
        }
        action = null;

        options.removeOnDismissal = true;
        options.persistent = false;

        showNotification(browser, notificationID, messageString, anchorID,
                         action, secondaryActions, options);
        break;
      }
    }
  },
  _removeProgressNotification(browser) {
    let notification = getNotification("addon-progress", browser);
    if (notification) {
      notification.remove();
    }
  },
};

Services.obs.addObserver(gXPInstallObserver, "addon-install-disabled");
Services.obs.addObserver(gXPInstallObserver, "addon-install-origin-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-started");
Services.obs.addObserver(gXPInstallObserver, "addon-install-failed");
Services.obs.addObserver(gXPInstallObserver, "addon-install-confirmation");
Services.obs.addObserver(gXPInstallObserver, "addon-install-complete");
