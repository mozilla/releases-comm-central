/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServers, getCertificate, serverDefs } = ServerTestUtils;

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { POP3Server } = ChromeUtils.importESModule(
  "resource://testing-common/POP3Server.sys.mjs"
);

const { ConfigVerifier } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ConfigVerifier.sys.mjs"
);

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

const verifier = new ConfigVerifier(window.msgWindow);

// Change this for more server debugging output. See Maild.sys.mjs for values.
const serverDebugLevel = 0;
let tlsCert, expiredCert;

add_setup(async function () {
  tlsCert = await getCertificate("valid");
  expiredCert = await getCertificate("expired");

  await createServers([
    serverDefs.imap.tls,
    serverDefs.imap.expiredTLS,
    serverDefs.pop3.tls,
    serverDefs.pop3.expiredTLS,
  ]);
});

registerCleanupFunction(async function () {
  NetworkTestUtils.clearProxy();

  // Some tests that open new windows confuse mochitest, which waits for a
  // focus event on the main window, and the test times out. If we focus a
  // different window (browser-harness.xhtml should be the only other window
  // at this point) then mochitest gets its focus event and the test ends.
  await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
});

async function subtestWrongPassword({ type, port }) {
  const config = {
    incoming: {
      type,
      hostname: "test.test",
      port,
      socketType: Ci.nsMsgSocketType.SSL,
      auth: Ci.nsMsgAuthMethod.passwordCleartext,
      username: "user",
      password: "wrong password",
    },
    outgoing: {},
    identity: {
      emailAddress: "test@test.test",
    },
  };

  await Assert.rejects(
    verifier.verifyConfig(config),
    /Probably wrong configuration, username or password./,
    "verify should fail with the wrong password"
  );
}

async function subtestRightPassword({ type, port }) {
  const config = {
    incoming: {
      type,
      hostname: "test.test",
      port,
      socketType: Ci.nsMsgSocketType.SSL,
      auth: Ci.nsMsgAuthMethod.passwordCleartext,
      username: "user",
      password: "password",
    },
    outgoing: {},
    identity: {
      emailAddress: "test@test.test",
    },
  };

  Assert.ok(await verifier.verifyConfig(config));
}

async function subtestExpiredCertNoException({ type, port }) {
  const config = {
    incoming: {
      type,
      hostname: "expired.test.test",
      port,
      socketType: Ci.nsMsgSocketType.SSL,
      auth: Ci.nsMsgAuthMethod.passwordCleartext,
      username: "user",
      password: "password",
    },
    outgoing: {},
    identity: {
      emailAddress: "test@test.test",
    },
  };
  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    "cancel",
    "chrome://pippki/content/exceptionDialog.xhtml"
  );
  await Assert.rejects(
    verifier.verifyConfig(config),
    /Probably wrong configuration, username or password./,
    "verify should fail with an expired certificate"
  );
  await dialogPromise;
}

async function subtestExpiredCertException({ type, port }) {
  const config = {
    incoming: {
      type,
      hostname: "expired.test.test",
      port,
      socketType: Ci.nsMsgSocketType.SSL,
      auth: Ci.nsMsgAuthMethod.passwordCleartext,
      username: "user",
      password: "password",
    },
    outgoing: {},
    identity: {
      emailAddress: "test@test.test",
    },
  };

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    "extra1",
    "chrome://pippki/content/exceptionDialog.xhtml"
  );
  Assert.ok(await verifier.verifyConfig(config));
  await dialogPromise;

  Assert.ok(
    certOverrideService.hasMatchingOverride(
      "expired.test.test",
      port,
      {},
      expiredCert,
      {}
    ),
    "certificate exception should have been added"
  );

  certOverrideService.clearAllOverrides();
}

add_task(async function testIMAPWrongPassword() {
  await subtestWrongPassword({ type: "imap", port: 993 });
});

add_task(async function testIMAPRightPassword() {
  await subtestRightPassword({ type: "imap", port: 993 });
});

add_task(async function testIMAPExpiredCertNoException() {
  await subtestExpiredCertNoException({ type: "imap", port: 993 });
});

add_task(async function testIMAPExpiredCertException() {
  await subtestExpiredCertException({ type: "imap", port: 993 });
});

add_task(async function testPOP3WrongPassword() {
  await subtestWrongPassword({ type: "pop3", port: 995 });
});

add_task(async function testPOP3RightPassword() {
  await subtestRightPassword({ type: "pop3", port: 995 });
});

add_task(async function testPOP3ExpiredCertNoException() {
  await subtestExpiredCertNoException({ type: "pop3", port: 995 });
});

add_task(async function testPOP3ExpiredCertException() {
  await subtestExpiredCertException({ type: "pop3", port: 995 });
});
