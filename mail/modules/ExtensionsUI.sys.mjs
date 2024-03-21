/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AMTelemetry: "resource://gre/modules/AddonManager.sys.mjs",
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  AddonManagerPrivate: "resource://gre/modules/AddonManager.sys.mjs",
  AppMenuNotifications: "resource://gre/modules/AppMenuNotifications.sys.mjs",
  ExtensionData: "resource://gre/modules/Extension.sys.mjs",
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
  SITEPERMS_ADDON_TYPE:
    "resource://gre/modules/addons/siteperms-addon-utils.sys.mjs",
});

import {
  PERMISSIONS_WITH_MESSAGE,
  PERMISSION_L10N_ID_OVERRIDES,
  PERMISSION_L10N,
} from "resource://gre/modules/ExtensionPermissionMessages.sys.mjs";

// Add the Thunderbird specific permission description locale file, to allow
// Extension.sys.mjs to resolve our permissions strings.
PERMISSION_L10N.addResourceIds(["messenger/extensionPermissions.ftl"]);

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      [
        "branding/brand.ftl",
        "messenger/extensionsUI.ftl",
        "messenger/addonNotifications.ftl",
      ],
      true
    )
);

const DEFAULT_EXTENSION_ICON =
  "chrome://mozapps/skin/extensions/extensionGeneric.svg";

const HTML_NS = "http://www.w3.org/1999/xhtml";

const THUNDERBIRD_ANCHOR_ID = "addons-notification-icon";

// Thunderbird shim of PopupNotifications for usage in this module.
var PopupNotifications = {
  get isPanelOpen() {
    return getTopWindow().PopupNotifications.isPanelOpen;
  },

  getNotification(id, browser) {
    return getTopWindow().PopupNotifications.getNotification(id, browser);
  },

  remove(notification, isCancel) {
    return getTopWindow().PopupNotifications.remove(notification, isCancel);
  },

  show(browser, id, message, anchorID, mainAction, secondaryActions, options) {
    const notifications = getTopWindow().PopupNotifications;
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
  },
};

function getTopWindow() {
  return Services.wm.getMostRecentWindow("mail:3pane");
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

// Removes a doorhanger notification if all of the installs it was notifying
// about have ended in some way.
function removeNotificationOnEnd(notification, installs) {
  let count = installs.length;

  function maybeRemove(install) {
    install.removeListener(this);

    if (--count == 0) {
      // Check that the notification is still showing
      const current = PopupNotifications.getNotification(
        notification.id,
        notification.browser
      );
      if (current === notification) {
        notification.remove();
      }
    }
  }

  for (const install of installs) {
    install.addListener({
      onDownloadCancelled: maybeRemove,
      onDownloadFailed: maybeRemove,
      onInstallFailed: maybeRemove,
      onInstallEnded: maybeRemove,
    });
  }
}

// Copied from browser/base/content/browser-addons.js
function buildNotificationAction(msg, callback) {
  let label = "";
  let accessKey = "";
  for (const { name, value } of msg.attributes) {
    switch (name) {
      case "label":
        label = value;
        break;
      case "accesskey":
        accessKey = value;
        break;
    }
  }
  return { label, accessKey, callback };
}

/**
 * Mapping of error code -> [error-id, local-error-id]
 *
 * error-id is used for errors in DownloadedAddonInstall,
 * local-error-id for errors in LocalAddonInstall.
 *
 * The error codes are defined in AddonManager's _errors Map.
 * Not all error codes listed there are translated,
 * since errors that are only triggered during updates
 * will never reach this code.
 *
 * @see browser/base/content/browser-addons.js (where this is copied from)
 */
const ERROR_L10N_IDS = new Map([
  [
    -1,
    [
      "addon-install-error-network-failure",
      "addon-local-install-error-network-failure",
    ],
  ],
  [
    -2,
    [
      "addon-install-error-incorrect-hash",
      "addon-local-install-error-incorrect-hash",
    ],
  ],
  [
    -3,
    [
      "addon-install-error-corrupt-file",
      "addon-local-install-error-corrupt-file",
    ],
  ],
  [
    -4,
    [
      "addon-install-error-file-access",
      "addon-local-install-error-file-access",
    ],
  ],
  [
    -5,
    ["addon-install-error-not-signed", "addon-local-install-error-not-signed"],
  ],
  [-8, ["addon-install-error-invalid-domain"]],
]);

// Add Thunderbird specific permissions so localization will work.
for (const perm of [
  "accountsFolders",
  "accountsIdentities",
  "accountsRead",
  "addressBooks",
  "compose",
  "compose-send",
  "compose-save",
  "experiment",
  "messagesImport",
  "messagesModify",
  "messagesModifyPermanent",
  "messagesMove",
  "messagesDelete",
  "messagesRead",
  "messagesUpdate",
  "messagesTags",
  "messagesTagsList",
  "sensitiveDataUpload",
]) {
  PERMISSIONS_WITH_MESSAGE.add(perm);
}

// Add entries to PERMISSION_L10N_ID_OVERRIDES here in case a permission string
// needs to be overridden.
for (const { perm, l10n } of [
  { perm: "messagesRead", l10n: "webext-perms-description-messagesRead2" },
]) {
  PERMISSION_L10N_ID_OVERRIDES.set(perm, l10n);
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

  // Themes do not have a permission prompt and instead call for an install
  // confirmation.
  showInstallConfirmation(browser, installInfo, height = undefined) {
    const document = getTopWindow().document;
    // If the confirmation notification is already open cache the installInfo
    // and the new confirmation will be shown later
    if (
      PopupNotifications.getNotification("addon-install-confirmation", browser)
    ) {
      const pending = this.pendingInstalls.get(browser);
      if (pending) {
        pending.push(installInfo);
      } else {
        this.pendingInstalls.set(browser, [installInfo]);
      }
      return;
    }

    const showNextConfirmation = () => {
      const pending = this.pendingInstalls.get(browser);
      if (pending && pending.length) {
        this.showInstallConfirmation(browser, pending.shift());
      }
    };

    // If all installs have already been cancelled in some way then just show
    // the next confirmation.
    if (
      installInfo.installs.every(
        i => i.state != lazy.AddonManager.STATE_DOWNLOADED
      )
    ) {
      showNextConfirmation();
      return;
    }

    // Make notifications persistent
    var options = {
      displayURI: installInfo.originatingURI,
      persistent: true,
      hideClose: true,
      popupOptions: {
        position: "bottomright topright",
      },
    };

    const acceptInstallation = () => {
      for (const install of installInfo.installs) {
        install.install();
      }
      installInfo = null;

      Services.telemetry
        .getHistogramById("SECURITY_UI")
        .add(
          Ci.nsISecurityUITelemetry.WARNING_CONFIRM_ADDON_INSTALL_CLICK_THROUGH
        );
    };

    const cancelInstallation = () => {
      if (installInfo) {
        for (const install of installInfo.installs) {
          // The notification may have been closed because the add-ons got
          // cancelled elsewhere, only try to cancel those that are still
          // pending install.
          if (install.state != lazy.AddonManager.STATE_CANCELLED) {
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
        case "shown": {
          const addonList = document.getElementById(
            "addon-install-confirmation-content"
          );
          while (addonList.lastChild) {
            addonList.lastChild.remove();
          }

          for (const install of installInfo.installs) {
            const container = document.createXULElement("hbox");

            const name = document.createXULElement("label");
            name.setAttribute("value", install.addon.name);
            name.setAttribute("class", "addon-install-confirmation-name");
            container.appendChild(name);

            addonList.appendChild(container);
          }
          break;
        }
      }
    };

    const notification = document.getElementById(
      "addon-install-confirmation-notification"
    );
    const msgId = "addon-confirm-install-message";
    notification.removeAttribute("warning");
    options.learnMoreURL =
      "https://support.thunderbird.net/kb/installing-addon-thunderbird";
    const addonCount = installInfo.installs.length;
    const messageString = lazy.l10n.formatValueSync(msgId, { addonCount });

    const [acceptMsg, cancelMsg] = lazy.l10n.formatMessagesSync([
      "addon-install-accept-button",
      "addon-install-cancel-button",
    ]);
    const action = buildNotificationAction(acceptMsg, acceptInstallation);
    const secondaryAction = buildNotificationAction(cancelMsg, () => {});

    if (height) {
      notification.style.minHeight = height + "px";
    }

    const popup = PopupNotifications.show(
      browser,
      "addon-install-confirmation",
      messageString,
      THUNDERBIRD_ANCHOR_ID,
      action,
      [secondaryAction],
      options
    );
    removeNotificationOnEnd(popup, installInfo.installs);

    Services.telemetry
      .getHistogramById("SECURITY_UI")
      .add(Ci.nsISecurityUITelemetry.WARNING_CONFIRM_ADDON_INSTALL);
  },

  // IDs of addon install related notifications
  NOTIFICATION_IDS: [
    "addon-install-blocked",
    "addon-install-confirmation",
    "addon-install-failed",
    "addon-install-origin-blocked",
    "addon-install-webapi-blocked",
    "addon-install-policy-blocked",
    "addon-progress",
    "addon-webext-permissions",
    "xpinstall-disabled",
  ],

  /**
   * Remove all opened addon installation notifications
   *
   * @param {*} browser - Browser to remove notifications for
   * @returns {boolean} - true if notifications have been removed.
   */
  removeAllNotifications(browser) {
    const notifications = this.NOTIFICATION_IDS.map(id =>
      PopupNotifications.getNotification(id, browser)
    ).filter(notification => notification != null);

    PopupNotifications.remove(notifications, true);

    return !!notifications.length;
  },

  async observe(aSubject, aTopic, aData) {
    const installInfo = aSubject.wrappedJSObject;
    const browser = installInfo.browser;

    // Make notifications persistent
    const options = {
      displayURI: installInfo.originatingURI,
      persistent: true,
      hideClose: true,
      timeout: Date.now() + 30000,
      popupOptions: {
        position: "bottomright topright",
      },
    };

    switch (aTopic) {
      case "addon-install-disabled": {
        let msgId, action, secondaryActions;
        if (Services.prefs.prefIsLocked("xpinstall.enabled")) {
          msgId = "xpinstall-disabled-locked";
          action = null;
          secondaryActions = null;
        } else {
          msgId = "xpinstall-disabled";
          const [disabledMsg, cancelMsg] = await lazy.l10n.formatMessages([
            "xpinstall-disabled-button",
            "addon-install-cancel-button",
          ]);
          action = buildNotificationAction(disabledMsg, () => {
            Services.prefs.setBoolPref("xpinstall.enabled", true);
          });
          secondaryActions = [buildNotificationAction(cancelMsg, () => {})];
        }

        PopupNotifications.show(
          browser,
          "xpinstall-disabled",
          await lazy.l10n.formatValue(msgId),
          THUNDERBIRD_ANCHOR_ID,
          action,
          secondaryActions,
          options
        );
        break;
      }
      case "addon-install-fullscreen-blocked": {
        // AddonManager denied installation because we are in DOM fullscreen
        this.logWarningFullScreenInstallBlocked();
        break;
      }
      case "addon-install-webapi-blocked":
      case "addon-install-policy-blocked":
      case "addon-install-origin-blocked": {
        const msgId =
          aTopic == "addon-install-policy-blocked"
            ? "addon-domain-blocked-by-policy"
            : "xpinstall-prompt";
        let messageString = await lazy.l10n.formatValue(msgId);
        if (Services.policies) {
          const extensionSettings = Services.policies.getExtensionSettings("*");
          if (
            extensionSettings &&
            "blocked_install_message" in extensionSettings
          ) {
            messageString += " " + extensionSettings.blocked_install_message;
          }
        }

        options.removeOnDismissal = true;
        options.persistent = false;

        const secHistogram = Services.telemetry.getHistogramById("SECURITY_UI");
        secHistogram.add(
          Ci.nsISecurityUITelemetry.WARNING_ADDON_ASKING_PREVENTED
        );
        const popup = PopupNotifications.show(
          browser,
          aTopic,
          messageString,
          THUNDERBIRD_ANCHOR_ID,
          null,
          null,
          options
        );
        removeNotificationOnEnd(popup, installInfo.installs);
        break;
      }
      case "addon-install-blocked": {
        const window = getTopWindow();
        await window.ensureCustomElements("moz-support-link");
        // Dismiss the progress notification.  Note that this is bad if
        // there are multiple simultaneous installs happening, see
        // bug 1329884 for a longer explanation.
        const progressNotification = PopupNotifications.getNotification(
          "addon-progress",
          browser
        );
        if (progressNotification) {
          progressNotification.remove();
        }

        // The informational content differs somewhat for site permission
        // add-ons. AOM no longer supports installing multiple addons,
        // so the array handling here is vestigial.
        const isSitePermissionAddon = installInfo.installs.every(
          ({ addon }) => addon?.type === lazy.SITEPERMS_ADDON_TYPE
        );
        let hasHost = false;
        let headerId, msgId;
        if (isSitePermissionAddon) {
          // At present, WebMIDI is the only consumer of the site permission
          // add-on infrastructure, and so we can hard-code a midi string here.
          // If and when we use it for other things, we'll need to plumb that
          // information through. See bug 1826747.
          headerId = "site-permission-install-first-prompt-midi-header";
          msgId = "site-permission-install-first-prompt-midi-message";
        } else if (options.displayURI) {
          // PopupNotifications.show replaces <> with options.name.
          headerId = { id: "xpinstall-prompt-header", args: { host: "<>" } };
          // getLocalizedFragment replaces %1$S with options.name.
          msgId = { id: "xpinstall-prompt-message", args: { host: "%1$S" } };
          options.name = options.displayURI.displayHost;
          hasHost = true;
        } else {
          headerId = "xpinstall-prompt-header-unknown";
          msgId = "xpinstall-prompt-message-unknown";
        }
        const [headerString, msgString] = await lazy.l10n.formatValues([
          headerId,
          msgId,
        ]);

        // displayURI becomes it's own label, so we unset it for this panel. It will become part of the
        // messageString above.
        const displayURI = options.displayURI;
        options.displayURI = undefined;

        options.eventCallback = topic => {
          if (topic !== "showing") {
            return;
          }
          const doc = browser.ownerDocument;
          const message = doc.getElementById("addon-install-blocked-message");
          // We must remove any prior use of this panel message in this window.
          while (message.firstChild) {
            message.firstChild.remove();
          }

          if (!hasHost) {
            message.textContent = msgString;
          } else {
            const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "b");
            b.textContent = options.name;
            const fragment = getLocalizedFragment(doc, msgString, b);
            message.appendChild(fragment);
          }

          const article = isSitePermissionAddon
            ? "site-permission-addons"
            : "unlisted-extensions-risks";
          const learnMore = doc.getElementById("addon-install-blocked-info");
          learnMore.setAttribute("support-page", article);
        };

        const secHistogram = Services.telemetry.getHistogramById("SECURITY_UI");
        secHistogram.add(
          Ci.nsISecurityUITelemetry.WARNING_ADDON_ASKING_PREVENTED
        );

        const [
          installMsg,
          dontAllowMsg,
          neverAllowMsg,
          neverAllowAndReportMsg,
        ] = await lazy.l10n.formatMessages([
          "xpinstall-prompt-install",
          "xpinstall-prompt-dont-allow",
          "xpinstall-prompt-never-allow",
          "xpinstall-prompt-never-allow-and-report",
        ]);

        const action = buildNotificationAction(installMsg, () => {
          secHistogram.add(
            Ci.nsISecurityUITelemetry
              .WARNING_ADDON_ASKING_PREVENTED_CLICK_THROUGH
          );
          installInfo.install();
        });

        const neverAllowCallback = () => {
          // SitePermissions is browser/ only.
          // lazy.SitePermissions.setForPrincipal(
          //  browser.contentPrincipal,
          //  "install",
          //  lazy.SitePermissions.BLOCK
          // );
          for (const install of installInfo.installs) {
            if (install.state != lazy.AddonManager.STATE_CANCELLED) {
              install.cancel();
            }
          }
          if (installInfo.cancel) {
            installInfo.cancel();
          }
        };

        const declineActions = [
          buildNotificationAction(dontAllowMsg, () => {
            for (const install of installInfo.installs) {
              if (install.state != lazy.AddonManager.STATE_CANCELLED) {
                install.cancel();
              }
            }
            if (installInfo.cancel) {
              installInfo.cancel();
            }
          }),
          buildNotificationAction(neverAllowMsg, neverAllowCallback),
        ];

        if (isSitePermissionAddon) {
          // Restrict this to site permission add-ons for now pending a decision
          // from product about how to approach this for extensions.
          declineActions.push(
            buildNotificationAction(neverAllowAndReportMsg, () => {
              lazy.AMTelemetry.recordEvent({
                method: "reportSuspiciousSite",
                object: "suspiciousSite",
                value: displayURI?.displayHost ?? "(unknown)",
                extra: {},
              });
              neverAllowCallback();
            })
          );
        }

        const popup = PopupNotifications.show(
          browser,
          aTopic,
          headerString,
          THUNDERBIRD_ANCHOR_ID,
          action,
          declineActions,
          options
        );
        removeNotificationOnEnd(popup, installInfo.installs);
        break;
      }
      case "addon-install-started": {
        // If all installs have already been downloaded then there is no need to
        // show the download progress
        if (
          installInfo.installs.every(
            aInstall => aInstall.state == lazy.AddonManager.STATE_DOWNLOADED
          )
        ) {
          return;
        }

        const messageString = lazy.l10n.formatValueSync(
          "addon-downloading-and-verifying",
          { addonCount: installInfo.installs.length }
        );
        options.installs = installInfo.installs;
        options.contentWindow = browser.contentWindow;
        options.sourceURI = browser.currentURI;
        options.eventCallback = function (aEvent) {
          switch (aEvent) {
            case "removed":
              options.contentWindow = null;
              options.sourceURI = null;
              break;
          }
        };

        const [acceptMsg, cancelMsg] = lazy.l10n.formatMessagesSync([
          "addon-install-accept-button",
          "addon-install-cancel-button",
        ]);

        const action = buildNotificationAction(acceptMsg, () => {});
        action.disabled = true;

        const secondaryAction = buildNotificationAction(cancelMsg, () => {
          for (const install of installInfo.installs) {
            if (install.state != lazy.AddonManager.STATE_CANCELLED) {
              install.cancel();
            }
          }
        });

        const notification = PopupNotifications.show(
          browser,
          "addon-progress",
          messageString,
          THUNDERBIRD_ANCHOR_ID,
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
        for (const install of installInfo.installs) {
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

          let messageString;
          if (
            install.addon &&
            !Services.policies.mayInstallAddon(install.addon)
          ) {
            messageString = lazy.l10n.formatValueSync(
              "addon-install-blocked-by-policy",
              { addonName: install.name, addonId: install.addon.id }
            );
            const extensionSettings = Services.policies.getExtensionSettings(
              install.addon.id
            );
            if (
              extensionSettings &&
              "blocked_install_message" in extensionSettings
            ) {
              messageString += " " + extensionSettings.blocked_install_message;
            }
          } else {
            // TODO bug 1834484: simplify computation of isLocal.
            const isLocal = !host;
            let errorId = ERROR_L10N_IDS.get(install.error)?.[isLocal ? 1 : 0];
            const args = { addonName: install.name };
            if (!errorId) {
              if (
                install.addon.blocklistState ==
                Ci.nsIBlocklistService.STATE_BLOCKED
              ) {
                errorId = "addon-install-error-blocklisted";
              } else {
                errorId = "addon-install-error-incompatible";
                args.appVersion = Services.appinfo.version;
              }
            }
            messageString = lazy.l10n.formatValueSync(errorId, args);
          }

          // Add Learn More link when refusing to install an unsigned add-on
          if (install.error == lazy.AddonManager.ERROR_SIGNEDSTATE_REQUIRED) {
            options.learnMoreURL =
              Services.urlFormatter.formatURLPref("app.support.baseURL") +
              "unsigned-addons";
          }

          PopupNotifications.show(
            browser,
            aTopic,
            messageString,
            THUNDERBIRD_ANCHOR_ID,
            null,
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
        const showNotification = () => {
          let height;
          if (PopupNotifications.isPanelOpen) {
            const rect = getTopWindow()
              .document.getElementById("addon-progress-notification")
              .getBoundingClientRect();
            height = rect.height;
          }

          this._removeProgressNotification(browser);
          this.showInstallConfirmation(browser, installInfo, height);
        };

        const progressNotification = PopupNotifications.getNotification(
          "addon-progress",
          browser
        );
        if (progressNotification) {
          const downloadDuration = Date.now() - progressNotification._startTime;
          const securityDelay =
            Services.prefs.getIntPref("security.dialog_enable_delay") -
            downloadDuration;
          if (securityDelay > 0) {
            getTopWindow().setTimeout(() => {
              // The download may have been cancelled during the security delay
              if (
                PopupNotifications.getNotification("addon-progress", browser)
              ) {
                showNotification();
              }
            }, securityDelay);
            break;
          }
        }
        showNotification();
      }
    }
  },
  _removeProgressNotification(aBrowser) {
    const notification = PopupNotifications.getNotification(
      "addon-progress",
      aBrowser
    );
    if (notification) {
      notification.remove();
    }
  },
};

Services.obs.addObserver(gXPInstallObserver, "addon-install-disabled");
Services.obs.addObserver(gXPInstallObserver, "addon-install-origin-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-policy-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-webapi-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-blocked");
Services.obs.addObserver(gXPInstallObserver, "addon-install-started");
Services.obs.addObserver(gXPInstallObserver, "addon-install-failed");
Services.obs.addObserver(gXPInstallObserver, "addon-install-confirmation");

/**
 * This object is Thunderbird's version of the same object in
 * browser/modules/ExtensionsUI.sys.mjs
 */
export var ExtensionsUI = {
  sideloaded: new Set(),
  updates: new Set(),
  sideloadListener: null,

  pendingNotifications: new WeakMap(),

  async init() {
    Services.obs.addObserver(this, "webextension-permission-prompt");
    Services.obs.addObserver(this, "webextension-update-permissions");
    Services.obs.addObserver(this, "webextension-install-notify");
    Services.obs.addObserver(this, "webextension-optional-permission-prompt");
    Services.obs.addObserver(this, "webextension-defaultsearch-prompt");

    await Services.wm.getMostRecentWindow("mail:3pane").delayedStartupPromise;
    this._checkForSideloaded();
  },

  async _checkForSideloaded() {
    const sideloaded = await lazy.AddonManagerPrivate.getNewSideloads();

    if (!sideloaded.length) {
      // No new side-loads. We're done.
      return;
    }

    // The ordering shouldn't matter, but tests depend on notifications
    // happening in a specific order.
    sideloaded.sort((a, b) => a.id.localeCompare(b.id));

    if (!this.sideloadListener) {
      this.sideloadListener = {
        onEnabled: addon => {
          if (!this.sideloaded.has(addon)) {
            return;
          }

          this.sideloaded.delete(addon);
          this._updateNotifications();

          if (this.sideloaded.size == 0) {
            lazy.AddonManager.removeAddonListener(this.sideloadListener);
            this.sideloadListener = null;
          }
        },
      };
      lazy.AddonManager.addAddonListener(this.sideloadListener);
    }

    for (const addon of sideloaded) {
      this.sideloaded.add(addon);
    }
    this._updateNotifications();
  },

  _updateNotifications() {
    if (this.sideloaded.size + this.updates.size == 0) {
      lazy.AppMenuNotifications.removeNotification("addon-alert");
    } else {
      lazy.AppMenuNotifications.showBadgeOnlyNotification("addon-alert");
    }
    this.emit("change");
  },

  showAddonsManager(tabbrowser, strings, icon) {
    // This is for compatibility. Thunderbird just shows the prompt.
    return this.showPermissionsPrompt(tabbrowser, strings, icon);
  },

  showSideloaded(tabbrowser, addon) {
    addon.markAsSeen();
    this.sideloaded.delete(addon);
    this._updateNotifications();

    const strings = this._buildStrings({
      addon,
      permissions: addon.userPermissions,
      type: "sideload",
    });

    lazy.AMTelemetry.recordManageEvent(addon, "sideload_prompt", {
      num_strings: strings.msgs.length,
    });

    this.showAddonsManager(tabbrowser, strings, addon.iconURL).then(
      async answer => {
        if (answer) {
          await addon.enable();

          this._updateNotifications();

          // The user has just enabled a sideloaded extension, if the permission
          // can be changed for the extension, show the post-install panel to
          // give the user that opportunity.
          if (
            addon.permissions &
            lazy.AddonManager.PERM_CAN_CHANGE_PRIVATEBROWSING_ACCESS
          ) {
            await this.showInstallNotification(
              tabbrowser.selectedBrowser,
              addon
            );
          }
        }
        this.emit("sideload-response");
      }
    );
  },

  showUpdate(browser, info) {
    lazy.AMTelemetry.recordInstallEvent(info.install, {
      step: "permissions_prompt",
      num_strings: info.strings.msgs.length,
    });

    this.showAddonsManager(browser, info.strings, info.addon.iconURL).then(
      answer => {
        if (answer) {
          info.resolve();
        } else {
          info.reject();
        }
        // At the moment, this prompt will re-appear next time we do an update
        // check.  See bug 1332360 for proposal to avoid this.
        this.updates.delete(info);
        this._updateNotifications();
      }
    );
  },

  async observe(subject, topic, data) {
    if (topic == "webextension-permission-prompt") {
      const { target, info } = subject.wrappedJSObject;

      const { browser, window } = getTabBrowser(target);

      // Dismiss the progress notification.  Note that this is bad if
      // there are multiple simultaneous installs happening, see
      // bug 1329884 for a longer explanation.
      const progressNotification = window.PopupNotifications.getNotification(
        "addon-progress",
        browser
      );
      if (progressNotification) {
        progressNotification.remove();
      }

      const strings = this._buildStrings(info);
      const data = new lazy.ExtensionData(info.addon.getResourceURI());
      await data.loadManifest();
      if (data.manifest.experiment_apis) {
        // Add the experiment permission text and use the header for
        // extensions with permissions.
        const [experimentWarning] = await lazy.l10n.formatValues([
          "webext-experiment-warning",
        ]);
        const [header, msg] = await PERMISSION_L10N.formatValues([
          {
            id: "webext-perms-header-with-perms",
            args: { extension: "<>" },
          },
          "webext-perms-description-experiment",
        ]);
        strings.header = header;
        strings.msgs = [msg];
        if (info.source != "AMO") {
          strings.experimentWarning = experimentWarning;
        }
      }

      // Thunderbird doesn't care about signing and does not check
      // info.addon.signedState as Firefox is doing it.
      info.unsigned = false;

      // If this is an update with no promptable permissions, just apply it. Skip
      // prompts also, if this add-on already has full access via experiment_apis.
      if (info.type == "update") {
        const extension = lazy.ExtensionParent.GlobalManager.getExtension(
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

      const icon = info.unsigned
        ? "chrome://global/skin/icons/warning.svg"
        : info.icon;

      if (info.type == "sideload") {
        lazy.AMTelemetry.recordManageEvent(info.addon, "sideload_prompt", {
          num_strings: strings.msgs.length,
        });
      } else {
        lazy.AMTelemetry.recordInstallEvent(info.install, {
          step: "permissions_prompt",
          num_strings: strings.msgs.length,
        });
      }

      // Reject add-ons using the legacy API. We cannot use the general "ignore
      // unknown APIs" policy, as add-ons using the Legacy API from TB68 will
      // not do anything, confusing the user.
      if (data.manifest.legacy) {
        const subject = {
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

      this.showPermissionsPrompt(browser, strings, icon).then(answer => {
        if (answer) {
          info.resolve();
        } else {
          info.reject();
        }
      });
    } else if (topic == "webextension-update-permissions") {
      const info = subject.wrappedJSObject;
      info.type = "update";
      const strings = this._buildStrings(info);

      // If we don't prompt for any new permissions, just apply it. Skip prompts
      // also, if this add-on already has full access via experiment_apis.
      const extension = lazy.ExtensionParent.GlobalManager.getExtension(
        info.addon.id
      );
      if (
        !strings.msgs.length ||
        (extension && extension.manifest.experiment_apis)
      ) {
        info.resolve();
        return;
      }

      const update = {
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
      const { target, addon, callback } = subject.wrappedJSObject;
      this.showInstallNotification(target, addon).then(() => {
        if (callback) {
          callback();
        }
      });
    } else if (topic == "webextension-optional-permission-prompt") {
      const browser =
        getTopWindow().document.getElementById("tabmail").selectedBrowser;
      const { name, icon, permissions, resolve } = subject.wrappedJSObject;
      const strings = this._buildStrings({
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
      const { browser, name, icon, respond, currentEngine, newEngine } =
        subject.wrappedJSObject;

      // FIXME: These only exist in mozilla/browser/locales/en-US/browser/extensionsUI.ftl.
      const [searchDesc, searchYes, searchNo] = lazy.l10n.formatMessagesSync([
        {
          id: "webext-default-search-description",
          args: { addonName: "<>", currentEngine, newEngine },
        },
        "webext-default-search-yes",
        "webext-default-search-no",
      ]);

      const strings = { addonName: name, text: searchDesc.value };
      for (const attr of searchYes.attributes) {
        if (attr.name === "label") {
          strings.acceptText = attr.value;
        } else if (attr.name === "accesskey") {
          strings.acceptKey = attr.value;
        }
      }
      for (const attr of searchNo.attributes) {
        if (attr.name === "label") {
          strings.cancelText = attr.value;
        } else if (attr.name === "accesskey") {
          strings.cancelKey = attr.value;
        }
      }

      this.showDefaultSearchPrompt(browser, strings, icon).then(respond);
    }
  },

  // Create a set of formatted strings for a permission prompt
  _buildStrings(info) {
    const strings = lazy.ExtensionData.formatPermissionStrings(info, {
      collapseOrigins: true,
    });
    strings.addonName = info.addon.name;
    strings.learnMore = lazy.l10n.formatValueSync("webext-perms-learn-more");
    return strings;
  },

  async showPermissionsPrompt(target, strings, icon) {
    const { browser } = getTabBrowser(target);

    // Wait for any pending prompts to complete before showing the next one.
    let pending;
    while ((pending = this.pendingNotifications.get(browser))) {
      await pending;
    }

    const promise = new Promise(resolve => {
      function eventCallback(topic) {
        const doc = this.browser.ownerDocument;
        if (topic == "showing") {
          const textEl = doc.getElementById("addon-webext-perm-text");
          textEl.textContent = strings.text;
          textEl.hidden = !strings.text;

          // By default, multiline strings don't get formatted properly. These
          // are presently only used in site permission add-ons, so we treat it
          // as a special case to avoid unintended effects on other things.
          const isMultiline = strings.text.includes("\n\n");
          textEl.classList.toggle(
            "addon-webext-perm-text-multiline",
            isMultiline
          );

          const listIntroEl = doc.getElementById("addon-webext-perm-intro");
          listIntroEl.textContent = strings.listIntro;
          listIntroEl.hidden = !strings.msgs.length || !strings.listIntro;

          const listInfoEl = doc.getElementById("addon-webext-perm-info");
          listInfoEl.textContent = strings.learnMore;
          listInfoEl.href =
            Services.urlFormatter.formatURLPref("app.support.baseURL") +
            "extension-permissions";
          listInfoEl.hidden = !strings.msgs.length;

          const list = doc.getElementById("addon-webext-perm-list");
          while (list.firstChild) {
            list.firstChild.remove();
          }
          const singleEntryEl = doc.getElementById(
            "addon-webext-perm-single-entry"
          );
          singleEntryEl.textContent = "";
          singleEntryEl.hidden = true;
          list.hidden = true;

          if (strings.msgs.length === 1) {
            singleEntryEl.textContent = strings.msgs[0];
            singleEntryEl.hidden = false;
          } else if (strings.msgs.length) {
            for (const msg of strings.msgs) {
              const item = doc.createElementNS(HTML_NS, "li");
              item.textContent = msg;
              list.appendChild(item);
            }
            list.hidden = false;
          }

          const experimentsEl = doc.getElementById(
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

      const options = {
        hideClose: true,
        popupIconURL: icon || DEFAULT_EXTENSION_ICON,
        popupIconClass: icon ? "" : "addon-warning-icon",
        persistent: true,
        eventCallback,
        removeOnDismissal: true,
        popupOptions: {
          position: "bottomright topright",
        },
      };
      // The prompt/notification machinery has a special affordance wherein
      // certain subsets of the header string can be designated "names", and
      // referenced symbolically as "<>" and "{}" to receive special formatting.
      // That code assumes that the existence of |name| and |secondName| in the
      // options object imply the presence of "<>" and "{}" (respectively) in
      // in the string.
      //
      // At present, WebExtensions use this affordance while SitePermission
      // add-ons don't, so we need to conditionally set the |name| field.
      //
      // NB: This could potentially be cleaned up, see bug 1799710.
      if (strings.header.includes("<>")) {
        options.name = strings.addonName;
      }

      const action = {
        label: strings.acceptText,
        accessKey: strings.acceptKey,
        callback: () => {
          resolve(true);
        },
      };
      const secondaryActions = [
        {
          label: strings.cancelText,
          accessKey: strings.cancelKey,
          callback: () => {
            resolve(false);
          },
        },
      ];

      PopupNotifications.show(
        browser,
        "addon-webext-permissions",
        strings.header,
        THUNDERBIRD_ANCHOR_ID,
        action,
        secondaryActions,
        options
      );
    });

    this.pendingNotifications.set(browser, promise);
    promise.finally(() => this.pendingNotifications.delete(browser));
    return promise;
  },

  showDefaultSearchPrompt(target, strings, icon) {
    return new Promise(resolve => {
      const options = {
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

      const action = {
        label: strings.acceptText,
        accessKey: strings.acceptKey,
        callback: () => {
          resolve(true);
        },
      };
      const secondaryActions = [
        {
          label: strings.cancelText,
          accessKey: strings.cancelKey,
          callback: () => {
            resolve(false);
          },
        },
      ];

      const { browser } = getTabBrowser(target);

      PopupNotifications.show(
        browser,
        "addon-webext-defaultsearch",
        strings.text,
        THUNDERBIRD_ANCHOR_ID,
        action,
        secondaryActions,
        options
      );
    });
  },

  async showInstallNotification(target, addon) {
    const { browser, window } = getTabBrowser(target);

    const message = await lazy.l10n.formatValue("addon-post-install-message", {
      addonName: "<>",
    });

    const icon = addon.isWebExtension
      ? lazy.AddonManager.getPreferredIconURL(addon, 32, window) ||
        DEFAULT_EXTENSION_ICON
      : "chrome://messenger/skin/addons/addon-install-installed.svg";

    const options = {
      hideClose: true,
      timeout: Date.now() + 30000,
      popupIconURL: icon,
      name: addon.name,
    };

    return PopupNotifications.show(
      browser,
      "addon-installed",
      message,
      THUNDERBIRD_ANCHOR_ID,
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
 * Lifted from BrowserUIUtils.sys.mjs.
 *
 * @param {Document} doc
 * @param {string}   msg
 *                   The string to put replacements in. Fetch from
 *                   a stringbundle using getString or GetStringFromName,
 *                   or even an inserted dtd string.
 * @param {Node | string} nodesOrStrings
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
  const numberOfInsertionPoints = msg.match(/%\d+\$S/g).length;
  if (numberOfInsertionPoints != nodesOrStrings.length) {
    console.error(
      `Message has ${numberOfInsertionPoints} insertion points, ` +
        `but got ${nodesOrStrings.length} replacement parameters!`
    );
  }

  const fragment = doc.createDocumentFragment();
  const parts = [msg];
  let insertionPoint = 1;
  for (const replacement of nodesOrStrings) {
    const insertionString = "%" + insertionPoint++ + "$S";
    const partIndex = parts.findIndex(
      part => typeof part == "string" && part.includes(insertionString)
    );
    if (partIndex == -1) {
      fragment.appendChild(doc.createTextNode(msg));
      return fragment;
    }

    if (typeof replacement == "string") {
      parts[partIndex] = parts[partIndex].replace(insertionString, replacement);
    } else {
      const [firstBit, lastBit] = parts[partIndex].split(insertionString);
      parts.splice(partIndex, 1, firstBit, replacement, lastBit);
    }
  }

  // Put everything in a document fragment:
  for (const part of parts) {
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
