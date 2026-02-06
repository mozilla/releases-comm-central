/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Alerts users of potential certificate errors in in the folder pane.
 *
 * @implements {nsIMsgUserFeedbackListener}
 */
export const UserFeedbackListener = {
  /**
   * The EventTarget class used to dispatch the event when a certificate error
   * is detected.
   *
   * @type {EventTarget}
   */
  target: new EventTarget(),

  QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),

  onAlert() {
    return false;
  },

  async onCertError(securityInfo, uri) {
    let server;
    try {
      server = MailServices.accounts.findServerByURI(uri);
    } catch (ex) {
      console.error(ex);
      return;
    }

    let errorString;
    const errorArgs = { hostname: uri.host };

    switch (securityInfo?.overridableErrorCategory) {
      case Ci.nsITransportSecurityInfo.ERROR_DOMAIN:
        errorString = "cert-error-inline-domain-mismatch";
        break;
      case Ci.nsITransportSecurityInfo.ERROR_TIME: {
        const cert = securityInfo.serverCert;
        const notBefore = cert.validity.notBefore / 1000;
        const notAfter = cert.validity.notAfter / 1000;
        const formatter = new Intl.DateTimeFormat();

        if (notBefore && Date.now() < notAfter) {
          errorString = "cert-error-inline-not-yet-valid";
          errorArgs["not-before"] = formatter.format(new Date(notBefore));
        } else {
          errorString = "cert-error-inline-expired";
          errorArgs["not-after"] = formatter.format(new Date(notAfter));
        }
        break;
      }
      default:
        errorString = "cert-error-inline-untrusted-default";
        break;
    }

    this.target.dispatchEvent(
      new CustomEvent("show-tls-error", {
        bubbles: true,
        detail: { server, errorString, errorArgs },
      })
    );
  },
};
