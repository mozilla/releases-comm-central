/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ExtensionsUI"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { EventEmitter } = ChromeUtils.import(
  "resource://gre/modules/EventEmitter.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  AddonManagerPrivate: "resource://gre/modules/AddonManager.jsm",
  AMTelemetry: "resource://gre/modules/AddonManager.jsm",
  AppMenuNotifications: "resource://gre/modules/AppMenuNotifications.jsm",
  ExtensionData: "resource://gre/modules/Extension.jsm",
  ExtensionParent: "resource://gre/modules/ExtensionParent.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});

const ADDONS_PROPERTIES = "chrome://messenger/locale/addons.properties";

XPCOMUtils.defineLazyGetter(this, "addonsBundle", function() {
  return Services.strings.createBundle(ADDONS_PROPERTIES);
});
XPCOMUtils.defineLazyGetter(this, "brandShortName", function() {
  return Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandShortName");
});

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "WEBEXT_PERMISSION_PROMPTS",
  "extensions.webextPermissionPrompts",
  false
);

const DEFAULT_EXTENSION_ICON =
  "chrome://mozapps/skin/extensions/extensionGeneric.svg";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function getTopWindow() {
  return Services.wm.getMostRecentWindow("mail:3pane");
}

function getNotification(id, browser) {
  return getTopWindow().PopupNotifications.getNotification(id, browser);
}

function getTabBrowser(browser) {
  while (browser.ownerGlobal.docShell.itemType !== Ci.nsIDocShell.typeChrome) {
    browser = browser.ownerGlobal.docShell.chromeEventHandler;
  }
  if (browser.getAttribute("webextension-view-type") == "popup") {
    browser = browser.ownerGlobal.gBrowser.selectedBrowser;
  }
  return { browser, window: browser.ownerGlobal };
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

/**
 * This object is Thunderbird's version of the same object in
 * browser/base/content/browser-addons.js. Firefox has one of these objects
 * per window but Thunderbird has only one total, because we simply pick the
 * most recent window for notifications, rather than the window related to a
 * particular tab.
 */
var gXPInstallObserver = {
  pendingInstalls: new WeakMap(),

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

      Services.telemetry
        .getHistogramById("SECURITY_UI")
        .add(
          Ci.nsISecurityUITelemetry.WARNING_CONFIRM_ADDON_INSTALL_CLICK_THROUGH
        );
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
    messageString = addonsBundle.GetStringFromName(
      "addonConfirmInstall.message"
    );
    notification.removeAttribute("warning");
    options.learnMoreURL += "find-and-install-add-ons";

    messageString = PluralForm.get(installInfo.installs.length, messageString);
    messageString = messageString.replace("#1", brandShortName);
    messageString = messageString.replace("#2", installInfo.installs.length);

    let action = {
      label: addonsBundle.GetStringFromName("addonInstall.acceptButton2.label"),
      accessKey: addonsBundle.GetStringFromName(
        "addonInstall.acceptButton2.accesskey"
      ),
      callback: acceptInstallation,
    };

    let secondaryAction = {
      label: addonsBundle.GetStringFromName("addonInstall.cancelButton.label"),
      accessKey: addonsBundle.GetStringFromName(
        "addonInstall.cancelButton.accesskey"
      ),
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

    Services.telemetry
      .getHistogramById("SECURITY_UI")
      .add(Ci.nsISecurityUITelemetry.WARNING_CONFIRM_ADDON_INSTALL);
  },

  observe(subject, topic, data) {
    let installInfo = subject.wrappedJSObject;
    let browser = installInfo.browser || installInfo.target;
    let window = getTopWindow();

    const anchorID = "addons-notification-icon";
    var messageString, action;

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
          messageString = addonsBundle.GetStringFromName(
            "xpinstallDisabledMessageLocked"
          );
        } else {
          messageString = addonsBundle.GetStringFromName(
            "xpinstallDisabledMessage"
          );

          action = {
            label: addonsBundle.GetStringFromName("xpinstallDisabledButton"),
            accessKey: addonsBundle.GetStringFromName(
              "xpinstallDisabledButton.accesskey"
            ),
            callback: () => {
              Services.prefs.setBoolPref("xpinstall.enabled", true);
            },
          };

          secondaryActions = [
            {
              label: addonsBundle.GetStringFromName(
                "addonInstall.cancelButton.label"
              ),
              accessKey: addonsBundle.GetStringFromName(
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
        messageString = addonsBundle.formatStringFromName(
          "xpinstallPromptMessage",
          [brandShortName]
        );

        if (Services.policies) {
          let extensionSettings = Services.policies.getExtensionSettings("*");
          if (
            extensionSettings &&
            "blocked_install_message" in extensionSettings
          ) {
            messageString += " " + extensionSettings.blocked_install_message;
          }
        }

        options.removeOnDismissal = true;
        options.persistent = false;

        let secHistogram = Services.telemetry.getHistogramById("SECURITY_UI");
        secHistogram.add(
          Ci.nsISecurityUITelemetry.WARNING_ADDON_ASKING_PREVENTED
        );
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
        let hasHost = !!options.displayURI;
        if (hasHost) {
          messageString = addonsBundle.formatStringFromName(
            "xpinstallPromptMessage.header",
            ["<>"]
          );
          options.name = options.displayURI.displayHost;
        } else {
          messageString = addonsBundle.GetStringFromName(
            "xpinstallPromptMessage.header.unknown"
          );
        }
        // displayURI becomes it's own label, so we unset it for this panel.
        // It will become part of the messageString above.
        options.displayURI = undefined;

        options.eventCallback = topic => {
          if (topic !== "showing") {
            return;
          }
          let doc = browser.ownerDocument;
          let message = doc.getElementById("addon-install-blocked-message");
          // We must remove any prior use of this panel message in this window.
          while (message.firstChild) {
            message.firstChild.remove();
          }
          if (hasHost) {
            let text = addonsBundle.GetStringFromName(
              "xpinstallPromptMessage.message"
            );
            let b = doc.createElementNS("http://www.w3.org/1999/xhtml", "b");
            b.textContent = options.name;
            let fragment = getLocalizedFragment(doc, text, b);
            message.appendChild(fragment);
          } else {
            message.textContent = addonsBundle.GetStringFromName(
              "xpinstallPromptMessage.message.unknown"
            );
          }
          let learnMore = doc.getElementById("addon-install-blocked-info");
          learnMore.textContent = addonsBundle.GetStringFromName(
            "xpinstallPromptMessage.learnMore"
          );
          learnMore.setAttribute(
            "href",
            Services.urlFormatter.formatURLPref("app.support.baseURL") +
              "unlisted-extensions-risks"
          );
        };

        let secHistogram = Services.telemetry.getHistogramById("SECURITY_UI");
        action = {
          label: addonsBundle.GetStringFromName(
            "xpinstallPromptMessage.install"
          ),
          accessKey: addonsBundle.GetStringFromName(
            "xpinstallPromptMessage.install.accesskey"
          ),
          callback() {
            secHistogram.add(
              Ci.nsISecurityUITelemetry
                .WARNING_ADDON_ASKING_PREVENTED_CLICK_THROUGH
            );
            installInfo.install();
          },
        };
        let dontAllowAction = {
          label: addonsBundle.GetStringFromName(
            "xpinstallPromptMessage.dontAllow"
          ),
          accessKey: addonsBundle.GetStringFromName(
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

        secHistogram.add(
          Ci.nsISecurityUITelemetry.WARNING_ADDON_ASKING_PREVENTED
        );
        let popup = showNotification(
          browser,
          notificationID,
          messageString,
          anchorID,
          action,
          [dontAllowAction],
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
        messageString = addonsBundle.GetStringFromName(
          "addonDownloadingAndVerifying"
        );
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
            case "removed":
              options.contentWindow = null;
              options.sourceURI = null;
              break;
          }
        };
        action = {
          label: addonsBundle.GetStringFromName(
            "addonInstall.acceptButton2.label"
          ),
          accessKey: addonsBundle.GetStringFromName(
            "addonInstall.acceptButton2.accesskey"
          ),
          disabled: true,
          callback: () => {},
        };
        let secondaryAction = {
          label: addonsBundle.GetStringFromName(
            "addonInstall.cancelButton.label"
          ),
          accessKey: addonsBundle.GetStringFromName(
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

          if (
            install.addon &&
            !Services.policies.mayInstallAddon(install.addon)
          ) {
            error = "addonInstallBlockedByPolicy";
            let extensionSettings = Services.policies.getExtensionSettings(
              install.addon.id
            );
            let message = "";
            if (
              extensionSettings &&
              "blocked_install_message" in extensionSettings
            ) {
              message = " " + extensionSettings.blocked_install_message;
            }
            args = [install.name, install.addon.id, message];
          }

          messageString = addonsBundle.formatStringFromName(error, args);

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
          let securityDelay =
            Services.prefs.getIntPref("security.dialog_enable_delay") -
            downloadDuration;
          if (securityDelay > 0) {
            setTimeout(() => {
              // The download may have been cancelled during the security delay
              if (getNotification("addon-progress", browser)) {
                showNotification();
              }
            }, securityDelay);
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
          messageString = addonsBundle.formatStringFromName("addonInstalled", [
            installInfo.installs[0].name,
          ]);
        } else {
          messageString = addonsBundle.GetStringFromName(
            "addonsGenericInstalled"
          );
          messageString = PluralForm.get(numAddons, messageString);
          messageString = messageString.replace("#1", numAddons);
        }
        action = null;

        options.removeOnDismissal = true;
        options.persistent = false;

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

/**
 * This object is Thunderbird's version of the same object in
 * browser/modules/ExtensionsUI.jsm
 */
var ExtensionsUI = {
  sideloaded: new Set(),
  updates: new Set(),
  sideloadListener: null,
  histogram: null,

  pendingNotifications: new WeakMap(),

  async init() {
    this.histogram = Services.telemetry.getHistogramById(
      "EXTENSION_INSTALL_PROMPT_RESULT"
    );

    Services.obs.addObserver(this, "webextension-permission-prompt");
    Services.obs.addObserver(this, "webextension-update-permissions");
    Services.obs.addObserver(this, "webextension-install-notify");
    Services.obs.addObserver(this, "webextension-optional-permission-prompt");
    Services.obs.addObserver(this, "webextension-defaultsearch-prompt");

    this._checkForSideloaded();
  },

  async _checkForSideloaded() {
    let sideloaded = await AddonManagerPrivate.getNewSideloads();

    if (!sideloaded.length) {
      // No new side-loads. We're done.
      return;
    }

    // The ordering shouldn't matter, but tests depend on notifications
    // happening in a specific order.
    sideloaded.sort((a, b) => a.id.localeCompare(b.id));

    if (WEBEXT_PERMISSION_PROMPTS) {
      if (!this.sideloadListener) {
        this.sideloadListener = {
          onEnabled: addon => {
            if (!this.sideloaded.has(addon)) {
              return;
            }

            this.sideloaded.delete(addon);
            this._updateNotifications();

            if (this.sideloaded.size == 0) {
              AddonManager.removeAddonListener(this.sideloadListener);
              this.sideloadListener = null;
            }
          },
        };
        AddonManager.addAddonListener(this.sideloadListener);
      }

      for (let addon of sideloaded) {
        this.sideloaded.add(addon);
      }
      this._updateNotifications();
    }
  },

  _updateNotifications() {
    if (this.sideloaded.size + this.updates.size == 0) {
      AppMenuNotifications.removeNotification("addon-alert");
    } else {
      AppMenuNotifications.showBadgeOnlyNotification("addon-alert");
    }
    this.emit("change");
  },

  showSideloaded(tabbrowser, addon) {
    addon.markAsSeen();
    this.sideloaded.delete(addon);
    this._updateNotifications();

    let strings = this._buildStrings({
      addon,
      permissions: addon.userPermissions,
      type: "sideload",
    });

    AMTelemetry.recordManageEvent(addon, "sideload_prompt", {
      num_strings: strings.msgs.length,
    });

    this.showPermissionsPrompt(
      tabbrowser,
      strings,
      addon.iconURL,
      "sideload"
    ).then(async answer => {
      if (answer) {
        await addon.enable();
        this._updateNotifications();
        this.showInstallNotification(tabbrowser.selectedBrowser, addon);
      }
      this.emit("sideload-response");
    });
  },

  showUpdate(browser, info) {
    AMTelemetry.recordInstallEvent(info.install, {
      step: "permissions_prompt",
      num_strings: info.strings.msgs.length,
    });

    this.showPermissionsPrompt(
      browser,
      info.strings,
      info.addon.iconURL,
      "update"
    ).then(answer => {
      if (answer) {
        info.resolve();
      } else {
        info.reject();
      }
      // At the moment, this prompt will re-appear next time we do an update
      // check.  See bug 1332360 for proposal to avoid this.
      this.updates.delete(info);
      this._updateNotifications();
    });
  },

  async observe(subject, topic, data) {
    if (topic == "webextension-permission-prompt") {
      let { target, info } = subject.wrappedJSObject;

      let { browser } = getTabBrowser(target);

      // Dismiss the progress notification.  Note that this is bad if
      // there are multiple simultaneous installs happening, see
      // bug 1329884 for a longer explanation.
      let progressNotification = getNotification("addon-progress", browser);
      if (progressNotification) {
        progressNotification.remove();
      }

      let strings = this._buildStrings(info);
      let data = new ExtensionData(info.addon.getResourceURI());
      await data.loadManifest();
      if (data.manifest.experiment_apis) {
        // Add the experiment permission text and use the header for
        // extensions with permissions.
        strings.header = addonsBundle.formatStringFromName(
          "webextPerms.headerWithPerms",
          ["<>"]
        );
        strings.msgs = [
          addonsBundle.formatStringFromName(
            "webextPerms.description.experiment",
            [brandShortName]
          ),
        ];
        if (info.source != "AMO") {
          strings.experimentWarning = addonsBundle.GetStringFromName(
            "webextPerms.experimentWarning"
          );
        }
      }

      // If this is an update with no promptable permissions, just apply it. Skip
      // prompts also, if this add-on already has full access via experiment_apis.
      if (info.type == "update") {
        let extension = ExtensionParent.GlobalManager.getExtension(
          info.addon.id
        );
        if (
          !strings.msgs.length ||
          (extension && extension.manifest.experiment_apis)
        ) {
          info.resolve();
          return;
        }
      }

      let histkey;
      if (info.type == "sideload") {
        histkey = "sideload";
      } else if (info.type == "update") {
        histkey = "update";
      } else if (info.source == "AMO") {
        histkey = "installAmo";
      } else if (info.source == "local") {
        histkey = "installLocal";
      } else {
        histkey = "installWeb";
      }

      if (info.type == "sideload") {
        AMTelemetry.recordManageEvent(info.addon, "sideload_prompt", {
          num_strings: strings.msgs.length,
        });
      } else {
        AMTelemetry.recordInstallEvent(info.install, {
          step: "permissions_prompt",
          num_strings: strings.msgs.length,
        });
      }

      // Reject add-ons using the legacy API. We cannot use the general "ignore
      // unknown APIs" policy, as add-ons using the Legacy API from TB68 will
      // not do anything, confusing the user.
      if (data.manifest.legacy) {
        let subject = {
          wrappedJSObject: {
            browser,
            originatingURI: null,
            installs: [
              {
                addon: info.addon,
                name: info.addon.name,
                error: 0,
              },
            ],
            install: null,
            cancel: null,
          },
        };
        Services.obs.notifyObservers(subject, "addon-install-failed");
        info.reject();
        return;
      }

      this.showPermissionsPrompt(browser, strings, info.icon, histkey).then(
        answer => {
          if (answer) {
            info.resolve();
          } else {
            info.reject();
          }
        }
      );
    } else if (topic == "webextension-update-permissions") {
      let info = subject.wrappedJSObject;
      info.type = "update";
      let strings = this._buildStrings(info);

      // If we don't prompt for any new permissions, just apply it. Skip prompts
      // also, if this add-on already has full access via experiment_apis.
      let extension = ExtensionParent.GlobalManager.getExtension(info.addon.id);
      if (
        !strings.msgs.length ||
        (extension && extension.manifest.experiment_apis)
      ) {
        info.resolve();
        return;
      }

      let update = {
        strings,
        permissions: info.permissions,
        install: info.install,
        addon: info.addon,
        resolve: info.resolve,
        reject: info.reject,
      };

      this.updates.add(update);
      this._updateNotifications();
    } else if (topic == "webextension-install-notify") {
      let { target, addon, callback } = subject.wrappedJSObject;
      this.showInstallNotification(target, addon).then(() => {
        if (callback) {
          callback();
        }
      });
    } else if (topic == "webextension-optional-permission-prompt") {
      let browser = getTopWindow().document.getElementById("tabmail")
        .selectedBrowser;
      let { name, icon, permissions, resolve } = subject.wrappedJSObject;
      let strings = this._buildStrings({
        type: "optional",
        addon: { name },
        permissions,
      });

      // If we don't have any promptable permissions, just proceed
      if (!strings.msgs.length) {
        resolve(true);
        return;
      }
      resolve(this.showPermissionsPrompt(browser, strings, icon));
    } else if (topic == "webextension-defaultsearch-prompt") {
      let {
        browser,
        name,
        icon,
        respond,
        currentEngine,
        newEngine,
      } = subject.wrappedJSObject;

      let bundle = Services.strings.createBundle(ADDONS_PROPERTIES);

      let strings = {};
      strings.acceptText = bundle.GetStringFromName(
        "webext.defaultSearchYes.label"
      );
      strings.acceptKey = bundle.GetStringFromName(
        "webext.defaultSearchYes.accessKey"
      );
      strings.cancelText = bundle.GetStringFromName(
        "webext.defaultSearchNo.label"
      );
      strings.cancelKey = bundle.GetStringFromName(
        "webext.defaultSearchNo.accessKey"
      );
      strings.addonName = name;
      strings.text = bundle.formatStringFromName(
        "webext.defaultSearch.description",
        ["<>", currentEngine, newEngine]
      );

      this.showDefaultSearchPrompt(browser, strings, icon).then(respond);
    }
  },

  // Create a set of formatted strings for a permission prompt
  _buildStrings(info) {
    let bundle = Services.strings.createBundle(ADDONS_PROPERTIES);
    let info2 = Object.assign({ appName: brandShortName }, info);

    const getKeyForPermission = perm => {
      // Map permission names to permission description keys. If a description has
      // been updated, it needs a non-canonical mapping.
      switch (perm) {
        case "accountsRead":
        case "messagesMove":
          return `webextPerms.description.${perm}2`;
        default:
          return `webextPerms.description.${perm}`;
      }
    };

    let strings = ExtensionData.formatPermissionStrings(info2, bundle, {
      collapseOrigins: true,
      getKeyForPermission,
    });
    strings.addonName = info.addon.name;
    strings.learnMore = addonsBundle.GetStringFromName(
      "webextPerms.learnMore2"
    );
    return strings;
  },

  async showPermissionsPrompt(target, strings, icon, histkey) {
    let { browser, window } = getTabBrowser(target);

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
          listIntroEl.hidden = !strings.msgs.length || !strings.listIntro;

          let listInfoEl = doc.getElementById("addon-webext-perm-info");
          listInfoEl.textContent = strings.learnMore;
          listInfoEl.href =
            Services.urlFormatter.formatURLPref("app.support.baseURL") +
            "extension-permissions";
          listInfoEl.hidden = !strings.msgs.length;

          let list = doc.getElementById("addon-webext-perm-list");
          while (list.firstChild) {
            list.firstChild.remove();
          }
          let singleEntryEl = doc.getElementById(
            "addon-webext-perm-single-entry"
          );
          singleEntryEl.textContent = "";
          singleEntryEl.hidden = true;
          list.hidden = true;

          if (strings.msgs.length === 1) {
            singleEntryEl.textContent = strings.msgs[0];
            singleEntryEl.hidden = false;
          } else if (strings.msgs.length) {
            for (let msg of strings.msgs) {
              let item = doc.createElementNS(HTML_NS, "li");
              item.textContent = msg;
              list.appendChild(item);
            }
            list.hidden = false;
          }

          let experimentsEl = doc.getElementById(
            "addon-webext-experiment-warning"
          );
          experimentsEl.textContent = strings.experimentWarning;
          experimentsEl.hidden = !strings.experimentWarning;
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
          if (histkey) {
            this.histogram.add(histkey + "Accepted");
          }
          resolve(true);
        },
      };
      let secondaryActions = [
        {
          label: strings.cancelText,
          accessKey: strings.cancelKey,
          callback: () => {
            if (histkey) {
              this.histogram.add(histkey + "Rejected");
            }
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

  showDefaultSearchPrompt(target, strings, icon) {
    return new Promise(resolve => {
      let popupOptions = {
        hideClose: true,
        popupIconURL: icon || DEFAULT_EXTENSION_ICON,
        persistent: true,
        removeOnDismissal: true,
        eventCallback(topic) {
          if (topic == "removed") {
            resolve(false);
          }
        },
        name: strings.addonName,
      };

      let action = {
        label: strings.acceptText,
        accessKey: strings.acceptKey,
        disableHighlight: true,
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

      let { browser } = getTabBrowser(target);
      showNotification(
        browser,
        "addon-webext-defaultsearch",
        strings.text,
        "addons-notification-icon",
        action,
        secondaryActions,
        popupOptions
      );
    });
  },

  async showInstallNotification(target, addon) {
    let { browser, window } = getTabBrowser(target);
    let document = window.document;

    let message = addonsBundle.formatStringFromName(
      "addonPostInstall.message2",
      ["<>"]
    );

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

    showNotification(
      browser,
      "addon-installed",
      message,
      "addons-notification-icon",
      null,
      null,
      options
    );
  },
};

EventEmitter.decorate(ExtensionsUI);

/**
 * Generate a document fragment for a localized string that has DOM
 * node replacements. This avoids using getFormattedString followed
 * by assigning to innerHTML. Fluent can probably replace this when
 * it is in use everywhere.
 *
 * Lifted from BrowserUIUtils.jsm.
 *
 * @param {Document} doc
 * @param {String}   msg
 *                   The string to put replacements in. Fetch from
 *                   a stringbundle using getString or GetStringFromName,
 *                   or even an inserted dtd string.
 * @param {Node|String} nodesOrStrings
 *                   The replacement items. Can be a mix of Nodes
 *                   and Strings. However, for correct behaviour, the
 *                   number of items provided needs to exactly match
 *                   the number of replacement strings in the l10n string.
 * @returns {DocumentFragment}
 *                   A document fragment. In the trivial case (no
 *                   replacements), this will simply be a fragment with 1
 *                   child, a text node containing the localized string.
 */
function getLocalizedFragment(doc, msg, ...nodesOrStrings) {
  // Ensure replacement points are indexed:
  for (let i = 1; i <= nodesOrStrings.length; i++) {
    if (!msg.includes("%" + i + "$S")) {
      msg = msg.replace(/%S/, "%" + i + "$S");
    }
  }
  let numberOfInsertionPoints = msg.match(/%\d+\$S/g).length;
  if (numberOfInsertionPoints != nodesOrStrings.length) {
    Cu.reportError(
      `Message has ${numberOfInsertionPoints} insertion points, ` +
        `but got ${nodesOrStrings.length} replacement parameters!`
    );
  }

  let fragment = doc.createDocumentFragment();
  let parts = [msg];
  let insertionPoint = 1;
  for (let replacement of nodesOrStrings) {
    let insertionString = "%" + insertionPoint++ + "$S";
    let partIndex = parts.findIndex(
      part => typeof part == "string" && part.includes(insertionString)
    );
    if (partIndex == -1) {
      fragment.appendChild(doc.createTextNode(msg));
      return fragment;
    }

    if (typeof replacement == "string") {
      parts[partIndex] = parts[partIndex].replace(insertionString, replacement);
    } else {
      let [firstBit, lastBit] = parts[partIndex].split(insertionString);
      parts.splice(partIndex, 1, firstBit, replacement, lastBit);
    }
  }

  // Put everything in a document fragment:
  for (let part of parts) {
    if (typeof part == "string") {
      if (part) {
        fragment.appendChild(doc.createTextNode(part));
      }
    } else {
      fragment.appendChild(part);
    }
  }
  return fragment;
}
