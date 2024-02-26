/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Simple tests for retention settings. In particular, we'd like to make
 * sure that applying retention settings works with the new code that avoids
 * opening db's to apply retention settings if the folder doesn't override
 * the server defaults.
 */

var { MessageGenerator, MessageScenarioFactory, SyntheticMessageSet } =
  ChromeUtils.import("resource://testing-common/mailnews/MessageGenerator.jsm");
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var gMessageGenerator = new MessageGenerator();
var gScenarioFactory = new MessageScenarioFactory(gMessageGenerator);
var messageInjection = new MessageInjection({ mode: "local" });

var gTestFolder;

add_setup(async function () {
  // Add 10 messages
  let messages = [];
  messages = messages.concat(gScenarioFactory.directReply(10));

  const msgSet = new SyntheticMessageSet(messages);

  gTestFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);
});

add_task(function test_retention() {
  const numMessages = 10;
  gTestFolder.msgDatabase = null;
  gTestFolder.applyRetentionSettings();
  const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  // adding messages leaves some headers around as garbage - make sure
  // those are cleaned up so the db will get closed.
  Cu.forceGC();
  Cu.forceCC();
  Assert.equal(gDbService.cachedDBForFolder(gTestFolder), null);
  // no retention settings, so we should have the same number of messages.
  Assert.equal(numMessages, gTestFolder.msgDatabase.dBFolderInfo.numMessages);
  const serverSettings = gTestFolder.server.retentionSettings;
  serverSettings.retainByPreference =
    Ci.nsIMsgRetentionSettings.nsMsgRetainByNumHeaders;
  serverSettings.numHeadersToKeep = 9;
  gTestFolder.server.retentionSettings = serverSettings;
  gTestFolder.applyRetentionSettings();
  // no retention settings, so we should have the same number of messages.
  Assert.equal(9, gTestFolder.msgDatabase.dBFolderInfo.numMessages);
  const folderSettings = gTestFolder.retentionSettings;
  folderSettings.retainByPreference =
    Ci.nsIMsgRetentionSettings.nsMsgRetainByNumHeaders;
  folderSettings.numHeadersToKeep = 8;
  folderSettings.useServerDefaults = false;
  gTestFolder.retentionSettings = folderSettings;
  gTestFolder.applyRetentionSettings();
  // no retention settings, so we should have the same number of messages.
  Assert.equal(8, gTestFolder.msgDatabase.dBFolderInfo.numMessages);
});
