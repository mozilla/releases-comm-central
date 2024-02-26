/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides some utilities for helping run S/MIME tests.
 */

import { MockRegistrar } from "resource://testing-common/MockRegistrar.sys.mjs";

const gCertDialogs = {
  confirmDownloadCACert: (ctx, cert, trust) => {
    dump("Requesting certificate download\n");
    trust.value = Ci.nsIX509CertDB.TRUSTED_EMAIL;
    return true;
  },
  setPKCS12FilePassword: (ctx, password) => {
    throw new Error("Not implemented");
  },
  getPKCS12FilePassword: (ctx, password) => {
    password.value = "";
    return true;
  },
  viewCert: (ctx, cert) => {
    throw new Error("Not implemented");
  },
  QueryInterface: ChromeUtils.generateQI(["nsICertificateDialogs"]),
};

export const SmimeUtils = {
  ensureNSS() {
    // Ensure NSS is initialized.
    Cc["@mozilla.org/psm;1"].getService(Ci.nsISupports);

    // Set up the internal key token so that subsequent code doesn't fail. If
    // this isn't done, we'll fail to work if the NSS databases didn't already
    // exist.
    const keydb = Cc["@mozilla.org/security/pk11tokendb;1"].getService(
      Ci.nsIPK11TokenDB
    );
    try {
      keydb.getInternalKeyToken().initPassword("");
    } catch (e) {
      // In this scenario, the key token already had its password initialized.
      // Therefore, we don't need to do anything (assuming its password is
      // empty).
    }

    MockRegistrar.register("@mozilla.org/nsCertificateDialogs;1", gCertDialogs);
  },

  loadPEMCertificate(file, certType, loadKey = false) {
    dump("Loading certificate from " + file.path + "\n");
    const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
      Ci.nsIX509CertDB
    );
    certDB.importCertsFromFile(file, certType);
  },

  loadCertificateAndKey(file, pw) {
    dump("Loading key from " + file.path + "\n");
    const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
      Ci.nsIX509CertDB
    );
    certDB.importPKCS12File(file, pw);
  },
};
