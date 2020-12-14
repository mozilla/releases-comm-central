/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpServer"];

/**
 * This class represents a single SMTP server.
 *
 * @implements {nsISmtpServer}
 */
function SmtpServer() {}

SmtpServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpServer"]),
  classID: Components.ID("{3a75f5ea-651e-4696-9813-848c03da8bbd}"),
};
