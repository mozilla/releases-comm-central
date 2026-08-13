/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const folderTypes = [
  [
    "fccFolderURI",
    "getOrCreateFccFolderAsync",
    "Sent",
    Ci.nsMsgFolderFlags.SentMail,
  ],
  [
    "draftsFolderURI",
    "getOrCreateDraftsFolderAsync",
    "Drafts",
    Ci.nsMsgFolderFlags.Drafts,
  ],
  [
    "archivesFolderURI",
    "getOrCreateArchivesFolderAsync",
    "Archives",
    Ci.nsMsgFolderFlags.Archive,
  ],
  [
    "templatesFolderURI",
    "getOrCreateTemplatesFolderAsync",
    "Templates",
    Ci.nsMsgFolderFlags.Templates,
  ],
];

async function runFoldersSubtest(type, callback) {
  const mockServer = await ServerTestUtils.createServer({
    ...ServerTestUtils.serverDefs[type].plain,
    options: {
      username: "oscar",
      password: "oscar",
    },
  });

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "oscar",
    "localhost",
    type
  );
  server.port = mockServer.port;
  server.password = "oscar";
  if (type == "ews") {
    server.setStringValue(
      "ews_url",
      `http://localhost:${mockServer.port}/EWS/Exchange.asmx`
    );
  } else if (type == "graph") {
    server.setStringValue("ews_url", `http://localhost:${mockServer.port}/`);
  }
  account.incomingServer = server;
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  const root = server.rootFolder;
  server.performBiff(null);
  await TestUtils.waitForCondition(() => root.containsChildNamed("INBOX"));

  await callback(type, server, identity);

  if (type == "pop3") {
    await TestUtils.waitForCondition(
      () => !server.wrappedJSObject.runningClient,
      "waiting for POP3 connection to become idle"
    );
  } else if (type == "imap") {
    server.QueryInterface(Ci.nsIImapIncomingServer);
    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for IMAP connection to become idle"
    );
  }
  MailServices.accounts.removeAccount(account, false);
  mockServer.close?.();
  mockServer.stop?.();
}

/**
 * Tests identities where the folder properties are not set. Folders with the
 * hard-coded names and flags should be created as a subfolders of the root
 * folder on the server.
 */
async function subtestUnset(type, server, identity) {
  const root = server.rootFolder;

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }
    Assert.equal(
      identity[attribute],
      null,
      `${attribute} should return no value`
    );

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, root.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${server.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }
}

add_task(async function testUnsetPOP3() {
  await runFoldersSubtest("pop3", subtestUnset);
});

add_task(async function testUnsetIMAP() {
  await runFoldersSubtest("imap", subtestUnset);
});

add_task(async function testUnsetEWS() {
  await runFoldersSubtest("ews", subtestUnset);
});

add_task(async function testUnsetGraph() {
  await runFoldersSubtest("graph", subtestUnset);
});

/**
 * Tests identities where the folder properties are set, but point to a folder
 * that doesn't exist. This could be caused by a folder that once existed but
 * no longer exists. Folders with the hard-coded names and flags should be
 * created as a subfolders of the root folder on the server.
 */
async function subtestSetButMissing(type, server, identity) {
  const root = server.rootFolder;

  identity.fccFolderURI = `${server.serverURI}/Anything`;
  identity.draftsFolderURI = `${server.serverURI}/Anything`;
  identity.archivesFolderURI = `${server.serverURI}/Anything`;
  identity.templatesFolderURI = `${server.serverURI}/Anything`;

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, root.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${server.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folder again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }
}

add_task(async function testSetButMissingPOP3() {
  await runFoldersSubtest("pop3", subtestSetButMissing);
});

add_task(async function testSetButMissingIMAP() {
  await runFoldersSubtest("imap", subtestSetButMissing);
});

add_task(async function testSetButMissingEWS() {
  await runFoldersSubtest("ews", subtestSetButMissing);
});

add_task(async function testSetButMissingGraph() {
  await runFoldersSubtest("graph", subtestSetButMissing);
});

/**
 * Tests identities where the folder properties are set and point to a folder
 * that exists.
 */
async function subtestSet(type, server, identity) {
  const root = server.rootFolder;
  const parentFolder = await root.createSubfolderAsync("Parent");
  const targetFolder = await parentFolder.createSubfolderAsync("Child");

  identity.fccFolderURI = targetFolder.URI;
  identity.draftsFolderURI = targetFolder.URI;
  identity.archivesFolderURI = targetFolder.URI;
  identity.templatesFolderURI = targetFolder.URI;

  for (const [, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }

    const folder = await identity[func]();
    Assert.equal(
      folder,
      targetFolder,
      "function should return the target folder"
    );
    Assert.equal(
      targetFolder.flags & flag,
      flag,
      "the target folder should now have the type flag"
    );
  }
}

add_task(async function testSetPOP3() {
  await runFoldersSubtest("pop3", subtestSet);
});

add_task(async function testSetIMAP() {
  await runFoldersSubtest("imap", subtestSet);
});

add_task(async function testSetEWS() {
  await runFoldersSubtest("ews", subtestSet);
});

add_task(async function testSetGraph() {
  await runFoldersSubtest("graph", subtestSet);
});

/**
 * Tests what happens if creating a folder on the remote server fails (in this
 * case because there is no remote server). Folders with the hard-coded names
 * and flags should be created as a subfolders of the Local Folders root.
 *
 * Note this test isn't run for POP3 because it doesn't create folders on a
 * remote server.
 */
async function subtestCreateErrorFallback(type) {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localServer = localAccount.incomingServer;
  const localRoot = localServer.rootFolder;

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "romeo",
    "localhost",
    type
  );
  account.incomingServer = server;
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  const root = server.rootFolder;
  // Cheeky hack to avoid an assertion on a not-really-initialised folder.
  root.setStringProperty("ewsId", "root");

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a ${type} account`);

    Assert.ok(
      !localRoot.getFolderWithFlags(flag),
      `local folders should start with no ${name} folder`
    );
    Assert.ok(
      !root.getFolderWithFlags(flag),
      `${type} server should start with no ${name} folder`
    );
    Assert.equal(
      identity[attribute],
      null,
      `${attribute} should start with no value`
    );

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, localRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${localServer.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(account, false);
  MailServices.accounts.removeAccount(localAccount, false);
}

add_task(async function testCreateErrorFallbackIMAP() {
  await subtestCreateErrorFallback("imap");
});

add_task(async function testCreateErrorFallbackEWS() {
  await subtestCreateErrorFallback("ews");
});

add_task(async function testCreateErrorFallbackGraph() {
  await subtestCreateErrorFallback("graph");
});

/**
 * Tests that folders created on a deferred POP3 account are created on the
 * target server, not the deferred server.
 */
add_task(async function testDeferredPOP3() {
  // This target server is another POP3 server to avoid accidentally passing
  // if folder creation falls back to Local Folders.
  const targetAccount = MailServices.accounts.createAccount();
  const targetServer = MailServices.accounts.createIncomingServer(
    "mike",
    "localhost",
    "pop3"
  );
  targetAccount.incomingServer = targetServer;
  const targetRoot = targetServer.rootFolder;

  const sourceAccount = MailServices.accounts.createAccount();
  const sourceServer = MailServices.accounts.createIncomingServer(
    "victor",
    "localhost",
    "pop3"
  );
  sourceServer.QueryInterface(Ci.nsIPop3IncomingServer);
  sourceServer.deferredToAccount = targetAccount.key;
  sourceAccount.incomingServer = sourceServer;
  const sourceIdentity = MailServices.accounts.createIdentity();
  sourceAccount.addIdentity(sourceIdentity);
  const sourceRoot = sourceServer.rootFolder;

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a deferred POP3 account`);

    Assert.ok(
      !targetRoot.getFolderWithFlags(flag),
      `target server should start with no ${name} folder`
    );
    Assert.ok(
      !sourceRoot.getFolderWithFlags(flag),
      `source server should start with no ${name} folder`
    );
    Assert.equal(
      sourceIdentity[attribute],
      null,
      `${attribute} should start with no value`
    );

    const folder = await sourceIdentity[func]();
    Assert.equal(folder.parent?.URI, targetRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${targetServer.serverURI}/${name}`);
    Assert.equal(
      sourceIdentity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await sourceIdentity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(sourceAccount, false);
  MailServices.accounts.removeAccount(targetAccount, false);
});
