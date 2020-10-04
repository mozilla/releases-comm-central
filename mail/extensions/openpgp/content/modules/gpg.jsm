/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailGpg"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

const MINIMUM_GPG_VERSION = "2.0.14";

var EnigmailGpg = {
  agentVersion: "",
  _agentPath: null,

  get agentPath() {
    return this._agentPath;
  },

  setAgentPath(path) {
    this._agentPath = path;
  },

  /**
   * return the minimum version of GnuPG that is supported by Enigmail
   */
  getMinimumGpgVersion() {
    return MINIMUM_GPG_VERSION;
  },

  /***
   determine if a specific feature is available in the GnuPG version used

   @param featureName:  String; one of the following values:
   version-supported    - is the gpg version supported at all (true for gpg >= 2.0.10)
   supports-gpg-agent   - is gpg-agent is auto-started (true for gpg >= 2.0.16)
   keygen-passphrase    - can the passphrase be specified when generating keys (false for gpg 2.1 and 2.1.1)
   windows-photoid-bug  - is there a bug in gpg with the output of photoid on Windows (true for gpg < 2.0.16)
   genkey-no-protection - is "%no-protection" supported for generting keys (true for gpg >= 2.1)
   search-keys-cmd      - what command to use to terminate the --search-key operation. ("save" for gpg > 2.1; "quit" otherwise)
   socks-on-windows     - is SOCKS proxy supported on Windows (true for gpg >= 2.0.20)
   supports-ecc-keys    - are ECC (elliptic curve) keys supported (true for gpg >= 2.1)
   supports-sender      - does gnupg understand the --sender argument (true for gpg >= 2.1.15)
   supports-wkd         - does gpg support wkd (web key directory) (true for gpg >= 2.1.19)
   export-result        - does gpg print EXPORTED when exporting keys (true for gpg >= 2.1.10)
   decryption-info      - does gpg print DECRYPTION_INFO (true for gpg >= 2.0.19)
   export-specific-uid  - does gpg support exporting a key with a specific UID (true for gpg >= 2.2.8)
   supports-show-only   - does gpg support --import-options show-only (true for gpg >= 2.1.14)
   handles-huge-keys    - can gpg deal with huge keys without aborting (true for gpg >= 2.2.17)

   @return: depending on featureName - Boolean unless specified differently:
   (true if feature is available / false otherwise)
   If the feature cannot be found, undefined is returned
   */
  getGpgFeature(featureName) {
    let gpgVersion = EnigmailGpg.agentVersion;

    if (
      !gpgVersion ||
      typeof gpgVersion != "string" ||
      gpgVersion.length === 0
    ) {
      return undefined;
    }

    gpgVersion = gpgVersion.replace(/-.*$/, "");
    if (gpgVersion.search(/^\d+\.\d+/) < 0) {
      // not a valid version number
      return undefined;
    }

    switch (featureName) {
      case "version-supported":
        return Services.vc.compare(gpgVersion, MINIMUM_GPG_VERSION) >= 0;
      case "supports-gpg-agent":
        return Services.vc.compare(gpgVersion, "2.0.16") >= 0;
      case "keygen-passphrase":
        return (
          Services.vc.compare(gpgVersion, "2.1") < 0 ||
          Services.vc.compare(gpgVersion, "2.1.2") >= 0
        );
      case "genkey-no-protection":
        return Services.vc.compare(gpgVersion, "2.1") > 0;
      case "windows-photoid-bug":
        return Services.vc.compare(gpgVersion, "2.0.16") < 0;
      case "supports-ecc-keys":
        return Services.vc.compare(gpgVersion, "2.1") > 0;
      case "socks-on-windows":
        return Services.vc.compare(gpgVersion, "2.0.20") >= 0;
      case "search-keys-cmd":
        // returns a string
        if (Services.vc.compare(gpgVersion, "2.1") > 0) {
          return "save";
        }
        return "quit";
      case "supports-sender":
        return Services.vc.compare(gpgVersion, "2.1.15") >= 0;
      case "export-result":
        return Services.vc.compare(gpgVersion, "2.1.10") >= 0;
      case "decryption-info":
        return Services.vc.compare(gpgVersion, "2.0.19") >= 0;
      case "supports-wkd":
        return Services.vc.compare(gpgVersion, "2.1.19") >= 0;
      case "export-specific-uid":
        return Services.vc.compare(gpgVersion, "2.2.9") >= 0;
      case "supports-show-only":
        return Services.vc.compare(gpgVersion, "2.1.14") >= 0;
      case "handles-huge-keys":
        return Services.vc.compare(gpgVersion, "2.2.17") >= 0;
    }

    return undefined;
  },

  signingAlgIdToString(id) {
    // RFC 4880 Sec. 9.1, RFC 6637 Sec. 5 and draft-koch-eddsa-for-openpgp-03 Sec. 8
    switch (parseInt(id, 10)) {
      case 1:
      case 2:
      case 3:
        return "RSA";
      case 16:
        return "Elgamal";
      case 17:
        return "DSA";
      case 18:
        return "ECDH";
      case 19:
        return "ECDSA";
      case 20:
        return "ELG";
      case 22:
        return "EDDSA";
      default:
        return l10n.formatValueSync("unknown-signing-alg", {
          id: parseInt(id, 10),
        });
    }
  },

  hashAlgIdToString(id) {
    // RFC 4880 Sec. 9.4
    switch (parseInt(id, 10)) {
      case 1:
        return "MD5";
      case 2:
        return "SHA-1";
      case 3:
        return "RIPE-MD/160";
      case 8:
        return "SHA256";
      case 9:
        return "SHA384";
      case 10:
        return "SHA512";
      case 11:
        return "SHA224";
      default:
        return l10n.formatValueSync("unknown-hash-alg", {
          id: parseInt(id, 10),
        });
    }
  },
};
