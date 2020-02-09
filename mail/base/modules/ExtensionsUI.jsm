/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ExtensionsUI"];

const ADDONS_PROPERTIES = "chrome://messenger/locale/addons.properties";
const BRAND_PROPERTIES = "chrome://branding/locale/brand.properties";
const DEFAULT_EXTENSION_ICON =
  "chrome://mozapps/skin/extensions/extensionGeneric.svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  AddonManagerPrivate: "resource://gre/modules/AddonManager.jsm",
  ExtensionData: "resource://gre/modules/Extension.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  StringBundle: "resource:///modules/StringBundle.jsm",
});

XPCOMUtils.defineLazyGetter(this, "addonsBundle", function() {
  return new StringBundle(ADDONS_PROPERTIES);
});
XPCOMUtils.defineLazyGetter(this, "brandBundle", function() {
  return new StringBundle(BRAND_PROPERTIES);
});

function getTopWindow() {
  return Services.wm.getMostRecentWindow("mail:3pane");
}

function getNotification(id, browser) {
  return getTopWindow().PopupNotifications.getNotification(id, browser);
}

function showNotification(
  browser,
  id,
  message,
  anchorID,
  mainAction,
  secondaryActions,
  options
) {
  let notifications = getTopWindow().PopupNotifications;
  if (options.popupIconURL == "chrome://browser/content/extension.svg") {
    options.popupIconURL = DEFAULT_EXTENSION_ICON;
  }
  return notifications.show(
    browser,
    id,
    message,
    anchorID,
    mainAction,
    secondaryActions,
    options
  );
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
  pendingNotifications: new WeakMap(),

  showInstallConfirmation(browser, installInfo, height = undefined) {
    let document = getTopWindow().document;
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
    if (
      installInfo.installs.every(i => i.state != AddonManager.STATE_DOWNLOADED)
    ) {
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
          let addonList = document.getElementById(
            "addon-install-confirmation-content"
          );
          while (addonList.lastChild) {
            addonList.lastChild.remove();
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

    options.learnMoreURL = Services.urlFormatter.formatURLPref(
      "app.support.baseURL"
    );

    let messageString;
    let notification = document.getElementById(
      "addon-install-confirmation-notification"
    );
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

    let popup = showNotification(
      browser,
      "addon-install-confirmation",
      messageString,
      anchorID,
      action,
      [secondaryAction],
      options
    );
    removeNotificationOnEnd(popup, installInfo.installs);
  },

  async showPermissionsPrompt(browser, strings, icon) {
    let window = getTopWindow();

    // Wait for any pending prompts in this window to complete before
    // showing the next one.
    let pending;
    while ((pending = this.pendingNotifications.get(window))) {
      await pending;
    }

    let promise = new Promise(resolve => {
      function eventCallback(topic) {
        let doc = window.document;
        if (topic == "showing") {
          let textEl = doc.getElementById("addon-webext-perm-text");
          textEl.textContent = strings.text;
          textEl.hidden = !strings.text;

          let listIntroEl = doc.getElementById("addon-webext-perm-intro");
          listIntroEl.textContent = strings.listIntro;
          listIntroEl.hidden = strings.msgs.length == 0;

          let list = doc.getElementById("addon-webext-perm-list");
          while (list.lastChild) {
            list.lastChild.remove();
          }

          for (let msg of strings.msgs) {
            let item = doc.createElementNS(HTML_NS, "li");
            item.textContent = msg;
            list.appendChild(item);
          }
        } else if (topic == "swapping") {
          return true;
        }
        if (topic == "removed") {
          Services.tm.dispatchToMainThread(() => {
            resolve(false);
          });
        }
        return false;
      }

      let popupOptions = {
        hideClose: true,
        popupIconURL: icon || DEFAULT_EXTENSION_ICON,
        persistent: true,
        eventCallback,
        name: strings.addonName,
        removeOnDismissal: true,
      };

      let action = {
        label: strings.acceptText,
        accessKey: strings.acceptKey,
        callback: () => {
          resolve(true);
        },
      };
      let secondaryActions = [
        {
          label: strings.cancelText,
          accessKey: strings.cancelKey,
          callback: () => {
            resolve(false);
          },
        },
      ];

      showNotification(
        browser,
        "addon-webext-permissions",
        strings.header,
        "addons-notification-icon",
        action,
        secondaryActions,
        popupOptions
      );
    });

    this.pendingNotifications.set(window, promise);
    promise.finally(() => this.pendingNotifications.delete(window));
    return promise;
  },

  async showInstallNotification(browser, addon) {
    let window = getTopWindow();
    let document = window.document;

    let brandBundle = document.getElementById("bundle_brand");
    let appName = brandBundle.getString("brandShortName");

    let message = addonsBundle.getFormattedString("addonPostInstall.message1", [
      "<>",
      appName,
    ]);

    let icon = DEFAULT_EXTENSION_ICON;
    if (addon.isWebExtension) {
      icon = AddonManager.getPreferredIconURL(addon, 32, window) || icon;
    }

    let options = {
      hideClose: true,
      timeout: Date.now() + 30000,
      popupIconURL: icon,
      name: addon.name,
    };

    let list = document.getElementById("addon-installed-list");
    list.hidden = true;

    this._showInstallNotification(browser, message, options);
  },

  _showInstallNotification(browser, message, options) {
    showNotification(
      browser,
      "addon-installed",
      message,
      "addons-notification-icon",
      {
        label: addonsBundle.getString("addonPostInstall.okay.label"),
        accessKey: addonsBundle.getString("addonPostInstall.okay.accesskey"),
        callback: () => {},
      },
      null,
      options
    );
  },

  /* eslint-disable complexity */
  observe(subject, topic, data) {
    let installInfo = subject.wrappedJSObject;
    let browser = installInfo.browser || installInfo.target;
    let window = getTopWindow();

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
          messageString = addonsBundle.getString(
            "xpinstallDisabledMessageLocked"
          );
        } else {
          messageString = addonsBundle.getString("xpinstallDisabledMessage");

          action = {
            label: addonsBundle.getString("xpinstallDisabledButton"),
            accessKey: addonsBundle.getString(
              "xpinstallDisabledButton.accesskey"
            ),
            callback: () => {
              Services.prefs.setBoolPref("xpinstall.enabled", true);
            },
          };

          secondaryActions = [
            {
              label: addonsBundle.getString("addonInstall.cancelButton.label"),
              accessKey: addonsBundle.getString(
                "addonInstall.cancelButton.accesskey"
              ),
              callback: () => {},
            },
          ];
        }

        showNotification(
          browser,
          notificationID,
          messageString,
          anchorID,
          action,
          secondaryActions,
          options
        );
        break;
      }
      case "addon-install-origin-blocked": {
        messageString = addonsBundle.getFormattedString(
          "xpinstallPromptMessage",
          [brandShortName]
        );

        options.removeOnDismissal = true;
        options.persistent = false;

        let popup = showNotification(
          browser,
          notificationID,
          messageString,
          anchorID,
          null,
          null,
          options
        );
        removeNotificationOnEnd(popup, installInfo.installs);
        break;
      }
      case "addon-install-blocked": {
        messageString = addonsBundle.getFormattedString(
          "xpinstallPromptMessage",
          [brandShortName]
        );

        action = {
          label: addonsBundle.getString("xpinstallPromptAllowButton"),
          accessKey: addonsBundle.getString(
            "xpinstallPromptAllowButton.accesskey"
          ),
          callback() {
            installInfo.install();
          },
        };
        let secondaryAction = {
          label: addonsBundle.getString("xpinstallPromptMessage.dontAllow"),
          accessKey: addonsBundle.getString(
            "xpinstallPromptMessage.dontAllow.accesskey"
          ),
          callback: () => {
            for (let install of installInfo.installs) {
              if (install.state != AddonManager.STATE_CANCELLED) {
                install.cancel();
              }
            }
          },
        };

        let popup = showNotification(
          browser,
          notificationID,
          messageString,
          anchorID,
          action,
          [secondaryAction],
          options
        );
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
        messageString = PluralForm.get(
          installInfo.installs.length,
          messageString
        );
        messageString = messageString.replace(
          "#1",
          installInfo.installs.length
        );
        options.installs = installInfo.installs;
        options.contentWindow = browser.contentWindow;
        options.sourceURI = browser.currentURI;
        options.eventCallback = function(event) {
          switch (event) {
            case "shown":
              let notificationElement = [...this.owner.panel.children].find(
                n => n.notification == this
              );
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
          accessKey: addonsBundle.getString(
            "addonInstall.acceptButton2.accesskey"
          ),
          callback: () => {},
        };
        let secondaryAction = {
          label: addonsBundle.getString("addonInstall.cancelButton.label"),
          accessKey: addonsBundle.getString(
            "addonInstall.cancelButton.accesskey"
          ),
          callback: () => {
            for (let install of installInfo.installs) {
              if (install.state != AddonManager.STATE_CANCELLED) {
                install.cancel();
              }
            }
          },
        };
        let notification = showNotification(
          browser,
          notificationID,
          messageString,
          anchorID,
          action,
          [secondaryAction],
          options
        );
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
            host = options.displayURI.host;
          } catch (e) {
            // displayURI might be missing or 'host' might throw for non-nsStandardURL nsIURIs.
          }

          if (!host) {
            host =
              install.sourceURI instanceof Ci.nsIStandardURL &&
              install.sourceURI.host;
          }

          let error =
            host || install.error == 0
              ? "addonInstallError"
              : "addonLocalInstallError";
          let args;

          // Temporarily replace the usual warning message with this more-likely one.
          if (install.error < 0) {
            error += install.error;
            args = [brandShortName, install.name];
          } else if (
            install.addon.blocklistState == Ci.nsIBlocklistService.STATE_BLOCKED
          ) {
            error += "Blocklisted";
            args = [install.name];
          } else {
            error += "Incompatible";
            args = [brandShortName, Services.appinfo.version, install.name];
          }

          messageString = addonsBundle.getFormattedString(error, args);

          showNotification(
            browser,
            notificationID,
            messageString,
            anchorID,
            action,
            null,
            options
          );

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
            let rect = window.document
              .getElementById("addon-progress-notification")
              .getBoundingClientRect();
            height = rect.height;
          }

          this._removeProgressNotification(browser);
          this.showInstallConfirmation(browser, installInfo, height);
        };

        let progressNotification = getNotification("addon-progress", browser);
        if (progressNotification) {
          let downloadDuration = Date.now() - progressNotification._startTime;
          let securityDelay = Services.prefs.getIntPref(
            "security.dialog_enable_delay"
          );
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
        this.showInstallNotification(browser, installInfo.installs[0].addon);
        break;
      }
      case "webextension-permission-prompt": {
        let { info } = subject.wrappedJSObject;

        // Dismiss the progress notification.  Note that this is bad if
        // there are multiple simultaneous installs happening, see
        // bug 1329884 for a longer explanation.
        let progressNotification = getNotification("addon-progress", browser);
        if (progressNotification) {
          progressNotification.remove();
        }

        // This is where we should check for unsigned extensions, but Thunderbird
        // doesn't require signing, so we just skip checking.
        info.unsigned = false;

        let strings = this._buildStrings(info);

        // If this is an update with no promptable permissions, just apply it
        if (info.type == "update" && strings.msgs.length == 0) {
          info.resolve();
          return;
        }

        let icon = info.unsigned
          ? "chrome://global/skin/icons/warning.svg"
          : info.icon;

        this.showPermissionsPrompt(browser, strings, icon).then(answer => {
          if (answer) {
            info.resolve();
          } else {
            info.reject();
          }
        });
        break;
      }
      case "webextension-update-permissions": {
        let { info } = subject.wrappedJSObject;
        info.type = "update";
        let strings = this._buildStrings(info);

        // If we don't prompt for any new permissions, just apply it.
        if (strings.msgs.length == 0) {
          info.resolve();
        }

        this.showPermissionsPrompt(browser, strings, info.addon.iconURL).then(
          answer => {
            if (answer) {
              info.resolve();
            } else {
              info.reject();
            }
          }
        );
        break;
      }
      case "webextension-install-notify": {
        let { addon } = subject.wrappedJSObject;
        this.showInstallNotification(browser, addon);
        break;
      }
      case "webextension-optional-permission-prompt": {
        let { name, icon, permissions, resolve } = subject.wrappedJSObject;
        let strings = this._buildStrings({
          type: "optional",
          addon: { name },
          permissions,
        });

        // If we don't have any promptable permissions, just proceed
        if (strings.msgs.length == 0) {
          resolve(true);
          return;
        }
        resolve(this.showPermissionsPrompt(browser, strings, icon));
        break;
      }
    }
  },
  /* eslint-enable complexity */

  // Create a set of formatted strings for a permission prompt
  _buildStrings(info) {
    // This bundle isn't the same as addonsBundle.
    let bundle = Services.strings.createBundle(ADDONS_PROPERTIES);
    let appName = brandBundle.getString("brandShortName");
    let info2 = Object.assign({ appName }, info);

    let strings = ExtensionData.formatPermissionStrings(info2, bundle);
    strings.addonName = info.addon.name;
    return strings;
  },

  _removeProgressNotification(browser) {
    let notification = getNotification("addon-progress", browser);
    if (notification) {
      notification.remove();
    }
  },

  async _checkForSideloaded(browser) {
    let sideloaded = await AddonManagerPrivate.getNewSideloads();
    if (sideloaded.length == 0) {
      return;
    }

    // Check if the user wants any sideloaded add-ons installed.

    let enabled = [];
    for (let addon of sideloaded) {
      let strings = this._buildStrings({
        addon,
        permissions: addon.userPermissions,
        type: "sideload",
      });
      let answer = await this.showPermissionsPrompt(
        browser,
        strings,
        addon.iconURL
      );
      if (answer) {
        await addon.enable();
        enabled.push(addon);
      }
    }

    if (enabled.length == 0) {
      return;
    }

    // Confirm sideloaded add-ons were installed and ask to restart if necessary.

    if (enabled.length == 1) {
      this.showInstallNotification(browser, enabled[0]);
      return;
    }

    let document = getTopWindow().document;

    let brandBundle = document.getElementById("bundle_brand");
    let appName = brandBundle.getString("brandShortName");

    let message = addonsBundle.getFormattedString(
      "addonPostInstall.multiple.message",
      [appName]
    );

    let list = document.getElementById("addon-installed-list");
    list.hidden = false;
    while (list.lastChild) {
      list.lastChild.remove();
    }

    for (let addon of enabled) {
      let item = document.createElementNS(HTML_NS, "li");
      item.textContent = addon.name;
      list.appendChild(item);
    }

    let options = {
      popupIconURL: DEFAULT_EXTENSION_ICON,
      hideClose: true,
      timeout: Date.now() + 30000,
    };

    this._showInstallNotification(browser, message, options);
  },
};

Services.obs.addObserver(gXPInstallObserver, "addon-install-disabled");
Services.obs.addObserver(gXPInstallObserver, "addon-install-origin-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-started");
Services.obs.addObserver(gXPInstallObserver, "addon-install-failed");
Services.obs.addObserver(gXPInstallObserver, "addon-install-confirmation");
Services.obs.addObserver(gXPInstallObserver, "addon-install-complete");
Services.obs.addObserver(gXPInstallObserver, "webextension-permission-prompt");
Services.obs.addObserver(gXPInstallObserver, "webextension-update-permissions");
Services.obs.addObserver(gXPInstallObserver, "webextension-install-notify");
Services.obs.addObserver(
  gXPInstallObserver,
  "webextension-optional-permission-prompt"
);

var ExtensionsUI = {
  checkForSideloadedExtensions() {
    let win = Services.wm.getMostRecentWindow("mail:3pane");
    let tabmail = win.document.getElementById("tabmail");
    gXPInstallObserver._checkForSideloaded(tabmail.selectedBrowser);
  },
};
