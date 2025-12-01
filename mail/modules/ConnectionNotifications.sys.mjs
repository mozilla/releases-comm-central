/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const AlertNotification = Components.Constructor(
  "@mozilla.org/alert-notification;1",
  "nsIAlertNotification",
  "initWithObject"
);

const alertsService = Cc["@mozilla.org/alerts-service;1"].getService(
  Ci.nsIAlertsService
);

export const ConnectionNotifications = {
  /**
   * Notify the user about a network connection failure.
   *
   * @param {string} id - A string identifier for the connection. This could
   *   be anything, but practically should be unique to the account associated
   *   with the connection.
   * @param {nsresult} status - The status code returned by necko code, e.g.
   *   from `nsIStreamLoaderObserver.onStreamComplete`.
   * @param {string} title - User-friendly title for the notification,
   *   typically this would be the name of the account.
   * @param {string} hostname - The hostname of the server that we attempted
   *   to contact.
   */
  connectionFailed(id, status, title, hostname) {
    if (Components.isSuccessCode(status)) {
      // It didn't fail after all?
      return;
    }

    let errorName;
    switch (status) {
      case Cr.NS_ERROR_UNKNOWN_HOST:
      case Cr.NS_ERROR_UNKNOWN_PROXY_HOST:
        errorName = "unknownHostError";
        break;
      case Cr.NS_ERROR_CONNECTION_REFUSED:
        errorName = "connectionRefusedError";
        break;
      case Cr.NS_ERROR_PROXY_CONNECTION_REFUSED:
        errorName = "connectionRefusedError";
        break;
      case Cr.NS_ERROR_NET_TIMEOUT:
        errorName = "netTimeoutError";
        break;
      case Cr.NS_ERROR_NET_RESET:
        errorName = "netResetError";
        break;
      case Cr.NS_ERROR_NET_INTERRUPT:
        errorName = "netInterruptError";
        break;
    }
    if (errorName) {
      const messengerStrings = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      const errorMessage = messengerStrings.formatStringFromName(errorName, [
        hostname,
      ]);
      const alert = new AlertNotification({
        name: id,
        // Don't add an icon on macOS, the app icon is already shown.
        imageURL:
          AppConstants.platform == "macosx"
            ? ""
            : "chrome://branding/content/icon48.png",
        title,
        text: errorMessage,
        silent: true,
      });
      alertsService.showAlert(alert, null);
    }
  },

  /**
   * Clear any earlier notifications about this connection.
   *
   * @param {string} id - A string identifier for the connection. This should
   *   be the same identifier passed to `connectionFailed`.
   */
  connectionRestored(id) {
    alertsService.closeAlert(id);
  },
};
