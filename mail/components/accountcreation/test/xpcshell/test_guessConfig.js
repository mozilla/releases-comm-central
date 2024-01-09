/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the GuessConfig module, starting with the basic function for checking
 * a server's response, then adding more layers until finally doing a full
 * configuration guess.
 *
 * This test uses mock servers, behind a SOCKS proxy pretending they exist
 * with known hostnames and standard ports. It also creates exceptions for TLS
 * connections using a test certificate.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/NetworkTestUtils.jsm"
);
const { POP3Server } = ChromeUtils.importESModule(
  "resource://testing-common/POP3Server.sys.mjs"
);
const { SMTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/SMTPServer.sys.mjs"
);
const { GuessConfig, GuessConfigForTests } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);
const { doProxy, HostDetector, SocketUtil, SSLErrorHandler } =
  GuessConfigForTests;

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);
let tlsCert, expiredCert;

// Change this for more server debugging output. See Maild.sys.mjs for values.
const serverDebugLevel = 0;

// Something in this test causes NSS shutdown to fail. Ignore it.
Services.env.set("MOZ_IGNORE_NSS_SHUTDOWN_LEAKS", "1");

add_setup(async function () {
  // Install the test certificate in the database, then set the exceptions.
  const profile = do_get_profile();
  do_get_file("certs/cert9.db").copyTo(profile, "cert9.db");
  do_get_file("certs/key4.db").copyTo(profile, "key4.db");

  tlsCert = await getCertificate("certs/ok");
  Assert.equal(tlsCert.commonName, "test.test");
  expiredCert = await getCertificate("certs/expired");
  Assert.equal(expiredCert.commonName, "expired.test.test");

  const imapServer = new IMAPServer(this, { extensions: ["RFC2195"] });
  imapServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 143, imapServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 143, imapServer.port);

  const imapTLSServer = new IMAPServer(this, {
    extensions: ["RFC2195"],
    tlsCert,
  });
  imapTLSServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 993, imapTLSServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 993, imapTLSServer.port);

  // Serves a certificate that doesn't match the hostname.
  NetworkTestUtils.configureProxy("mitm.test.test", 993, imapTLSServer.port);

  // Serves an expired certificate.
  const imapExpiredTLSServer = new IMAPServer(this, {
    extensions: ["RFC2195"],
    tlsCert: expiredCert,
  });
  imapExpiredTLSServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy(
    "expired.test.test",
    993,
    imapExpiredTLSServer.port
  );

  const pop3Server = new POP3Server(this);
  pop3Server.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 110, pop3Server.port);
  NetworkTestUtils.configureProxy("alt.test.test", 110, pop3Server.port);

  const pop3TLSServer = new POP3Server(this, { tlsCert });
  pop3TLSServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 995, pop3TLSServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 995, pop3TLSServer.port);

  const smtpServer = new SMTPServer(this);
  smtpServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 587, smtpServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 587, smtpServer.port);

  const smtpTLSServer = new SMTPServer(this, { tlsCert });
  smtpTLSServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 465, smtpTLSServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 465, smtpTLSServer.port);

  // Serves an expired certificate.
  const smtpExpiredTLSServer = new SMTPServer(this, { tlsCert: expiredCert });
  smtpExpiredTLSServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy(
    "expired.test.test",
    465,
    smtpExpiredTLSServer.port
  );
});

registerCleanupFunction(function () {
  NetworkTestUtils.clearProxy();
});

async function getCertificate(path) {
  const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  let cert = await IOUtils.readUTF8(do_get_file(path).path);
  cert = cert.replace("-----BEGIN CERTIFICATE-----", "");
  cert = cert.replace("-----END CERTIFICATE-----", "");
  cert = cert.replaceAll(/\s/g, "");
  return certDB.constructX509FromBase64(cert);
}

async function callSocketUtil(hostname, port, socketType, commands) {
  const proxy = await new Promise(resolve => doProxy(hostname, resolve));
  const { promise, resolve, reject } = Promise.withResolvers();
  const sslErrors = {};
  SocketUtil(
    hostname,
    port,
    socketType,
    commands,
    10, // timeout
    proxy,
    new SSLErrorHandler(sslErrors, console),
    resolve,
    reject
  );
  return { promise, sslErrors };
}

const imapCommands = ["1 CAPABILITY\r\n", "2 LOGOUT\r\n"];
const expectedIMAPResponse = [
  "* OK IMAP4rev1 Fakeserver started up",
  "* CAPABILITY IMAP4rev1 CLIENTID AUTH=CRAM-MD5 AUTH=PLAIN AUTH=LOGIN",
  "1 OK CAPABILITY completed",
  "* BYE IMAP4rev1 Logging out",
  "2 OK LOGOUT completed",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the IMAP server and gets the
 * expected response.
 */
add_task(async function testSocketUtilIMAP() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    143,
    Ci.nsMsgSocketType.plain,
    imapCommands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedIMAPResponse);
  Assert.ok(!sslErrors._gotCertError);
});

/**
 * Tests that `SocketUtil` correctly connects to the TLS IMAP server and gets
 * the expected response.
 */
add_task(async function testSocketUtilIMAPSecure() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedIMAPResponse);
  Assert.ok(!sslErrors._gotCertError);
});

/**
 * Tests that with requireGoodCert=true, `SocketUtil` refuses to connect to
 * the TLS IMAP server with an expired certificate.
 */
add_task(async function testSocketUtilIMAPExpiredCert1() {
  const { promise, sslErrors } = await callSocketUtil(
    "expired.test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  );
  const response = await promise;
  Assert.equal(response, null);
  Assert.ok(!sslErrors._gotCertError);

  Assert.ok(
    !certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      expiredCert,
      {}
    ),
    "no certificate exception should exist"
  );
});

/**
 * Tests that with requireGoodCert=false, `SocketUtil` correctly creates a
 * certificate exception, connects to the TLS IMAP server with an expired
 * certificate, and gets the expected response.
 */
add_task(async function testSocketUtilIMAPExpiredCert2() {
  Services.prefs.setBoolPref(
    "mailnews.auto_config.guess.requireGoodCert",
    false
  );

  let { promise, sslErrors } = await callSocketUtil(
    "expired.test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  );
  let response = await promise;
  Assert.equal(response, null);
  Assert.equal(sslErrors._gotCertError, "ERROR_TIME");
  Assert.equal(sslErrors.targetSite, "expired.test.test:993");

  const isTemporary = {};
  Assert.ok(
    certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      expiredCert,
      isTemporary
    ),
    "certificate exception should have been added"
  );
  Assert.ok(isTemporary.value, "certificate exception should be temporary");

  ({ promise, sslErrors } = await callSocketUtil(
    "expired.test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  ));

  response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedIMAPResponse);
  Assert.ok(!sslErrors._gotCertError);

  Assert.ok(
    certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      expiredCert,
      isTemporary
    ),
    "certificate exception should remain"
  );
  Assert.ok(
    isTemporary.value,
    "certificate exception should still be temporary"
  );

  certOverrideService.clearAllOverrides();
  Services.prefs.clearUserPref("mailnews.auto_config.guess.requireGoodCert");
});

/**
 * Tests that with requireGoodCert=true, `SocketUtil` refuses to connect to
 * the TLS IMAP server with an mismatched certificate.
 */
add_task(async function testSocketUtilIMAPMistmatchedCert1() {
  const { promise, sslErrors } = await callSocketUtil(
    "mitm.test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  );
  const response = await promise;
  Assert.equal(response, null);
  Assert.ok(!sslErrors._gotCertError);

  Assert.ok(
    !certOverrideService.hasMatchingOverride(
      "mitm.test.test",
      993,
      {},
      tlsCert,
      {}
    ),
    "no certificate exception should exist"
  );
});

/**
 * Tests that with requireGoodCert=false, `SocketUtil` refuses to connect to
 * the TLS IMAP server with an mismatched certificate.
 */
add_task(async function testSocketUtilIMAPMistmatchedCert2() {
  Services.prefs.setBoolPref(
    "mailnews.auto_config.guess.requireGoodCert",
    false
  );

  const { promise, sslErrors } = await callSocketUtil(
    "mitm.test.test",
    993,
    Ci.nsMsgSocketType.SSL,
    imapCommands
  );
  const response = await promise;
  Assert.equal(response, null);
  Assert.equal(sslErrors._gotCertError, "ERROR_MISMATCH");

  Assert.ok(
    !certOverrideService.hasMatchingOverride(
      "mitm.test.test",
      993,
      {},
      tlsCert,
      {}
    ),
    "no certificate exception should exist"
  );

  Services.prefs.clearUserPref("mailnews.auto_config.guess.requireGoodCert");
});

const pop3Commands = ["CAPA\r\n", "QUIT\r\n"];
const expectedPOP3Response = [
  "+OK Fake POP3 server ready",
  "+OK List of our wanna-be capabilities follows:",
  "UIDL",
  "TOP",
  "SASL CRAM-MD5 PLAIN LOGIN",
  "IMPLEMENTATION fakeserver",
  ".",
  "+OK fakeserver signing off",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the POP3 server and gets the
 * expected response.
 */
add_task(async function testSocketUtilPOP3() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    110,
    Ci.nsMsgSocketType.plain,
    pop3Commands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedPOP3Response);
  Assert.ok(!sslErrors._gotCertError);
});

/**
 * Tests that `SocketUtil` correctly connects to the TLS POP3 server and gets
 * the expected response.
 */
add_task(async function testSocketUtilPOP3Secure() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    995,
    Ci.nsMsgSocketType.SSL,
    pop3Commands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedPOP3Response);
  Assert.ok(!sslErrors._gotCertError);
});

const smtpCommands = ["EHLO we-guess.mozilla.org\r\n", "QUIT\r\n"];
const expectedSMTPResponse = [
  "220 ok",
  "250-fakeserver greets you",
  "250-8BITMIME",
  "250-SIZE",
  "250-CLIENTID",
  "250-AUTH CRAM-MD5 PLAIN LOGIN",
  "250 HELP",
  "221 done",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the SMTP server and gets the
 * expected response.
 */
add_task(async function testSocketUtilSMTP() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    587,
    Ci.nsMsgSocketType.plain,
    smtpCommands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedSMTPResponse);
  Assert.ok(!sslErrors._gotCertError);
});

/**
 * Tests that `SocketUtil` correctly connects to the TLS SMTP server and gets
 * the expected response.
 */
add_task(async function testSocketUtilSMTPSecure() {
  const { promise, sslErrors } = await callSocketUtil(
    "test.test",
    465,
    Ci.nsMsgSocketType.SSL,
    smtpCommands
  );
  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedSMTPResponse);
  Assert.ok(!sslErrors._gotCertError);
});

async function subtestHostDetector({
  type,
  port,
  socketType = -1,
  authMethod = -1,
  hostnamesToTry,
  portsToTry,
}) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const detector = new HostDetector(
    function progressCallback(hostTry) {},
    function successCallback(result, alts) {
      resolve({ result, alts });
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );
  detector._hostnamesToTry = hostnamesToTry;
  detector._portsToTry = portsToTry;
  detector.start("test.test", false, type, port, socketType, authMethod);
  return promise;
}

async function subtestHostDetectorGivenValues(
  type,
  port,
  socketType,
  portsToTry
) {
  const { result } = await subtestHostDetector({
    type,
    port,
    socketType,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    hostnamesToTry(protocol, domain) {
      return [domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "test.test", "hostname");
  Assert.equal(result.port, port, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, socketType, "socketType");
  Assert.equal(
    result.authMethod,
    Ci.nsMsgAuthMethod.passwordCleartext,
    "authMethod"
  );
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
}

/**
 * Test that `HostDetector` finds the IMAP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesIMAP() {
  await subtestHostDetectorGivenValues(
    "imap",
    143,
    Ci.nsMsgSocketType.plain,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the TLS IMAP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesIMAPSecure() {
  await subtestHostDetectorGivenValues(
    "imap",
    993,
    Ci.nsMsgSocketType.SSL,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the POP3 server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3() {
  await subtestHostDetectorGivenValues(
    "pop3",
    110,
    Ci.nsMsgSocketType.plain,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the TLS POP3 server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3Secure() {
  await subtestHostDetectorGivenValues(
    "pop3",
    995,
    Ci.nsMsgSocketType.SSL,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the SMTP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTP() {
  await subtestHostDetectorGivenValues(
    "smtp",
    587,
    Ci.nsMsgSocketType.plain,
    GuessConfig.getOutgoingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the TLS SMTP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTPSecure() {
  await subtestHostDetectorGivenValues(
    "smtp",
    465,
    Ci.nsMsgSocketType.SSL,
    GuessConfig.getOutgoingTryOrder
  );
});

async function subtestHostDetectorAuto(type, portsToTry, expectedPort) {
  const { result } = await subtestHostDetector({
    type,
    hostnamesToTry(protocol, domain) {
      return [domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "test.test", "hostname");
  Assert.equal(result.port, expectedPort, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, Ci.nsMsgSocketType.SSL, "socketType");
  Assert.equal(result.authMethod, -1, "authMethod");
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
}

/**
 * Test that `HostDetector` finds the IMAP server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoIMAP() {
  await subtestHostDetectorAuto("imap", GuessConfig.getIncomingTryOrder, 993);
});

/**
 * Test that `HostDetector` finds the POP3 server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoPOP3() {
  await subtestHostDetectorAuto("pop3", GuessConfig.getIncomingTryOrder, 995);
});

/**
 * Test that `HostDetector` finds the SMTP server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoSMTP() {
  await subtestHostDetectorAuto("smtp", GuessConfig.getOutgoingTryOrder, 465);
});

async function subtestHostDetectorAlternateHostname(
  type,
  portsToTry,
  expectedPort
) {
  const { result, alts } = await subtestHostDetector({
    type,
    hostnamesToTry(protocol, domain) {
      return [`bad.${domain}`, `alt.${domain}`, domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "alt.test.test", "hostname");
  Assert.equal(result.port, expectedPort, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, Ci.nsMsgSocketType.SSL, "socketType");
  Assert.equal(result.authMethod, -1, "authMethod");
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
  Assert.deepEqual(alts, []);
}

/**
 * Test that `HostDetector` finds the IMAP server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnameIMAP() {
  await subtestHostDetectorAlternateHostname(
    "imap",
    GuessConfig.getIncomingTryOrder,
    993
  );
});

/**
 * Test that `HostDetector` finds the POP3 server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnamePOP3() {
  await subtestHostDetectorAlternateHostname(
    "pop3",
    GuessConfig.getIncomingTryOrder,
    995
  );
});

/**
 * Test that `HostDetector` finds the SMTP server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnameSMTP() {
  await subtestHostDetectorAlternateHostname(
    "smtp",
    GuessConfig.getOutgoingTryOrder,
    465
  );
});

/**
 * Tests a complete `guessConfig` operation returns a correct `AccountConfig`
 * result for the configured servers.
 */
add_task(async function testGuessConfig() {
  const { promise, resolve, reject } = Promise.withResolvers();
  GuessConfig.guessConfig(
    "test.test",
    function progressCallback() {},
    function successCallback(accountConfig) {
      resolve(accountConfig);
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );

  const accountConfig = await promise;
  const { incoming, incomingAlternatives, outgoing, outgoingAlternatives } =
    accountConfig;

  Assert.equal(incoming.type, "imap");
  Assert.equal(incoming.hostname, "test.test");
  Assert.equal(incoming.port, 993);
  Assert.equal(incoming.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(incoming.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(incoming.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(incomingAlternatives.length, 1);
  Assert.equal(incomingAlternatives[0].type, "pop3");
  Assert.equal(incomingAlternatives[0].hostname, "test.test");
  Assert.equal(incomingAlternatives[0].port, 995);
  Assert.equal(incomingAlternatives[0].socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(
    incomingAlternatives[0].auth,
    Ci.nsMsgAuthMethod.passwordEncrypted
  );
  Assert.deepEqual(incomingAlternatives[0].authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(outgoing.type, "smtp");
  Assert.equal(outgoing.hostname, "test.test");
  Assert.equal(outgoing.port, 465);
  Assert.equal(outgoing.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(outgoing.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(outgoing.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.deepEqual(outgoingAlternatives, []);
});

/**
 * Tests a complete `guessConfig` operation for a server with a dodgy
 * certificate and requireGoodCert=false. A certificate exception will be
 * added during the test so the configuration can be detected, and it must be
 * removed before `guessConfig` returns.
 */
add_task(async function testGuessConfigExpiredCert() {
  Services.prefs.setBoolPref(
    "mailnews.auto_config.guess.requireGoodCert",
    false
  );

  const { promise, resolve, reject } = Promise.withResolvers();
  GuessConfig.guessConfig(
    "expired.test.test",
    function progressCallback() {},
    function successCallback(accountConfig) {
      resolve(accountConfig);
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );

  const accountConfig = await promise;
  const { incoming, incomingAlternatives, outgoing, outgoingAlternatives } =
    accountConfig;

  Assert.equal(incoming.type, "imap");
  Assert.equal(incoming.hostname, "expired.test.test");
  Assert.equal(incoming.port, 993);
  Assert.equal(incoming.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(incoming.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(incoming.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(incomingAlternatives.length, 0);

  Assert.equal(outgoing.type, "smtp");
  Assert.equal(outgoing.hostname, "expired.test.test");
  Assert.equal(outgoing.port, 465);
  Assert.equal(outgoing.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(outgoing.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(outgoing.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.deepEqual(outgoingAlternatives, []);

  Assert.ok(
    !certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      expiredCert,
      {}
    ),
    "temporary certificate override should be removed"
  );

  Services.prefs.clearUserPref("mailnews.auto_config.guess.requireGoodCert");
});
