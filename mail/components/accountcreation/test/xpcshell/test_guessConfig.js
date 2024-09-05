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

const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

const { GuessConfig, GuessConfigForTests } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);
const { doProxy, HostDetector, SocketUtil, SSLErrorHandler } =
  GuessConfigForTests;

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);
let tlsCert, expiredCert;

// Something in this test causes NSS shutdown to fail. Ignore it.
Services.env.set("MOZ_IGNORE_NSS_SHUTDOWN_LEAKS", "1");

add_setup(async function () {
  do_get_profile();
  tlsCert = await getCertificate("valid");
  expiredCert = await getCertificate("expired");

  await createServers([
    { ...serverDefs.imap.plain, aliases: [["alt.test.test", 143]] },
    serverDefs.imap.startTLS,
    {
      ...serverDefs.imap.tls,
      aliases: [
        ["alt.test.test", 993],
        ["mitm.test.test", 993],
      ],
    },
    serverDefs.imap.expiredTLS,
    { ...serverDefs.pop3.plain, aliases: [["alt.test.test", 110]] },
    serverDefs.pop3.startTLS,
    { ...serverDefs.pop3.tls, aliases: [["alt.test.test", 995]] },
    { ...serverDefs.smtp.plain, aliases: [["alt.test.test", 587]] },
    serverDefs.smtp.startTLS,
    { ...serverDefs.smtp.tls, aliases: [["alt.test.test", 465]] },
    serverDefs.smtp.expiredTLS,
  ]);
});

registerCleanupFunction(function () {
  NetworkTestUtils.clearProxy();
});

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
 * Tests that `SocketUtil` correctly connects to the startTLS IMAP server and
 * gets the expected response.
 */
add_task(async function testSocketUtilIMAPStartTLS() {
  const { promise, sslErrors } = await callSocketUtil(
    "starttls.test.test",
    143,
    Ci.nsMsgSocketType.plain,
    imapCommands
  );
  const response = await promise;
  const expectedResponse = expectedIMAPResponse.slice();
  expectedResponse[1] = expectedResponse[1].replace(
    "CLIENTID",
    "CLIENTID STARTTLS"
  );
  Assert.deepEqual(response.join("").split("\r\n"), expectedResponse);
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
 * Tests that `SocketUtil` correctly connects to the startTLS POP3 server and
 * gets the expected response.
 */
add_task(async function testSocketUtilPOP3StartTLS() {
  const { promise, sslErrors } = await callSocketUtil(
    "starttls.test.test",
    110,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    pop3Commands
  );
  const response = await promise;
  const expectedResponse = expectedPOP3Response.slice();
  expectedResponse.splice(4, 0, "STLS");
  Assert.deepEqual(response.join("").split("\r\n"), expectedResponse);
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
  "250-DSN",
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
 * Tests that `SocketUtil` correctly connects to the startTLS SMTP server and
 * gets the expected response.
 */
add_task(async function testSocketUtilSMTPStartTLS() {
  const { promise, sslErrors } = await callSocketUtil(
    "starttls.test.test",
    587,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    smtpCommands
  );
  const response = await promise;
  const expectedResponse = expectedSMTPResponse.slice();
  expectedResponse.splice(6, 0, "250-STARTTLS");
  Assert.deepEqual(response.join("").split("\r\n"), expectedResponse);
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
  hostname = "test.test",
  type,
  port,
  socketType = -1,
  authMethod = -1,
  hostnamesToTry,
  portsToTry,
}) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const detector = new HostDetector(
    function progressCallback() {},
    function successCallback(result, alts) {
      resolve({ result, alts });
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );
  detector._hostnamesToTry = hostnamesToTry;
  detector._portsToTry = portsToTry;
  detector.start(hostname, false, type, port, socketType, authMethod);
  return promise;
}

async function subtestHostDetectorGivenValues({
  hostname = "test.test",
  type,
  port,
  socketType,
  portsToTry,
}) {
  const { result } = await subtestHostDetector({
    hostname,
    type,
    port,
    socketType,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    hostnamesToTry(protocol, domain) {
      return [domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, hostname, "hostname");
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
  await subtestHostDetectorGivenValues({
    type: "imap",
    port: 143,
    socketType: Ci.nsMsgSocketType.plain,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the startTLS IMAP server given the
 * configuration, and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesIMAPStartTLS() {
  await subtestHostDetectorGivenValues({
    hostname: "starttls.test.test",
    type: "imap",
    port: 143,
    socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the TLS IMAP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesIMAPSecure() {
  await subtestHostDetectorGivenValues({
    type: "imap",
    port: 993,
    socketType: Ci.nsMsgSocketType.SSL,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the POP3 server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3() {
  await subtestHostDetectorGivenValues({
    type: "pop3",
    port: 110,
    socketType: Ci.nsMsgSocketType.plain,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the startTLS POP3 server given the
 * configuration, and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3StartTLS() {
  await subtestHostDetectorGivenValues({
    hostname: "starttls.test.test",
    type: "pop3",
    port: 110,
    socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the TLS POP3 server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3Secure() {
  await subtestHostDetectorGivenValues({
    type: "pop3",
    port: 995,
    socketType: Ci.nsMsgSocketType.SSL,
    portsToTry: GuessConfig.getIncomingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the SMTP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTP() {
  await subtestHostDetectorGivenValues({
    type: "smtp",
    port: 587,
    socketType: Ci.nsMsgSocketType.plain,
    portsToTry: GuessConfig.getOutgoingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the startTLS SMTP server given the
 * configuration, and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTPStartTLS() {
  await subtestHostDetectorGivenValues({
    hostname: "starttls.test.test",
    type: "smtp",
    port: 587,
    socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
    portsToTry: GuessConfig.getOutgoingTryOrder,
  });
});

/**
 * Test that `HostDetector` finds the TLS SMTP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTPSecure() {
  await subtestHostDetectorGivenValues({
    type: "smtp",
    port: 465,
    socketType: Ci.nsMsgSocketType.SSL,
    portsToTry: GuessConfig.getOutgoingTryOrder,
  });
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
 * Tests a complete `guessConfig` operation returns a correct `AccountConfig`
 * result for the configured servers, preferring well-known subdomains over
 * the base domain.
 */
add_task(async function testGuessConfigKnownSubdomains() {
  const [imapServer, pop3Server, smtpServer] = await createServers([
    { ...serverDefs.imap.tls, hostname: "imap.test.test" },
    { ...serverDefs.pop3.tls, hostname: "pop3.test.test" },
    { ...serverDefs.smtp.tls, hostname: "smtp.test.test" },
  ]);

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
  Assert.equal(incoming.hostname, "imap.test.test");
  Assert.equal(incoming.port, 993);
  Assert.equal(incoming.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(incoming.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(incoming.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(incomingAlternatives.length, 1);
  Assert.equal(incomingAlternatives[0].type, "pop3");
  Assert.equal(incomingAlternatives[0].hostname, "pop3.test.test");
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
  Assert.equal(outgoing.hostname, "smtp.test.test");
  Assert.equal(outgoing.port, 465);
  Assert.equal(outgoing.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(outgoing.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(outgoing.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.deepEqual(outgoingAlternatives, []);

  imapServer.close();
  pop3Server.close();
  smtpServer.close();
  NetworkTestUtils.unconfigureProxy("imap.test.test", 993);
  NetworkTestUtils.unconfigureProxy("pop3.test.test", 995);
  NetworkTestUtils.unconfigureProxy("smtp.test.test", 465);
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
