/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpService"];

function SmtpService() {}

SmtpService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpService"]),
  classID: Components.ID("{acda6039-8b17-46c1-a8ed-ad50aa80f412}"),

  sendMailMessage() {
    throw Components.Exception(
      "sendMailMessage not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },
};
