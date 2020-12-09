/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpService"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { SmtpClient } = ChromeUtils.import("resource:///modules/SmtpClient.jsm");

/**
 * Set `user_pref("mailnews.smtp.jsmodule", true);` to use this module.
 *
 * @implements {nsISmtpService}
 */
function SmtpService() {}

SmtpService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISmtpService"]),
  classID: Components.ID("{acda6039-8b17-46c1-a8ed-ad50aa80f412}"),

  /**
   * @see nsISmtpService
   */
  get defaultServer() {
    throw Components.Exception(
      "sendMailMessage not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  /**
   * @see nsISmtpService
   */
  sendMailMessage(
    messageFile,
    recipients,
    userIdentity,
    sender,
    password,
    deliveryListener,
    statusListener,
    notificationCallbacks,
    requestDSN,
    outURI,
    outRequest
  ) {
    let server = this.getServerByIdentity(userIdentity);
    let client = new SmtpClient(server.hostname, server.port, {
      logger: console,
      ignoreTLS: server.socketType == 0,
      requireTLS: server.socketType == 3,
    });
    client.connect();
    let fresh = true;
    client.onidle = () => {
      // onidle can be emitted multiple times, but we should not init sending
      // process again.
      if (!fresh) {
        return;
      }
      fresh = false;
      let from = MailServices.headerParser.makeFromDisplayAddress(
        decodeURIComponent(recipients)
      )[0].email;
      let to = MailServices.headerParser
        .makeFromDisplayAddress(decodeURIComponent(recipients))
        .map(rec => rec.email);

      client.useEnvelope({
        from,
        to,
      });
    };
    client.onready = () => {
      let fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      // PR_RDONLY
      fstream.init(messageFile, 0x01, 0, 0);

      let sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      sstream.init(fstream);

      while (sstream.available()) {
        client.send(sstream.read(16384));
      }
      sstream.close();
      fstream.close();
      client.end();
    };
    client.ondone = () => {
      deliveryListener.OnStopRunningUrl(
        Services.io.newURI("smtp://invalid@tinderbox"),
        0
      );
      client.close();
    };
    client.onerror = e => {
      Cu.reportError(e);
    };
  },

  /**
   * @see nsISmtpService
   */
  getServerByIdentity(userIdentity) {
    return userIdentity.smtpServerKey
      ? this.getServerByKey(userIdentity.smtpServerKey)
      : this.defaultServer;
  },

  /**
   * @see nsISmtpService
   */
  getServerByKey(key) {
    let serverKeys = this._getSmtpServerKeys();
    if (serverKeys.includes(key)) {
      return this._createKeyedServer(key);
    }
    return null;
  },

  /**
   * Get all SMTP server keys from prefs.
   * @returns {string[]}
   */
  _getSmtpServerKeys() {
    return Services.prefs.getCharPref("mail.smtpservers").split(",");
  },

  /**
   * Create an nsISmtpServer from a key.
   * @param {string} key - The key for the SmtpServer.
   * @returns {nsISmtpServer}
   */
  _createKeyedServer(key) {
    let server = Cc["@mozilla.org/messenger/smtp/server;1"].createInstance(
      Ci.nsISmtpServer
    );
    server.key = key;
    return server;
  },
};
