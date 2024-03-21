/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file tests our indexing prowess.  This includes both our ability to
 *  properly be triggered by events taking place in thunderbird as well as our
 *  ability to correctly extract/index the right data.
 * In general, if these tests pass, things are probably working quite well.
 *
 * This test has local, IMAP online, IMAP offline, and IMAP online-become-offline
 *  variants.  See the text_index_messages_*.js files.
 *
 * Things we don't test that you think we might test:
 * - Full-text search.  Happens in query testing.
 */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { GlodaConstants } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaConstants.sys.mjs"
);
var { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);
var { GlodaIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);
var { queryExpect, sqlExpectCount } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaQueryHelper.sys.mjs"
);
var {
  assertExpectedMessagesIndexed,
  waitForGlodaIndexer,
  nukeGlodaCachesAndCollections,
} = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var {
  configureGlodaIndexing,
  waitForGlodaDBFlush,
  waitForIndexingHang,
  resumeFromSimulatedHang,
  permuteMessages,
  makeABCardForAddressPair,
} = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { SyntheticMessageSet, SyntheticPartMultiMixed, SyntheticPartLeaf } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
  );
var { TagNoun } = ChromeUtils.importESModule(
  "resource:///modules/gloda/NounTag.sys.mjs"
);

// Whether we can expect fulltext results
var expectFulltextResults = true;

/**
 * Should we force our folders offline after we have indexed them once.  We do
 * this in the online_to_offline test variant.
 */
var goOffline = false;

var messageInjection;
var msgGen;
var scenarios;

/* ===== Indexing Basics ===== */

/**
 * Index a message, wait for a commit, make sure the header gets the property
 *  set correctly.  Then modify the message, verify the dirty property shows
 *  up, flush again, and make sure the dirty property goes clean again.
 */
async function test_pending_commit_tracker_flushes_correctly() {
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  // Before the flush, there should be no gloda-id property.
  const msgHdr = msgSet.getMsgHdr(0);
  // Get it as a string to make sure it's empty rather than possessing a value.
  Assert.equal(msgHdr.getStringProperty("gloda-id"), "");

  await waitForGlodaDBFlush();

  // After the flush there should be a gloda-id property and it should
  //  equal the gloda id.
  const gmsg = msgSet.glodaMessages[0];
  Assert.equal(msgHdr.getUint32Property("gloda-id"), gmsg.id);

  // Make sure no dirty property was written.
  Assert.equal(msgHdr.getStringProperty("gloda-dirty"), "");

  // Modify the message.
  msgSet.setRead(true);
  await waitForGlodaIndexer(msgSet);
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));

  // Now there should be a dirty property and it should be 1.
  Assert.equal(
    msgHdr.getUint32Property("gloda-dirty"),
    GlodaMsgIndexer.kMessageDirty
  );

  // Flush.
  await waitForGlodaDBFlush();

  // Now dirty should be 0 and the gloda id should still be the same.
  Assert.equal(
    msgHdr.getUint32Property("gloda-dirty"),
    GlodaMsgIndexer.kMessageClean
  );
  Assert.equal(msgHdr.getUint32Property("gloda-id"), gmsg.id);
}

/**
 * Make sure that PendingCommitTracker causes a msgdb commit to occur so that
 *  if the nsIMsgFolder's msgDatabase attribute has already been nulled
 *  (which is normally how we force a msgdb commit), that the changes to the
 *  header actually hit the disk.
 */
async function test_pending_commit_causes_msgdb_commit() {
  // New message, index it.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  // Force the msgDatabase closed; the sqlite commit will not yet have occurred.
  messageInjection.getRealInjectionFolder(folder).msgDatabase = null;
  // Make the commit happen, this causes the header to get set.
  await waitForGlodaDBFlush();

  // Force a GC. This will kill off the header and the database, losing data
  //  if we are not protecting it.
  Cu.forceGC();

  // Now retrieve the header and make sure it has the gloda id set!
  const msgHdr = msgSet.getMsgHdr(0);
  Assert.equal(
    msgHdr.getUint32Property("gloda-id"),
    msgSet.glodaMessages[0].id
  );
}

/**
 * Give the indexing sweep a workout.
 *
 * This includes:
 * - Basic indexing sweep across never-before-indexed folders.
 * - Indexing sweep across folders with just some changes.
 * - Filthy pass.
 */
async function test_indexing_sweep() {
  // -- Never-before-indexed folders.
  // Turn off event-driven indexing.
  configureGlodaIndexing({ event: false });

  const [[folderA], setA1, setA2] = await messageInjection.makeFoldersWithSets(
    1,
    [{ count: 3 }, { count: 2 }]
  );
  const [, setB1, setB2] = await messageInjection.makeFoldersWithSets(1, [
    { count: 3 },
    { count: 2 },
  ]);
  const [[folderC], setC1, setC2] = await messageInjection.makeFoldersWithSets(
    1,
    [{ count: 3 }, { count: 2 }]
  );

  // Make sure that event-driven job gets nuked out of existence
  GlodaIndexer.purgeJobsUsingFilter(() => true);

  // Turn on event-driven indexing again; this will trigger a sweep.
  configureGlodaIndexing({ event: true });
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([setA1, setA2, setB1, setB2, setC1, setC2])
  );

  // -- Folders with some changes, pending commits.
  // Indexing off.
  configureGlodaIndexing({ event: false });

  setA1.setRead(true);
  setB2.setRead(true);

  // Indexing on, killing all outstanding jobs, trigger sweep.
  GlodaIndexer.purgeJobsUsingFilter(() => true);
  configureGlodaIndexing({ event: true });
  GlodaMsgIndexer.indexingSweepNeeded = true;

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA1, setB2]));

  // -- Folders with some changes, no pending commits.
  // Force a commit to clear out our pending commits.
  await waitForGlodaDBFlush();
  // Indexing off.
  configureGlodaIndexing({ event: false });

  setA2.setRead(true);
  setB1.setRead(true);

  // Indexing on, killing all outstanding jobs, trigger sweep.
  GlodaIndexer.purgeJobsUsingFilter(() => true);
  configureGlodaIndexing({ event: true });
  GlodaMsgIndexer.indexingSweepNeeded = true;

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA2, setB1]));

  // -- Filthy foldering indexing.
  // Just mark the folder filthy and make sure that we reindex everyone.
  // IMPORTANT!  The trick of marking the folder filthy only works because
  //  we flushed/committed the database above; the PendingCommitTracker
  //  is not aware of bogus filthy-marking of folders.
  // We leave the verification of the implementation details to
  //  test_index_sweep_folder.js.
  const glodaFolderC = Gloda.getFolderForFolder(
    messageInjection.getRealInjectionFolder(folderC)
  );
  // Marked gloda folder dirty.
  glodaFolderC._dirtyStatus = glodaFolderC.kFolderFilthy;
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setC1, setC2]));

  // -- Forced folder indexing.
  var callbackInvoked = false;
  GlodaMsgIndexer.indexFolder(
    messageInjection.getRealInjectionFolder(folderA),
    {
      force: true,
      callback() {
        callbackInvoked = true;
      },
    }
  );
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA1, setA2]));
  Assert.ok(callbackInvoked);
}

/**
 * We used to screw up and downgrade filthy folders to dirty if we saw an event
 *  happen in the folder before we got to the folder; this tests that we no
 *  longer do that.
 */
async function test_event_driven_indexing_does_not_mess_with_filthy_folders() {
  // Add a folder with a message.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));

  // Fake marking the folder filthy.
  const glodaFolder = Gloda.getFolderForFolder(
    messageInjection.getRealInjectionFolder(folder)
  );
  glodaFolder._dirtyStatus = glodaFolder.kFolderFilthy;

  // Generate an event in the folder.
  msgSet.setRead(true);
  // Make sure the indexer did not do anything and the folder is still filthy.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
  Assert.equal(glodaFolder._dirtyStatus, glodaFolder.kFolderFilthy);
  // Also, the message should not have actually gotten marked dirty.
  Assert.equal(msgSet.getMsgHdr(0).getUint32Property("gloda-dirty"), 0);

  // Let's make the message un-read again for consistency with the gloda state.
  msgSet.setRead(false);
  // Make the folder dirty and let an indexing sweep take care of this so we
  //  don't get extra events in subsequent tests.
  glodaFolder._dirtyStatus = glodaFolder.kFolderDirty;
  GlodaMsgIndexer.indexingSweepNeeded = true;
  // The message won't get indexed though.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
}

async function test_indexing_never_priority() {
  // Add a folder with a bunch of messages.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  // Index it, and augment the msgSet with the glodaMessages array
  //  for later use by sqlExpectCount.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  // Explicitly tell gloda to never index this folder.
  const XPCOMFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(XPCOMFolder);
  GlodaMsgIndexer.setFolderIndexingPriority(
    XPCOMFolder,
    glodaFolder.kIndexingNeverPriority
  );

  // Verify that the setter and getter do the right thing.
  Assert.equal(
    glodaFolder.indexingPriority,
    glodaFolder.kIndexingNeverPriority
  );

  // Check that existing message is marked as deleted.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [msgSet] }));

  // Make sure the deletion hit the database.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) from folderLocations WHERE id = ? AND indexingPriority = ?",
    glodaFolder.id,
    glodaFolder.kIndexingNeverPriority
  );

  // Add another message.
  await messageInjection.makeNewSetsInFolders([folder], [{ count: 1 }]);

  // Make sure that indexing returns nothing.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
}

async function test_setting_indexing_priority_never_while_indexing() {
  if (!messageInjection.messageInjectionIsLocal()) {
    return;
  }

  // Configure the gloda indexer to hang while streaming the message.
  configureGlodaIndexing({ hangWhile: "streaming" });

  // Create a folder with a message inside.
  const [[folder]] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  await waitForIndexingHang();

  // Explicitly tell gloda to never index this folder.
  const XPCOMFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(XPCOMFolder);
  GlodaMsgIndexer.setFolderIndexingPriority(
    XPCOMFolder,
    glodaFolder.kIndexingNeverPriority
  );

  // Reset indexing to not hang.
  configureGlodaIndexing({});

  // Sorta get the event chain going again.
  await resumeFromSimulatedHang(true);

  // Because the folder was dirty it should actually end up getting indexed,
  //  so in the end the message will get indexed.  Also, make sure a cleanup
  //  was observed.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { cleanedUp: 1 }));
}

/* ===== Threading / Conversation Grouping ===== */

var gSynMessages = [];
function allMessageInSameConversation(aSynthMessage, aGlodaMessage, aConvID) {
  if (aConvID === undefined) {
    return aGlodaMessage.conversationID;
  }
  Assert.equal(aConvID, aGlodaMessage.conversationID);
  // Cheat and stash the synthetic message (we need them for one of the IMAP
  //  tests).
  gSynMessages.push(aSynthMessage);
  return aConvID;
}

/**
 * Test our conversation/threading logic in the straight-forward direct
 *  reply case, the missing intermediary case, and the siblings with missing
 *  parent case.  We also test all permutations of receipt of those messages.
 * (Also tests that we index new messages.)
 */
async function test_threading_direct_reply() {
  const permutationMessages = await permuteMessages(
    scenarios.directReply,
    messageInjection
  );
  for (const preparedMessage of permutationMessages) {
    const message = await preparedMessage();
    await waitForGlodaIndexer();
    Assert.ok(
      ...assertExpectedMessagesIndexed([message], allMessageInSameConversation)
    );
  }
}

async function test_threading_missing_intermediary() {
  const permutationMessages = await permuteMessages(
    scenarios.missingIntermediary,
    messageInjection
  );
  for (const preparedMessage of permutationMessages) {
    const message = await preparedMessage();
    await waitForGlodaIndexer();
    Assert.ok(
      ...assertExpectedMessagesIndexed([message], allMessageInSameConversation)
    );
  }
}
async function test_threading_siblings_missing_parent() {
  const permutationMessages = await permuteMessages(
    scenarios.siblingsMissingParent,
    messageInjection
  );
  for (const preparedMessage of permutationMessages) {
    const message = await preparedMessage();
    await waitForGlodaIndexer();
    Assert.ok(
      ...assertExpectedMessagesIndexed([message], allMessageInSameConversation)
    );
  }
}

/**
 * Test the bit that says "if we're fulltext-indexing the message and we
 *  discover it didn't have any attachments, clear the attachment bit from the
 *  message header".
 */
async function test_attachment_flag() {
  // Create a synthetic message with an attachment that won't normally be listed
  //  in the attachment pane (Content-Disposition: inline, no filename, and
  //  displayable inline).
  const smsg = msgGen.makeMessage({
    name: "test message with part 1.2 attachment",
    attachments: [
      {
        body: "attachment",
        filename: "",
        format: "",
      },
    ],
  });
  // Save it off for test_attributes_fundamental_from_disk.
  const msgSet = new SyntheticMessageSet([smsg]);
  const folder = (fundamentalFolderHandle =
    await messageInjection.makeEmptyFolder());
  await messageInjection.addSetsToFolders([folder], [msgSet]);

  // If we need to go offline, let the indexing pass run, then force us offline.
  if (goOffline) {
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
    await messageInjection.makeFolderAndContentsOffline(folder);
    // Now the next indexer wait will wait for the next indexing pass.
  }

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], {
      verifier: verify_attachment_flag,
    })
  );
}

function verify_attachment_flag(smsg, gmsg) {
  // -- Attachments. We won't have these if we don't have fulltext results.
  if (expectFulltextResults) {
    Assert.equal(gmsg.attachmentNames.length, 0);
    Assert.equal(gmsg.attachmentInfos.length, 0);
    Assert.equal(
      false,
      gmsg.folderMessage.flags & Ci.nsMsgMessageFlags.Attachment
    );
  }
}
/* ===== Fundamental Attributes (per GlodaFundAttr.sys.mjs) ===== */

/**
 * Save the synthetic message created in test_attributes_fundamental for the
 *  benefit of test_attributes_fundamental_from_disk.
 */
var fundamentalSyntheticMessage;
var fundamentalFolderHandle;
/**
 * We're saving this one so that we can move the message later and verify that
 * the attributes are consistent.
 */
var fundamentalMsgSet;
var fundamentalGlodaMsgAttachmentUrls;
/**
 * Save the resulting gloda message id corresponding to the
 *  fundamentalSyntheticMessage so we can use it to query the message from disk.
 */
var fundamentalGlodaMessageId;

/**
 * Test that we extract the 'fundamental attributes' of a message properly
 *  'Fundamental' in this case is talking about the attributes defined/extracted
 *  by gloda's GlodaFundAttr.sys.mjs and perhaps the core message indexing logic itself
 *  (which show up as kSpecial* attributes in GlodaFundAttr.sys.mjs anyways.)
 */
async function test_attributes_fundamental() {
  // Create a synthetic message with attachment.
  const smsg = msgGen.makeMessage({
    name: "test message",
    bodyPart: new SyntheticPartMultiMixed([
      new SyntheticPartLeaf({ body: "I like cheese!" }),
      msgGen.makeMessage({ body: { body: "I like wine!" } }), // That's one attachment.
    ]),
    attachments: [
      { filename: "bob.txt", body: "I like bread!" }, // And that's another one.
    ],
  });
  // Save it off for test_attributes_fundamental_from_disk.
  fundamentalSyntheticMessage = smsg;
  const msgSet = new SyntheticMessageSet([smsg]);
  fundamentalMsgSet = msgSet;
  const folder = (fundamentalFolderHandle =
    await messageInjection.makeEmptyFolder());
  await messageInjection.addSetsToFolders([folder], [msgSet]);

  // If we need to go offline, let the indexing pass run, then force us offline.
  if (goOffline) {
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
    await messageInjection.makeFolderAndContentsOffline(folder);
    // Now the next indexer wait will wait for the next indexing pass.
  }

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], {
      verifier: verify_attributes_fundamental,
    })
  );
}

function verify_attributes_fundamental(smsg, gmsg) {
  // Save off the message id for test_attributes_fundamental_from_disk.
  fundamentalGlodaMessageId = gmsg.id;
  if (gmsg.attachmentInfos) {
    fundamentalGlodaMsgAttachmentUrls = gmsg.attachmentInfos.map(
      att => att.url
    );
  } else {
    fundamentalGlodaMsgAttachmentUrls = [];
  }

  Assert.equal(
    gmsg.folderURI,
    messageInjection.getRealInjectionFolder(fundamentalFolderHandle).URI
  );

  // -- Subject
  Assert.equal(smsg.subject, gmsg.conversation.subject);
  Assert.equal(smsg.subject, gmsg.subject);

  // -- Contact/identity information.
  // - From
  // Check the e-mail address.
  Assert.equal(gmsg.from.kind, "email");
  Assert.equal(smsg.fromAddress, gmsg.from.value);
  // Check the name.
  Assert.equal(smsg.fromName, gmsg.from.contact.name);

  // - To
  Assert.equal(smsg.toAddress, gmsg.to[0].value);
  Assert.equal(smsg.toName, gmsg.to[0].contact.name);

  // Date
  Assert.equal(smsg.date.valueOf(), gmsg.date.valueOf());

  // -- Message ID
  Assert.equal(smsg.messageId, gmsg.headerMessageID);

  // -- Attachments. We won't have these if we don't have fulltext results.
  if (expectFulltextResults) {
    Assert.equal(gmsg.attachmentTypes.length, 1);
    Assert.equal(gmsg.attachmentTypes[0], "text/plain");
    Assert.equal(gmsg.attachmentNames.length, 1);
    Assert.equal(gmsg.attachmentNames[0], "bob.txt");

    const expectedInfos = [
      // The name for that one is generated randomly.
      { contentType: "message/rfc822" },
      { name: "bob.txt", contentType: "text/plain" },
    ];
    const expectedSize = 14;
    Assert.equal(gmsg.attachmentInfos.length, 2);
    for (const [i, attInfos] of gmsg.attachmentInfos.entries()) {
      for (const k in expectedInfos[i]) {
        Assert.equal(attInfos[k], expectedInfos[i][k]);
      }
      // Because it's unreliable and depends on the platform.
      Assert.ok(Math.abs(attInfos.size - expectedSize) <= 2);
      // Check that the attachment URLs are correct.
      const channel = NetUtil.newChannel({
        uri: attInfos.url,
        loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        securityFlags:
          Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
      });

      try {
        // Will throw if the URL is invalid.
        channel.asyncOpen(new PromiseTestUtils.PromiseStreamListener());
      } catch (e) {
        do_throw(new Error("Invalid attachment URL"));
      }
    }
  } else {
    // Make sure we don't actually get attachments!
    Assert.equal(gmsg.attachmentTypes, null);
    Assert.equal(gmsg.attachmentNames, null);
  }
}

/**
 * We now move the message into another folder, wait for it to be indexed,
 * and make sure the magic url getter for GlodaAttachment returns a proper
 * URL.
 */
async function test_moved_message_attributes() {
  if (!expectFulltextResults) {
    return;
  }

  // Don't ask me why, let destFolder = MessageInjection.make_empty_folder would result in a
  //  random error when running test_index_messages_imap_offline.js ...
  const [[destFolder], ignoreSet] = await messageInjection.makeFoldersWithSets(
    1,
    [{ count: 2 }]
  );
  fundamentalFolderHandle = destFolder;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([ignoreSet]));

  // This is a fast move (third parameter set to true).
  await messageInjection.moveMessages(fundamentalMsgSet, destFolder, true);

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([fundamentalMsgSet], {
      verifier(newSynMsg, newGlodaMsg) {
        // Verify we still have the same number of attachments.
        Assert.equal(
          fundamentalGlodaMsgAttachmentUrls.length,
          newGlodaMsg.attachmentInfos.length
        );
        for (const [i, attInfos] of newGlodaMsg.attachmentInfos.entries()) {
          // Verify the url has changed.
          Assert.notEqual(fundamentalGlodaMsgAttachmentUrls[i], attInfos.url);
          // And verify that the new url is still valid.
          const channel = NetUtil.newChannel({
            uri: attInfos.url,
            loadingPrincipal:
              Services.scriptSecurityManager.getSystemPrincipal(),
            securityFlags:
              Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
            contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
          });
          try {
            channel.asyncOpen(new PromiseTestUtils.PromiseStreamListener());
          } catch (e) {
            new Error("Invalid attachment URL");
          }
        }
      },
      // IMAP offline-copy fastpath will trigger an indexing (via msgClassified),
      // but local copy won't.
      fullyIndexed: messageInjection.messageInjectionIsLocal() ? 0 : 1,
    })
  );
}

/**
 * We want to make sure that all of the fundamental properties also are there
 *  when we load them from disk.  Nuke our cache, query the message back up.
 *  We previously used getMessagesByMessageID to get the message back, but he
 *  does not perform a full load-out like a query does, so we need to use our
 *  query mechanism for this.
 */
async function test_attributes_fundamental_from_disk() {
  nukeGlodaCachesAndCollections();

  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE).id(
    fundamentalGlodaMessageId
  );
  await queryExpect(
    query,
    [fundamentalSyntheticMessage],
    verify_attributes_fundamental_from_disk,
    function (smsg) {
      return smsg.messageId;
    }
  );
}

/**
 * We are just a wrapper around verify_attributes_fundamental, adapting the
 *  return callback from getMessagesByMessageID.
 *
 * @param aGlodaMessageLists This should be [[theGlodaMessage]].
 */
function verify_attributes_fundamental_from_disk(aGlodaMessage) {
  // Teturn the message id for test_attributes_fundamental_from_disk's benefit.
  verify_attributes_fundamental(fundamentalSyntheticMessage, aGlodaMessage);
  return aGlodaMessage.headerMessageID;
}

/* ===== Explicit Attributes (per GlodaExplicitAttr.sys.mjs) ===== */

/**
 * Test the attributes defined by GlodaExplicitAttr.sys.mjs.
 */
async function test_attributes_explicit() {
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  const gmsg = msgSet.glodaMessages[0];

  // -- Star
  msgSet.setStarred(true);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.starred, true);

  msgSet.setStarred(false);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.starred, false);

  // -- Read / Unread
  msgSet.setRead(true);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.read, true);

  msgSet.setRead(false);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.read, false);

  // -- Tags
  // Note that the tag service does not guarantee stable nsIMsgTag references,
  //  nor does noun_tag go too far out of its way to provide stability.
  //  However, it is stable as long as we don't spook it by bringing new tags
  //  into the equation.
  const tagOne = TagNoun.getTag("$label1");
  const tagTwo = TagNoun.getTag("$label2");

  msgSet.addTag(tagOne.key);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.notEqual(gmsg.tags.indexOf(tagOne), -1);

  msgSet.addTag(tagTwo.key);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.notEqual(gmsg.tags.indexOf(tagOne), -1);
  Assert.notEqual(gmsg.tags.indexOf(tagTwo), -1);

  msgSet.removeTag(tagOne.key);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.tags.indexOf(tagOne), -1);
  Assert.notEqual(gmsg.tags.indexOf(tagTwo), -1);

  msgSet.removeTag(tagTwo.key);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.tags.indexOf(tagOne), -1);
  Assert.equal(gmsg.tags.indexOf(tagTwo), -1);

  // -- Replied To

  // -- Forwarded
}

/**
 * Test non-query-able attributes
 */
async function test_attributes_cant_query() {
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  const gmsg = msgSet.glodaMessages[0];

  // -- Star
  msgSet.setStarred(true);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.starred, true);

  msgSet.setStarred(false);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.starred, false);

  // -- Read / Unread
  msgSet.setRead(true);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.read, true);

  msgSet.setRead(false);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.read, false);

  const readDbAttr = Gloda.getAttrDef(GlodaConstants.BUILT_IN, "read");
  const readId = readDbAttr.id;

  await sqlExpectCount(
    0,
    "SELECT COUNT(*) FROM messageAttributes WHERE attributeID = ?1",
    readId
  );

  // -- Replied To

  // -- Forwarded
}

/**
 * Have the participants be in our addressbook prior to indexing so that we can
 *  verify that the hand-off to the addressbook indexer does not cause breakage.
 */
async function test_people_in_addressbook() {
  var senderPair = msgGen.makeNameAndAddress(),
    recipPair = msgGen.makeNameAndAddress();

  // - Add both people to the address book.
  makeABCardForAddressPair(senderPair);
  makeABCardForAddressPair(recipPair);

  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, to: [recipPair], from: senderPair },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  const gmsg = msgSet.glodaMessages[0],
    senderIdentity = gmsg.from,
    recipIdentity = gmsg.to[0];

  Assert.notEqual(senderIdentity.contact, null);
  Assert.ok(senderIdentity.inAddressBook);

  Assert.notEqual(recipIdentity.contact, null);
  Assert.ok(recipIdentity.inAddressBook);
}

/* ===== Fulltexts Indexing ===== */

/**
 * Make sure that we are using the saneBodySize flag.  This is basically the
 *  test_sane_bodies test from test_mime_emitter but we pull the indexedBodyText
 *  off the message to check and also make sure that the text contents slice
 *  off the end rather than the beginning.
 */
async function test_streamed_bodies_are_size_capped() {
  if (!expectFulltextResults) {
    return;
  }

  let hugeString =
    "qqqqxxxx qqqqxxx qqqqxxx qqqqxxx qqqqxxx qqqqxxx qqqqxxx \r\n";
  const powahsOfTwo = 10;
  for (let i = 0; i < powahsOfTwo; i++) {
    hugeString = hugeString + hugeString;
  }
  const bodyString = "aabb" + hugeString + "xxyy";

  const synMsg = msgGen.makeMessage({
    body: { body: bodyString, contentType: "text/plain" },
  });
  const msgSet = new SyntheticMessageSet([synMsg]);
  const folder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([folder], [msgSet]);

  if (goOffline) {
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
    await messageInjection.makeFolderAndContentsOffline(folder);
  }

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  const gmsg = msgSet.glodaMessages[0];
  Assert.ok(gmsg.indexedBodyText.startsWith("aabb"));
  Assert.ok(!gmsg.indexedBodyText.includes("xxyy"));

  if (gmsg.indexedBodyText.length > 20 * 1024 + 58 + 10) {
    do_throw(
      "Indexed body text is too big! (" + gmsg.indexedBodyText.length + ")"
    );
  }
}

/* ===== Message Deletion ===== */
/**
 * Test actually deleting a message on a per-message basis (not just nuking the
 *  folder like emptying the trash does.)
 *
 * Logic situations:
 * - Non-last message in a conversation, twin.
 * - Non-last message in a conversation, not a twin.
 * - Last message in a conversation
 */
async function test_message_deletion() {
  // Non-last message in conv, twin.
  // Create and index two messages in a conversation.
  const [, convSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 2, msgsPerThread: 2 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([convSet], { augment: true }));

  // Twin the first message in a different folder owing to our reliance on
  //  message-id's in the SyntheticMessageSet logic.  (This is also why we broke
  //  up the indexing waits too.)
  const twinFolder = await messageInjection.makeEmptyFolder();
  const twinSet = new SyntheticMessageSet([convSet.synMessages[0]]);
  await messageInjection.addSetsToFolders([twinFolder], [twinSet]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([twinSet], { augment: true }));

  // Split the conv set into two helper sets.
  const firstSet = convSet.slice(0, 1); // The twinned first message in the thread.
  const secondSet = convSet.slice(1, 2); // The un-twinned second thread message.

  // Make sure we can find the message (paranoia).
  const firstQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  firstQuery.id(firstSet.glodaMessages[0].id);
  let firstColl = await queryExpect(firstQuery, firstSet);

  // Delete it (not trash! delete!).
  await MessageInjection.deleteMessages(firstSet);
  // Which should result in an apparent deletion.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [firstSet] }));
  // And our collection from that query should now be empty.
  Assert.equal(firstColl.items.length, 0);

  // Make sure it no longer shows up in a standard query.
  firstColl = await queryExpect(firstQuery, []);

  // Make sure it shows up in a privileged query.
  let privQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  const firstGlodaId = firstSet.glodaMessages[0].id;
  privQuery.id(firstGlodaId);
  await queryExpect(privQuery, firstSet);

  // Force a deletion pass.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // Make sure it no longer shows up in a privileged query; since it has a twin
  //  we don't need to leave it as a ghost.
  await queryExpect(privQuery, []);

  // Make sure that the messagesText entry got blown away.
  await sqlExpectCount(
    0,
    "SELECT COUNT(*) FROM messagesText WHERE docid = ?1",
    firstGlodaId
  );

  // Make sure the conversation still exists.
  const conv = twinSet.glodaMessages[0].conversation;
  const convQuery = Gloda.newQuery(GlodaConstants.NOUN_CONVERSATION);
  convQuery.id(conv.id);
  const convColl = await queryExpect(convQuery, [conv]);

  // -- Non-last message, no longer a twin => ghost.

  // Make sure nuking the twin didn't somehow kill them both.
  const twinQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  // Let's search on the message-id now that there is no ambiguity.
  twinQuery.headerMessageID(twinSet.synMessages[0].messageId);
  let twinColl = await queryExpect(twinQuery, twinSet);

  // Delete the twin.
  await MessageInjection.deleteMessages(twinSet);
  // Which should result in an apparent deletion.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [twinSet] }));
  // It should disappear from the collection.
  Assert.equal(twinColl.items.length, 0);

  // No longer show up in the standard query.
  twinColl = await queryExpect(twinQuery, []);

  // Still show up in a privileged query.
  privQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  privQuery.headerMessageID(twinSet.synMessages[0].messageId);
  await queryExpect(privQuery, twinSet);

  // Force a deletion pass.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // The message should be marked as a ghost now that the deletion pass.
  // Ghosts have no fulltext rows, so check for that.
  await sqlExpectCount(
    0,
    "SELECT COUNT(*) FROM messagesText WHERE docid = ?1",
    twinSet.glodaMessages[0].id
  );

  // It still should show up in the privileged query; it's a ghost!
  const privColl = await queryExpect(privQuery, twinSet);
  // Make sure it looks like a ghost.
  const twinGhost = privColl.items[0];
  Assert.equal(twinGhost._folderID, null);
  Assert.equal(twinGhost._messageKey, null);

  // Make sure the conversation still exists.
  await queryExpect(convQuery, [conv]);

  // -- Non-last message, not a twin.
  // This should blow away the message, the ghosts, and the conversation.

  // Second message should still be around.
  const secondQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  secondQuery.headerMessageID(secondSet.synMessages[0].messageId);
  const secondColl = await queryExpect(secondQuery, secondSet);

  // Delete it and make sure it gets marked deleted appropriately.
  await MessageInjection.deleteMessages(secondSet);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [secondSet] }));
  Assert.equal(secondColl.items.length, 0);

  // Still show up in a privileged query.
  privQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  privQuery.headerMessageID(secondSet.synMessages[0].messageId);
  await queryExpect(privQuery, secondSet);

  // Force a deletion pass.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // It should no longer show up in a privileged query; we killed the ghosts.
  await queryExpect(privQuery, []);

  // - The conversation should have disappeared too.
  // (we have no listener to watch for it to have disappeared from convQuery but
  //  this is basically how glodaTestHelper does its thing anyways.)
  Assert.equal(convColl.items.length, 0);

  // Make sure the query fails to find it too.
  await queryExpect(convQuery, []);

  // -- Identity culling verification.
  // The identities associated with that message should no longer exist, nor
  //  should their contacts.
}

async function test_moving_to_trash_marks_deletion() {
  // Create and index two messages in a conversation.
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 2, msgsPerThread: 2 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  const convId = msgSet.glodaMessages[0].conversation.id;
  const firstGlodaId = msgSet.glodaMessages[0].id;
  const secondGlodaId = msgSet.glodaMessages[1].id;

  // Move them to the trash.
  await messageInjection.trashMessages(msgSet);

  // We do not index the trash folder so this should actually make them appear
  //  deleted to an unprivileged query.
  const msgQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  msgQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgQuery, []);

  // They will appear deleted after the events.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [msgSet] }));

  // Force a sweep.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  // There should be no apparent change as the result of this pass.
  // Well, the conversation will die, but we can't see that.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // The conversation should be gone.
  const convQuery = Gloda.newQuery(GlodaConstants.NOUN_CONVERSATION);
  convQuery.id(convId);
  await queryExpect(convQuery, []);

  // The messages should be entirely gone.
  const msgPrivQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  msgPrivQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgPrivQuery, []);
}

/**
 * Deletion that occurs because a folder got deleted.
 *  There is no hand-holding involving the headers that were in the folder.
 */
async function test_folder_nuking_message_deletion() {
  // Create and index two messages in a conversation.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 2, msgsPerThread: 2 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  const convId = msgSet.glodaMessages[0].conversation.id;
  const firstGlodaId = msgSet.glodaMessages[0].id;
  const secondGlodaId = msgSet.glodaMessages[1].id;

  // Delete the folder.
  messageInjection.deleteFolder(folder);
  // That does generate the deletion events if the messages were in-memory,
  //  which these are.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [msgSet] }));

  // This should have caused us to mark all the messages as deleted; the
  //  messages should no longer show up in an unprivileged query.
  const msgQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  msgQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgQuery, []);

  // Force a sweep.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  // There should be no apparent change as the result of this pass.
  // Well, the conversation will die, but we can't see that.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // The conversation should be gone.
  const convQuery = Gloda.newQuery(GlodaConstants.NOUN_CONVERSATION);
  convQuery.id(convId);
  await queryExpect(convQuery, []);

  // The messages should be entirely gone.
  const msgPrivQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  msgPrivQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgPrivQuery, []);
}

/* ===== Folder Move/Rename/Copy (Single and Nested) ===== */

async function test_folder_deletion_nested() {
  // Add a folder with a bunch of messages.
  const [[folder1], msgSet1] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  const [[folder2], msgSet2] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  // Index these folders, and augment the msgSet with the glodaMessages array
  //  for later use by sqlExpectCount.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet1, msgSet2], { augment: true })
  );
  // The move has to be performed after the indexing, because otherwise, on
  //  IMAP, the moved message header are different entities and it's not msgSet2
  //  that ends up indexed, but the fresh headers
  await MessageInjection.moveFolder(folder2, folder1);

  // Add a trash folder, and move folder1 into it.
  const trash = await messageInjection.makeEmptyFolder(null, [
    Ci.nsMsgFolderFlags.Trash,
  ]);
  await MessageInjection.moveFolder(folder1, trash);

  const folders = MessageInjection.get_nsIMsgFolder(trash).descendants;
  Assert.equal(folders.length, 2);
  const [newFolder1, newFolder2] = folders;

  const glodaFolder1 = Gloda.getFolderForFolder(newFolder1);
  const glodaFolder2 = Gloda.getFolderForFolder(newFolder2);

  // Verify that Gloda properly marked this folder as not to be indexed anymore.
  Assert.equal(
    glodaFolder1.indexingPriority,
    glodaFolder1.kIndexingNeverPriority
  );

  // Check that existing message is marked as deleted.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], { deleted: [msgSet1, msgSet2] })
  );

  // Make sure the deletion hit the database.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) from folderLocations WHERE id = ? AND indexingPriority = ?",
    glodaFolder1.id,
    glodaFolder1.kIndexingNeverPriority
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) from folderLocations WHERE id = ? AND indexingPriority = ?",
    glodaFolder2.id,
    glodaFolder2.kIndexingNeverPriority
  );

  if (messageInjection.messageInjectionIsLocal()) {
    // Add another message.
    await messageInjection.makeNewSetsInFolders([newFolder1], [{ count: 1 }]);
    await messageInjection.makeNewSetsInFolders([newFolder2], [{ count: 1 }]);

    // Make sure that indexing returns nothing.
    GlodaMsgIndexer.indexingSweepNeeded = true;
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([]));
  }
}

/* ===== IMAP Nuances ===== */

/**
 * Verify that for IMAP folders we still see an index a message that is added
 *  as read.
 */
async function test_imap_add_unread_to_folder() {
  if (messageInjection.messageInjectionIsLocal()) {
    return;
  }

  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, read: true },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
}

/* ===== Message Moving ===== */

/**
 * Moving a message between folders should result in us knowing that the message
 *  is in the target location.
 */
async function test_message_moving() {
  // - Inject and insert.
  // Source folder with the message we care about.
  const [[srcFolder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  // Dest folder with some messages in it to test some wacky local folder moving
  //  logic.  (Local moves try and update the correspondence immediately.)
  const [[destFolder], ignoreSet] = await messageInjection.makeFoldersWithSets(
    1,
    [{ count: 2 }]
  );

  // We want the gloda message mapping.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet, ignoreSet], { augment: true })
  );
  const gmsg = msgSet.glodaMessages[0];
  // Save off the message key so we can make sure it changes.
  const oldMessageKey = msgSet.getMsgHdr(0).messageKey;

  // - Fastpath (offline) move it to a new folder.
  // Initial move.
  await messageInjection.moveMessages(msgSet, destFolder, true);

  // - Make sure gloda sees it in the new folder.
  // IMAP offline-copy fastpath will trigger an indexing (via msgClassified),
  // but local copy won't.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], {
      fullyIndexed: messageInjection.messageInjectionIsLocal() ? 0 : 1,
    })
  );

  Assert.equal(
    gmsg.folderURI,
    messageInjection.getRealInjectionFolder(destFolder).URI
  );

  // - Make sure the message key is correct!
  Assert.equal(gmsg.messageKey, msgSet.getMsgHdr(0).messageKey);
  // Sanity check that the messageKey actually changed for the message.
  Assert.notEqual(gmsg.messageKey, oldMessageKey);

  // - Make sure the indexer's _keyChangedBatchInfo dict is empty.
  for (const evilKey in GlodaMsgIndexer._keyChangedBatchInfo) {
    const evilValue = GlodaMsgIndexer._keyChangedBatchInfo[evilKey];
    throw new Error(
      "GlodaMsgIndexer._keyChangedBatchInfo should be empty but" +
        "has key:\n" +
        evilKey +
        "\nAnd value:\n",
      evilValue + "."
    );
  }

  // - Slowpath (IMAP online) move it back to its origin folder.
  // Move it back.
  await messageInjection.moveMessages(msgSet, srcFolder, false);
  // In the IMAP case we will end up reindexing the message because we will
  //  not be able to fast-path, but the local case will still be fast-pathed.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], {
      fullyIndexed: messageInjection.messageInjectionIsLocal() ? 0 : 1,
    })
  );
  Assert.equal(
    gmsg.folderURI,
    messageInjection.getRealInjectionFolder(srcFolder).URI
  );
  Assert.equal(gmsg.messageKey, msgSet.getMsgHdr(0).messageKey);
}

/**
 * Moving a gloda-indexed message out of a filthy folder should result in the
 *  destination message not having a gloda-id.
 */

/* ===== Message Copying ===== */

/* ===== Sweep Complications ==== */

/**
 * Make sure that a message indexed by event-driven indexing does not
 *  get reindexed by sweep indexing that follows.
 */
async function test_sweep_indexing_does_not_reindex_event_indexed() {
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  // Wait for the event sweep to complete.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));

  // Force a sweep of the folder.
  GlodaMsgIndexer.indexFolder(messageInjection.getRealInjectionFolder(folder));
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
}

/**
 * Verify that moving apparently gloda-indexed messages from a filthy folder or
 *  one that simply should not be gloda indexed does not result in the target
 *  messages having the gloda-id property on them.  To avoid messing with too
 *  many invariants we do the 'folder should not be gloda indexed' case.
 * Uh, and of course, the message should still get indexed once we clear the
 *  filthy gloda-id off of it given that it is moving from a folder that is not
 *  indexed to one that is indexed.
 */
async function test_filthy_moves_slash_move_from_unindexed_to_indexed() {
  // - Inject.
  // The source folder needs a flag so we don't index it.
  const srcFolder = await messageInjection.makeEmptyFolder(null, [
    Ci.nsMsgFolderFlags.Junk,
  ]);
  // The destination folder has to be something we want to index though.
  const destFolder = await messageInjection.makeEmptyFolder();
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [srcFolder],
    [{ count: 1 }]
  );

  // - Mark with a bogus gloda-id.
  msgSet.getMsgHdr(0).setUint32Property("gloda-id", 9999);

  // - Disable event driven indexing so we don't get interference from indexing.
  configureGlodaIndexing({ event: false });

  // - Move.
  await messageInjection.moveMessages(msgSet, destFolder);

  // - Verify the target has no gloda-id!
  dump(`checking  ${msgSet.getMsgHdr(0)}`);
  Assert.equal(msgSet.getMsgHdr(0).getUint32Property("gloda-id"), 0);

  // - Re-enable indexing and let the indexer run.
  // We don't want to affect other tests.
  configureGlodaIndexing({});
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
}

function test_sanity_test_environment() {
  Assert.ok(msgGen, "Sanity that msgGen is set.");
  Assert.ok(scenarios, "Sanity that scenarios is set");
  Assert.ok(messageInjection, "Sanity that messageInjection is set.");
}

var base_index_messages_tests = [
  test_sanity_test_environment,
  test_pending_commit_tracker_flushes_correctly,
  test_pending_commit_causes_msgdb_commit,
  test_indexing_sweep,
  test_event_driven_indexing_does_not_mess_with_filthy_folders,

  test_threading_direct_reply,
  test_threading_missing_intermediary,
  test_threading_siblings_missing_parent,
  test_attachment_flag,
  test_attributes_fundamental,
  test_moved_message_attributes,
  test_attributes_fundamental_from_disk,
  test_attributes_explicit,
  test_attributes_cant_query,

  test_people_in_addressbook,

  test_streamed_bodies_are_size_capped,

  test_imap_add_unread_to_folder,
  test_message_moving,

  test_message_deletion,
  test_moving_to_trash_marks_deletion,
  test_folder_nuking_message_deletion,

  test_sweep_indexing_does_not_reindex_event_indexed,

  test_filthy_moves_slash_move_from_unindexed_to_indexed,

  test_indexing_never_priority,
  test_setting_indexing_priority_never_while_indexing,

  test_folder_deletion_nested,
];
