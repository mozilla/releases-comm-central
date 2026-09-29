/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests connecting with STARTTLS, and that what the server sent in plaintext
 * before the TLS handshake, which could have been injected, is not used.
 */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const { CAPABILITY, onStartup } = IMAP_RFC3501_handler.prototype;

// Something about the TLS connections to the fake server causes NSS shutdown
// to fail. Ignore it, like test_guessConfig.js does.
Services.env.set("MOZ_IGNORE_NSS_SHUTDOWN_LEAKS", "1");

let imapServer, incomingServer;

add_setup(async function () {
  imapServer = await ServerTestUtils.createServer({
    type: "imap",
    baseOptions: {
      extensions: ["RFC2195"],
      startTLS: true,
      tlsCertFile: "valid",
    },
    hostname: "test.test",
    port: 143,
  });

  const account = MailServices.accounts.createAccount();
  incomingServer = account.incomingServer =
    MailServices.accounts.createIncomingServer("user", "test.test", "imap");
  incomingServer.password = "password";
  incomingServer.port = 143;
  incomingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  registerCleanupFunction(() => {
    IMAP_RFC3501_handler.prototype.CAPABILITY = CAPABILITY;
    IMAP_RFC3501_handler.prototype.onStartup = onStartup;
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
  });
});

async function discoverFolders() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  try {
    await listener.promise;
    return true;
  } catch (e) {
    return false;
  }
}

add_task(async function testStartTLS() {
  Assert.ok(await discoverFolders(), "connecting with STARTTLS should work");
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("INBOX"),
    "INBOX should have been discovered"
  );
  incomingServer.closeCachedConnections();
});

add_task(async function testCapabilitiesFromBeforeStartTLS() {
  // Capabilities are only sent in the greeting, before the TLS handshake.
  IMAP_RFC3501_handler.prototype.onStartup = function () {
    onStartup.call(this);
    const [capabilities] = CAPABILITY.call(this).split("\0");
    return (
      capabilities.replace("* CAPABILITY", "* OK [CAPABILITY") +
      " X-GM-EXT-1] Hi"
    );
  };
  IMAP_RFC3501_handler.prototype.CAPABILITY = function () {
    return this._tlsActive ? "OK CAPABILITY completed" : CAPABILITY.call(this);
  };
  incomingServer.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer = false;
  Assert.ok(
    !(await discoverFolders()),
    "connecting should fail without capabilities after the TLS handshake"
  );
  Assert.ok(
    !incomingServer.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer,
    "capabilities from the plaintext greeting should not be used"
  );
  IMAP_RFC3501_handler.prototype.CAPABILITY = CAPABILITY;
  IMAP_RFC3501_handler.prototype.onStartup = onStartup;
});

add_task(async function testCertificateError() {
  await ServerTestUtils.createServer({
    type: "imap",
    baseOptions: {
      extensions: ["RFC2195"],
      startTLS: true,
      tlsCertFile: "selfsigned",
    },
    hostname: "selfsigned.test.test",
    port: 143,
  });
  const account = MailServices.accounts.createAccount();
  const server = (account.incomingServer =
    MailServices.accounts.createIncomingServer(
      "user",
      "selfsigned.test.test",
      "imap"
    ));
  server.password = "password";
  server.port = 143;
  server.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
  server.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer = true;

  let exitCode;
  const listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(url, code) {
      exitCode = code;
    },
  });
  MailServices.imap.discoverAllFolders(server.rootFolder, listener, null);
  await Assert.rejects(listener.promise, /./, "connecting should fail");

  const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
    Ci.nsINSSErrorsService
  );
  let errorClass;
  try {
    errorClass = nssErrorsService.getErrorClass(exitCode);
  } catch (e) {
    // Not a TLS error.
  }
  Assert.equal(
    errorClass,
    Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT,
    "the url should fail with the overridable certificate error"
  );
  Assert.ok(
    server.isGMailServer,
    "the capabilities from before the failed handshake should be kept"
  );

  server.closeCachedConnections();
  MailServices.accounts.removeAccount(account, false);
});
