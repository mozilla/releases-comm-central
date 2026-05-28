/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * A listener to be passed to the url object of the server request being issued
 * to detect the bad server certificates.
 *
 * @implements {nsIUrlListener}
 */
export class TransportErrorUrlListener {
  /**
   * @param {nsIURI} _url
   */
  OnStartRunningUrl(_url) {}

  /**
   * @param {nsIURI} url
   * @param {nsresult} exitCode
   */
  OnStopRunningUrl(url, exitCode) {
    if (Components.isSuccessCode(exitCode)) {
      return;
    }
    const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
      Ci.nsINSSErrorsService
    );
    try {
      const errorClass = nssErrorsService.getErrorClass(exitCode);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        const mailNewsUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
        const secInfo = mailNewsUrl.failedSecInfo;
        MailServices.mailSession.alertCertError(secInfo, mailNewsUrl);
      }
    } catch (e) {
      // It's not an NSS error.
    }
  }

  // nsISupports
  QueryInterface = ChromeUtils.generateQI(["nsIUrlListener"]);
}
