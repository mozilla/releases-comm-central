/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var nsActWarning = Components.Constructor(
  "@mozilla.org/activity-warning;1",
  "nsIActivityWarning",
  "init"
);

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { setTimeout } from "resource:///modules/Timer.sys.mjs";

const activeAlerts = new Set();
const l10n = new Localization([
  "branding/brand.ftl",
  "messenger/certError.ftl",
]);

/**
 * Displays alerts from the mail session service, and also adds them to the
 * Activity Manager.
 *
 * @implements {nsIMsgUserFeedbackListener}
 * @implements {nsIObserver}
 */
export var alertHook = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),

  get activityMgr() {
    delete this.activityMgr;
    return (this.activityMgr = Cc["@mozilla.org/activity-manager;1"].getService(
      Ci.nsIActivityManager
    ));
  },

  get alertService() {
    // Don't store a reference to the alerts service, as it can be swapped out
    // during tests.
    return Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
  },

  get brandShortName() {
    delete this.brandShortName;
    return (this.brandShortName = Services.strings
      .createBundle("chrome://branding/locale/brand.properties")
      .GetStringFromName("brandShortName"));
  },

  // nsIMsgUserFeedbackListener

  onAlert(message, url, silent) {
    const cookie = `${url.hostPort} alert`;
    if (activeAlerts.has(cookie)) {
      return true;
    }

    // Create a new warning.
    const warning = new nsActWarning(message, this.activityMgr, "");

    warning.groupingStyle = Ci.nsIActivity.GROUPING_STYLE_STANDALONE;
    try {
      const server = MailServices.accounts.findServerByURI(url);

      warning.contextDisplayText = server.prettyName;
      warning.contextObj = server;
      warning.groupingStyle = Ci.nsIActivity.GROUPING_STYLE_BYCONTEXT;
      warning.contextType = "incomingServer";
    } catch (ex) {
      console.warn(ex);
    }

    this.activityMgr.addActivity(warning);

    if (Services.prefs.getBoolPref("mail.suppressAlertsForTests", false)) {
      return true;
    }

    // If the alert should be silent (e.g. it was a generated as a result of
    // background activity like autosync, biff, etc.), we shouldn't notify.
    if (silent) {
      return true;
    }

    try {
      const deferred = Promise.withResolvers();
      const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
        Ci.nsIAlertNotification
      );
      alert.init(
        "", // name
        // Don't add an icon on macOS, the app icon is already shown.
        AppConstants.platform == "macosx"
          ? ""
          : "chrome://branding/content/icon48.png",
        this.brandShortName,
        message,
        false,
        cookie
      );
      this.alertService.showAlert(alert, {
        QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
        observe(subject, topic) {
          if (topic == "alertfinished") {
            deferred.resolve();
          }
        },
      });

      // Block identical alerts (with the same cookie) for 5 seconds, or until
      // the old alert is finished.
      activeAlerts.add(cookie);
      deferred.promise.then(() => activeAlerts.delete(cookie));
      setTimeout(() => deferred.resolve(), 5000);
    } catch (ex) {
      // `showAlert` can throw an error if there's no system notification back
      // end, so fall-back to the old method of modal dialogs.
      return false;
    }

    return true;
  },

  async onCertError(securityInfo, url) {
    const cookie = `${url.hostPort} certError`;
    if (activeAlerts.has(cookie)) {
      return;
    }

    let errorString;
    const errorArgs = { hostname: url.host };

    switch (securityInfo.overridableErrorCategory) {
      case Ci.nsITransportSecurityInfo.ERROR_DOMAIN:
        errorString = "cert-error-domain-mismatch";
        break;
      case Ci.nsITransportSecurityInfo.ERROR_TIME: {
        const cert = securityInfo.serverCert;
        const notBefore = cert.validity.notBefore / 1000;
        const notAfter = cert.validity.notAfter / 1000;
        const formatter = new Intl.DateTimeFormat();

        if (notBefore && Date.now() < notAfter) {
          errorString = "cert-error-not-yet-valid";
          errorArgs["not-before"] = formatter.format(new Date(notBefore));
        } else {
          errorString = "cert-error-expired";
          errorArgs["not-after"] = formatter.format(new Date(notAfter));
        }
        break;
      }
      default:
        errorString = "cert-error-untrusted-default";
        break;
    }

    const formattedString = await l10n.formatValue(errorString, errorArgs);
    const deferred = Promise.withResolvers();
    function showExceptionDialog() {
      const params = {
        exceptionAdded: false,
        securityInfo,
        prefetchCert: true,
        location: url.asciiHostPort,
      };
      Services.wm
        .getMostRecentWindow("")
        .openDialog(
          "chrome://pippki/content/exceptionDialog.xhtml",
          "",
          "chrome,centerscreen,dependent",
          params
        );
    }

    try {
      const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
        Ci.nsIAlertNotification
      );
      alert.init(
        "" /* name */,
        // Don't add an icon on macOS, the app icon is already shown.
        AppConstants.platform == "macosx"
          ? ""
          : "chrome://branding/content/icon48.png",
        this.brandShortName,
        formattedString,
        true /* clickable */,
        cookie,
        undefined /* dir */,
        undefined /* lang */,
        undefined /* data */,
        undefined /* principal */,
        undefined /* inPrivateBrowsing */,
        true /* requireInteraction */
      );
      this.alertService.showAlert(alert, {
        QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
        observe(subject, topic) {
          if (topic == "alertclickcallback") {
            showExceptionDialog();
          } else if (topic == "alertfinished") {
            deferred.resolve();
          }
        },
      });
    } catch (ex) {
      // `showAlert` can throw an error if there's no system notification back
      // end, so fall-back to the old method of modal dialogs.
      Services.prompt.alert(null, null, formattedString);
      showExceptionDialog();
    }

    // Block identical alerts (with the same cookie) for 5 seconds, or until
    // the old alert is finished.
    activeAlerts.add(cookie);
    deferred.promise.then(() => activeAlerts.delete(cookie));
    setTimeout(() => deferred.resolve(), 5000);
  },

  init() {
    MailServices.mailSession.addUserFeedbackListener(this);
  },
};
