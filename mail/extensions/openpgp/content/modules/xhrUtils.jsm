/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailXhrUtils"];

var EnigmailXhrUtils = {

  /**
   * Create an error description from an XMLHttpRequest error.
   * Adapted from the patch for mozTCPSocket error reporting (bug 861196).
   *
   * @param xhr: XMLHttpRequest Object
   *
   * @return Object:
   *    - type: String: one of SecurityCertificate, SecurityProtocol, Network
   *    - name: Detailed error text
   */
  createTCPErrorFromFailedXHR: function(xhr) {
    let status = xhr.channel.QueryInterface(Ci.nsIRequest).status;

    let errType;
    let errName;

    if ((status & 0xff0000) === 0x5a0000) { // Security module
      const nsINSSErrorsService = Ci.nsINSSErrorsService;
      let nssErrorsService = Cc['@mozilla.org/nss_errors_service;1'].getService(nsINSSErrorsService);
      let errorClass;
      // getErrorClass will throw a generic NS_ERROR_FAILURE if the error code is
      // somehow not in the set of covered errors.
      try {
        errorClass = nssErrorsService.getErrorClass(status);
      }
      catch (ex) {
        errorClass = 'SecurityProtocol';
      }
      if (errorClass == nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        errType = 'SecurityCertificate';
      }
      else {
        errType = 'SecurityProtocol';
      }

      // NSS_SEC errors (happen below the base value because of negative vals)
      if ((status & 0xffff) < Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE)) {
        // The bases are actually negative, so in our positive numeric space, we
        // need to subtract the base off our value.
        let nssErr = Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE) -
          (status & 0xffff);
        switch (nssErr) {
          case 11: // SEC_ERROR_EXPIRED_CERTIFICATE, sec(11)
            errName = 'SecurityExpiredCertificateError';
            break;
          case 12: // SEC_ERROR_REVOKED_CERTIFICATE, sec(12)
            errName = 'SecurityRevokedCertificateError';
            break;

            // per bsmith, we will be unable to tell these errors apart very soon,
            // so it makes sense to just folder them all together already.
          case 13: // SEC_ERROR_UNKNOWN_ISSUER, sec(13)
          case 20: // SEC_ERROR_UNTRUSTED_ISSUER, sec(20)
          case 21: // SEC_ERROR_UNTRUSTED_CERT, sec(21)
          case 36: // SEC_ERROR_CA_CERT_INVALID, sec(36)
            errName = 'SecurityUntrustedCertificateIssuerError';
            break;
          case 90: // SEC_ERROR_INADEQUATE_KEY_USAGE, sec(90)
            errName = 'SecurityInadequateKeyUsageError';
            break;
          case 176: // SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED, sec(176)
            errName = 'SecurityCertificateSignatureAlgorithmDisabledError';
            break;
          default:
            errName = 'SecurityError';
            break;
        }
      }
      else {
        let sslErr = Math.abs(nsINSSErrorsService.NSS_SSL_ERROR_BASE) -
          (status & 0xffff);
        switch (sslErr) {
          case 3: // SSL_ERROR_NO_CERTIFICATE, ssl(3)
            errName = 'SecurityNoCertificateError';
            break;
          case 4: // SSL_ERROR_BAD_CERTIFICATE, ssl(4)
            errName = 'SecurityBadCertificateError';
            break;
          case 8: // SSL_ERROR_UNSUPPORTED_CERTIFICATE_TYPE, ssl(8)
            errName = 'SecurityUnsupportedCertificateTypeError';
            break;
          case 9: // SSL_ERROR_UNSUPPORTED_VERSION, ssl(9)
            errName = 'SecurityUnsupportedTLSVersionError';
            break;
          case 12: // SSL_ERROR_BAD_CERT_DOMAIN, ssl(12)
            errName = 'SecurityCertificateDomainMismatchError';
            break;
          default:
            errName = 'SecurityError';
            break;
        }
      }
    }
    else {
      errType = 'Network';
      switch (status) {
        // connect to host:port failed
        case 0x804B000C: // NS_ERROR_CONNECTION_REFUSED, network(13)
          errName = 'ConnectionRefusedError';
          break;
          // network timeout error
        case 0x804B000E: // NS_ERROR_NET_TIMEOUT, network(14)
          errName = 'NetworkTimeoutError';
          break;
          // hostname lookup failed
        case 0x804B001E: // NS_ERROR_UNKNOWN_HOST, network(30)
          errName = 'DomainNotFoundError';
          break;
        case 0x804B0047: // NS_ERROR_NET_INTERRUPT, network(71)
          errName = 'NetworkInterruptError';
          break;
        default:
          errName = 'NetworkError';
          break;
      }
    }

    return {
      name: errName,
      type: errType
    };
  }
};
