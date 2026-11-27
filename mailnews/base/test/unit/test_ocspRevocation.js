/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that TLS server and S/MIME certificate verification fetches OCSP
 * responses and enforces a revoked status, including for certificates chaining
 * to a built-in root while CRLite has no coverage for them.
 *
 * The OCSP responses in data/ are static and valid only for a few days in
 * January 2026 (see data/gen_ocsp_responses.py), so verification is done at a
 * fixed time within that window.
 */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);

const SEC_ERROR_REVOKED_CERTIFICATE = -8180;
const VERIFY_TIME = 1767312000; // 2026-01-02T00:00:00Z
const EE_HOSTNAME = "ocsp-ee.test.test";

const VERIFICATIONS = [
  {
    name: "TLS server",
    certName: "ocsp-ee",
    usage: Ci.nsIX509CertDB.verifyUsageTLSServer,
    hostname: EE_HOSTNAME,
    usesCRLite: true,
  },
  {
    name: "S/MIME signer",
    certName: "ocsp-email",
    usage: Ci.nsIX509CertDB.verifyUsageEmailSigner,
    hostname: null,
    usesCRLite: false,
  },
  {
    name: "S/MIME recipient",
    certName: "ocsp-email",
    usage: Ci.nsIX509CertDB.verifyUsageEmailRecipient,
    hostname: null,
    usesCRLite: false,
  },
];

const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
  Ci.nsIX509CertDB
);

let caCert;
const eeCerts = new Map();
let ocspServer;
let ocspRequests = [];
let ocspResponse = null;

async function loadCert(name, trust) {
  const pem = await IOUtils.readUTF8(do_get_file(`data/${name}.pem`).path);
  const base64 = pem
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  return certDB.addCertFromBase64(base64, trust);
}

async function loadOCSPResponse(name) {
  const bytes = await IOUtils.read(do_get_file(`data/${name}.ocsp`).path);
  return String.fromCharCode(...bytes);
}

function handleOCSPRequest(request, response) {
  ocspRequests.push({
    method: request.method,
    contentType: request.hasHeader("Content-Type")
      ? request.getHeader("Content-Type")
      : null,
  });
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "application/ocsp-response", false);
  response.bodyOutputStream.write(ocspResponse, ocspResponse.length);
}

/**
 * PSM doesn't send OCSP requests while a PAC file is loading, so wait until
 * the test proxy configuration is in effect for the given URL.
 *
 * @param {string} url
 */
async function waitForProxy(url) {
  const pps = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(
    Ci.nsIProtocolProxyService
  );
  const channel = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
  });
  const proxyInfo = await new Promise(resolve => {
    pps.asyncResolve(channel, 0, {
      onProxyAvailable(request, chan, info) {
        resolve(info);
      },
    });
  });
  Assert.equal(proxyInfo?.type, "socks", "OCSP requests use the test proxy");
}

function verifyCert(verification) {
  return new Promise(resolve => {
    certDB.asyncVerifyCertAtTime(
      eeCerts.get(verification.certName),
      verification.usage,
      0,
      verification.hostname,
      VERIFY_TIME,
      [],
      prErrorCode => resolve(prErrorCode)
    );
  });
}

/**
 * For each verification, verify its end-entity certificate with the given OCSP
 * response for that certificate being served, and check the verification
 * result and the number of OCSP requests made.
 *
 * @param {"good"|"revoked"} responseType - The OCSP response to serve.
 * @param {integer} expectedResult - The expected PR error code, 0 for success.
 * @param {integer} expectedRequests - The expected number of OCSP requests.
 * @param {object[]} [verifications] - Entries of VERIFICATIONS to check.
 */
async function checkVerifications(
  responseType,
  expectedResult,
  expectedRequests,
  verifications = VERIFICATIONS
) {
  for (const verification of verifications) {
    certDB.clearOCSPCache();
    ocspRequests = [];
    ocspResponse = await loadOCSPResponse(
      `${verification.certName}-${responseType}`
    );

    const result = await verifyCert(verification);
    Assert.equal(
      result,
      expectedResult,
      `${verification.name} verification result`
    );
    Assert.equal(
      ocspRequests.length,
      expectedRequests,
      `${verification.name} OCSP requests made`
    );
    for (const request of ocspRequests) {
      Assert.equal(request.method, "POST", "OCSP request method");
      Assert.equal(
        request.contentType,
        "application/ocsp-request",
        "OCSP request content type"
      );
    }
  }
}

add_setup(async function () {
  caCert = await loadCert("ocsp-ca", "CTu,CTu,");
  for (const { certName } of VERIFICATIONS) {
    if (!eeCerts.has(certName)) {
      eeCerts.set(certName, await loadCert(certName, ",,"));
    }
  }

  ocspServer = new HttpServer();
  ocspServer.registerPrefixHandler("/", handleOCSPRequest);
  ocspServer.start(-1);
  ocspServer.identity.add("http", "ocsp.test.test", 80);
  NetworkTestUtils.configureProxy(
    "ocsp.test.test",
    80,
    ocspServer.identity.primaryPort
  );
  await waitForProxy("http://ocsp.test.test/");

  registerCleanupFunction(async () => {
    NetworkTestUtils.clearProxy();
    await new Promise(resolve => ocspServer.stop(resolve));
    for (const pref of [
      "security.OCSP.require",
      "security.pki.crlite_mode",
      "security.test.built_in_root_hash",
      "security.pki.certificate_transparency.disable_for_hosts",
    ]) {
      Services.prefs.clearUserPref(pref);
    }
  });
});

// With OCSP required, a good response is fetched and accepted, so verification
// succeeds only if the response is valid.
add_task(async function test_goodResponseHardFail() {
  Services.prefs.setBoolPref("security.OCSP.require", true);
  Services.prefs.setIntPref("security.pki.crlite_mode", 0);
  await checkVerifications("good", 0, 1);
  Services.prefs.clearUserPref("security.OCSP.require");
  Services.prefs.clearUserPref("security.pki.crlite_mode");
});

// With soft-fail OCSP, a fetched revoked response fails verification.
add_task(async function test_revokedResponse() {
  Services.prefs.setIntPref("security.pki.crlite_mode", 0);
  await checkVerifications("revoked", SEC_ERROR_REVOKED_CERTIFICATE, 1);
  Services.prefs.clearUserPref("security.pki.crlite_mode");
});

// For a built-in root without CRLite coverage, enforced CRLite skips the OCSP
// fetch for TLS server certs and accepts the revoked cert, while S/MIME certs
// ignore the CRLite mode. Disabled CRLite fetches OCSP and rejects the cert
// for all usages. With default prefs, OCSP must be fetched and the cert
// rejected for all usages.
add_task(
  {
    // security.test.built_in_root_hash is only available in debug builds.
    skip_if: () => !AppConstants.DEBUG,
  },
  async function test_builtInRoot() {
    Services.prefs.setCharPref(
      "security.test.built_in_root_hash",
      caCert.sha256Fingerprint
    );
    Services.prefs.setCharPref(
      "security.pki.certificate_transparency.disable_for_hosts",
      EE_HOSTNAME
    );

    Services.prefs.setIntPref("security.pki.crlite_mode", 2);
    await checkVerifications(
      "revoked",
      0,
      0,
      VERIFICATIONS.filter(v => v.usesCRLite)
    );
    await checkVerifications(
      "revoked",
      SEC_ERROR_REVOKED_CERTIFICATE,
      1,
      VERIFICATIONS.filter(v => !v.usesCRLite)
    );

    Services.prefs.setIntPref("security.pki.crlite_mode", 0);
    await checkVerifications("revoked", SEC_ERROR_REVOKED_CERTIFICATE, 1);

    Services.prefs.clearUserPref("security.pki.crlite_mode");
    await checkVerifications("revoked", SEC_ERROR_REVOKED_CERTIFICATE, 1);

    Services.prefs.clearUserPref("security.test.built_in_root_hash");
    Services.prefs.clearUserPref(
      "security.pki.certificate_transparency.disable_for_hosts"
    );
  }
);
