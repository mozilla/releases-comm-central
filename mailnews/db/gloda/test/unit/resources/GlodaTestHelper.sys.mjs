/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides gloda testing infrastructure.
 *
 * A few words about how tests should expect to interact with indexing:
 *
 * By default, we enable only event-driven indexing with an infinite work queue
 *  length.  This means that all messages will be queued for indexing as they
 *  are added or modified.  You should await to |waitForGlodaIndexer| to wait
 *  until the indexer completes.  If you want to assert that certain messages
 *  will have been indexed during that pass, you can pass them as arguments to
 *  |assertExpectedMessagesIndexed|.
 * There is no need to tell us to expect the messages to be indexed prior to the
 *  waiting as long as nothing spins the event loop after you perform the action
 *  that triggers indexing.  None of our existing xpcshell tests do this, but it
 *  is part of the mozmill idiom for its waiting mechanism, so be sure to not
 *  perform a mozmill wait without first telling us to expect the messages.
 */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import { Gloda } from "resource:///modules/gloda/GlodaPublic.sys.mjs";
import { GlodaCollectionManager } from "resource:///modules/gloda/Collection.sys.mjs";
import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";
import { GlodaIndexer } from "resource:///modules/gloda/GlodaIndexer.sys.mjs";
import { GlodaMsgIndexer } from "resource:///modules/gloda/IndexMsg.sys.mjs";

var log = console.createInstance({
  prefix: "gloda.testHelper",
  maxLogLevel: "Warn",
  maxLogLevelPref: "gloda.loglevel",
});

var indexMessageState;

/**
 * Create a 'me' identity of "me@localhost" for the benefit of Gloda.  At the
 *  time of this writing, Gloda only initializes Gloda.myIdentities and
 *  Gloda.myContact at startup with no event-driven updates.  As such, this
 *  function needs to be called prior to gloda startup.
 */
function createMeIdentity() {
  const identity = MailServices.accounts.createIdentity;
  identity.email = "me@localhost";
  identity.fullName = "Me";
}
// And run it now.
createMeIdentity();

// Set the gloda prefs.
// "yes" to indexing.
Services.prefs.setBoolPref("mailnews.database.global.indexer.enabled", true);
// "no" to a sweep we don't control.
Services.prefs.setBoolPref(
  "mailnews.database.global.indexer.perform_initial_sweep",
  false
);

var ENVIRON_MAPPINGS = [
  {
    envVar: "GLODA_DATASTORE_EXPLAIN_TO_PATH",
    prefName: "mailnews.database.global.datastore.explainToPath",
  },
];

// Propagate environment variables to prefs as appropriate:
for (const { envVar, prefName } of ENVIRON_MAPPINGS) {
  if (Services.env.exists(envVar)) {
    Services.prefs.setCharPref(prefName, Services.env.get(envVar));
  }
}

/**
 * Side note:
 *  Keep them in the global scope so that a Cu.forceGC() call won't purge them.
 */
var collectionListener;

/**
 * Registers MessageInjection listeners and Gloda listeners for our tests.
 *
 * @param {MessageInjection} messageInjection Instance of MessageInjection
 *                                            to register Events to.
 */
export function glodaTestHelperInitialize(messageInjection) {
  // Initialize the message state if we are dealing with messages.  At some
  //  point we probably want to just completely generalize the indexing state.
  //  That point is likely when our testing infrastructure needs the support
  //  provided by `indexMessageState` for things other than messages.
  indexMessageState = new IndexMessageState();

  collectionListener = new GlodaCollectionListener();
  new TestAttributeProvider();
  new MsgsClassifiedListener();

  // Add a hook that makes folders not filthy when we first see them.
  messageInjection.registerMessageInjectionListener({
    /**
     * By default all folders start out filthy.  This is great in the real world
     *  but I went and wrote all the unit tests without entirely thinking about
     *  how this affected said unit tests.  So we add a listener so that we can
     *  force the folders to be clean.
     * This is okay and safe because messageInjection always creates the folders
     *  without any messages in them.
     */
    onRealFolderCreated(aRealFolder) {
      log.debug(
        `onRealFolderCreated through MessageInjection received. ` +
          `Make folder: ${aRealFolder.name} clean for Gloda.`
      );
      const glodaFolder = Gloda.getFolderForFolder(aRealFolder);
      glodaFolder._downgradeDirtyStatus(glodaFolder.kFolderClean);
    },

    /**
     * Make waitForGlodaIndexer know that it should wait for a msgsClassified
     *  event whenever messages have been injected, at least if event-driven
     *  indexing is enabled.
     */
    onInjectingMessages() {
      log.debug(
        "onInjectingMessages through MessageInjection received. Pushing to intrestestingEvents."
      );
      indexMessageState.interestingEvents.push("msgsClassified");
    },

    /**
     * This basically translates to "we are triggering an IMAP move" and has
     *  the ramification that we should expect a msgsClassified event because
     *  the destination will see the header get added at some point.
     */
    onMovingMessagesWithoutDestHeaders() {
      log.debug(
        "onMovingMessagesWithoutDestHeaders through MessageInjection received. Pushing to intrestestingEvents."
      );
      indexMessageState.interestingEvents.push("msgsClassified");
    },
  });
  log.debug("glodaTestHelperInitialize finished.");
}

class IndexMessageState {
  data = new GlodaIndexerData();

  constructor() {
    prepareIndexerForTesting();
    // Continue the preparing by assigning the hook recover and hook cleanup.
    GlodaIndexer._unitTestHookRecover = this._testHookRecover;
    GlodaIndexer._unitTestHookCleanup = this._testHookCleanup;
  }

  resetData() {
    this.data = new GlodaIndexerData();
  }

  // The synthetic message sets passed in to |assertExpectedMessagesIndexed|.
  synMessageSets = [];
  // The user-specified accumulate-style verification function.
  verifier() {
    return this.data.data.verifier;
  }
  // Should we augment the synthetic sets with gloda message info?
  augmentSynSets() {
    return this.data.data.augment;
  }
  deletionSynSets() {
    return this.data.data.deleted;
  }

  // Expected value of |_workerRecoveredCount| at assertion time.
  expectedWorkerRecoveredCount() {
    return this.data.data.recovered;
  }
  // Expected value of |_workerFailedToRecoverCount| at assertion time.
  expectedFailedToRecoverCount() {
    return this.data.data.failedToRecover;
  }
  // Expected value of |_workerCleanedUpCount| at assertion time.
  expectedCleanedUpCount() {
    return this.data.data.cleanedUp;
  }
  // Expected value of |_workerHadNoCleanUpCount| at assertion time.
  expectedHadNoCleanUpCount() {
    return this.data.data.hadNoCleanUp;
  }
  /**
   * The number of messages that were fully (re)indexed using
   *  Gloda.grokNounItem.
   */
  _numFullIndexed = 0;
  // Expected value of |_numFullIndexed| at assertion time.
  expectedNumFullIndexed() {
    return this.data.data.fullyIndexed;
  }

  // The number of times a worker had a recover helper and it recovered.
  _workerRecoveredCount = 0;
  // The number of times a worker had a recover helper and it did not recover.
  _workerFailedToRecoverCount = 0;
  // The number of times a worker had a cleanup helper and it cleaned up.
  _workerCleanedUpCount = 0;
  // The number of times a worker had no cleanup helper but there was a cleanup.
  _workerHadNoCleanUpCount = 0;

  /**
   * Beware this scoping for this class is lost where _testHookRecover is used.
   *
   * @param aRecoverResult
   * @param aOriginEx
   * @param aActiveJob
   * @param aCallbackHandle
   */
  _testHookRecover(aRecoverResult, aOriginEx, aActiveJob, aCallbackHandle) {
    log.debug(
      "indexer recovery hook fired" +
        "\nrecover result:\n" +
        aRecoverResult +
        "\noriginating exception:\n" +
        aOriginEx +
        "\nactive job:\n" +
        aActiveJob +
        "\ncallbackHandle:\n" +
        indexMessageState._jsonifyCallbackHandleState(aCallbackHandle)
    );
    if (aRecoverResult) {
      indexMessageState._workerRecoveredCount++;
    } else {
      indexMessageState._workerFailedToRecoverCount++;
    }
  }

  /**
   * Beware this scoping for this class is lost where _testHookCleanup is used.
   *
   * @param aHadCleanupFunc
   * @param aOriginEx
   * @param aActiveJob
   * @param aCallbackHandle
   */
  _testHookCleanup(aHadCleanupFunc, aOriginEx, aActiveJob, aCallbackHandle) {
    log.debug(
      "indexer cleanup hook fired" +
        "\nhad cleanup?\n" +
        aHadCleanupFunc +
        "\noriginating exception:\n" +
        aOriginEx +
        "\nactive job:\n" +
        aActiveJob +
        "\ncallbackHandle\n" +
        indexMessageState._jsonifyCallbackHandleState(aCallbackHandle)
    );
    if (aHadCleanupFunc) {
      indexMessageState._workerCleanedUpCount++;
    } else {
      indexMessageState._workerHadNoCleanUpCount++;
    }
  }
  _jsonifyCallbackHandleState(aCallbackHandle) {
    return {
      _stringRep: aCallbackHandle.activeStack.length + " active generators",
      activeStackLength: aCallbackHandle.activeStack.length,
      contextStack: aCallbackHandle.contextStack,
    };
  }

  /**
   * The gloda messages indexed since the last call to |waitForGlodaIndexer|.
   */
  _glodaMessagesByMessageId = [];
  _glodaDeletionsByMessageId = [];

  _numItemsAdded = 0;

  applyGlodaIndexerData(data) {
    this.data.applyData(data);
  }

  /**
   * A list of events that we need to see before we allow ourselves to perform
   *  the indexer check.  For example, if "msgsClassified" is in here, it means
   *  that whether the indexer is active or not is irrelevant until we have
   *  seen that msgsClassified event.
   */
  interestingEvents = [];
}

export function prepareIndexerForTesting() {
  if (!GlodaIndexer.enabled) {
    throw new Error(
      "The gloda indexer is somehow not enabled. This is problematic."
    );
  }
  // Make the indexer be more verbose about indexing for us.
  GlodaIndexer._unitTestSuperVerbose = true;
  GlodaMsgIndexer._unitTestSuperVerbose = true;
  // Lobotomize the adaptive indexer.
  // The indexer doesn't need to worry about load; zero his rescheduling time.
  GlodaIndexer._INDEX_INTERVAL = 0;
  // The indexer already registered for the idle service; we must remove this
  //  or "idle" notifications will still get sent via the observer mechanism.
  const realIdleService = GlodaIndexer._idleService;
  realIdleService.removeIdleObserver(
    GlodaIndexer,
    GlodaIndexer._indexIdleThresholdSecs
  );
  // Pretend we are always idle.
  GlodaIndexer._idleService = {
    idleTime: 1000,
    addIdleObserver() {
      // There is no actual need to register with the idle observer, and if
      //  we do, the stupid "idle" notification will trigger commits.
    },
    removeIdleObserver() {},
  };
  // We want the event-driven indexer to always handle indexing and never spill
  //  to an indexing sweep unless a test intentionally does so.
  GlodaIndexer._indexMaxEventQueueMessages = 10000;
  // Lobotomize the adaptive indexer's constants.
  GlodaIndexer._cpuTargetIndexTime = 10000000;
  GlodaIndexer._CPU_TARGET_INDEX_TIME_ACTIVE = 10000000;
  GlodaIndexer._CPU_TARGET_INDEX_TIME_IDLE = 10000000;
  GlodaIndexer._CPU_IS_BUSY_TIME = 10000000;
  GlodaIndexer._PAUSE_LATE_IS_BUSY_TIME = 10000000;

  delete GlodaIndexer._indexTokens;
  GlodaIndexer.__defineGetter__("_indexTokens", function () {
    return GlodaIndexer._CPU_MAX_TOKENS_PER_BATCH;
  });
  GlodaIndexer.__defineSetter__("_indexTokens", function () {});

  // This includes making commits only happen when we the unit tests explicitly
  //  tell them to.
  GlodaIndexer._MINIMUM_COMMIT_TIME = 10000000;
  GlodaIndexer._MAXIMUM_COMMIT_TIME = 10000000;
}

class GlodaIndexerData {
  data = {
    verifier: null,
    augment: false,
    deleted: [],
    fullyIndexed: null,

    // Things should not be recovering or failing and cleaning up unless the test
    //  is expecting it.
    recovered: 0,
    failedToRecover: 0,
    cleanedUp: 0,
    hadNoCleanUp: 0,
  };

  /**
   * Applies data shallow.
   * Only the first level of keys are applied and replaced complete
   *  if given via param data. No deep merge.
   *
   * @param {*} data
   */
  applyData(data) {
    this.data = {
      ...this.data,
      ...data,
    };
  }
}

/**
 * Note that if the indexer is not currently active we assume it has already
 *  completed; we do not entertain the possibility that it has not yet started.
 *  Since the indexer is 'active' as soon as it sees an event, this does mean
 *  that you need to wait to make sure the indexing event has happened before
 *  calling us.  This is reasonable.
 */
export async function waitForGlodaIndexer() {
  const eventsPending = TestUtils.waitForCondition(() => {
    if (indexMessageState.interestingEvents.length > 1) {
      // Events still pending. See msgClassified event and
      //  messageInjection.registerMessageInjectionListener.
      return false;
    }
    // Events finished.
    return true;
  });
  const indexerRunning = TestUtils.waitForCondition(() => {
    if (GlodaIndexer.indexing) {
      // Still indexing.
      return false;
    }
    // Indexing finished.
    return true;
  });

  log.debug(
    "waitForGlodaIndexer waiting for intrestingEvents and GlodaIndexer.indexing."
  );

  // If we are waiting on certain events to occur first, block on those.
  await Promise.all([eventsPending, indexerRunning]);
}

/**
 * Each time a msgClassified Event is fired and it is present
 * in IndexMessageState.interestingEvents it will be removed.
 */
class MsgsClassifiedListener {
  /**
   * Events pending for the tests.
   * (we want this to happen after gloda registers its own listener, and it
   *  does.)
   */
  constructor() {
    MailServices.mfn.addListener(
      this,
      Ci.nsIMsgFolderNotificationService.msgsClassified
    );
  }
  /**
   * If this was an expected interesting event, remove it from the list.
   * If an event happens that we did not expect, it does not matter.  We know
   *  this because we add events we care about to interestingEvents before they
   *  can possibly be fired.
   */
  msgsClassified() {
    log.debug("MsgsClassifiedListener msgsClassified received.");
    const idx = indexMessageState.interestingEvents.indexOf("msgsClassified");
    if (idx != -1) {
      log.debug("Remove intrestingEvent through msgsClassified.");
      // Remove the interesting Event as we received it here.
      indexMessageState.interestingEvents.splice(idx, 1);
    }
  }
}

/**
 * This AttributeProvider helps us testing Gloda.
 * With the `process` method the Collections will be noticed
 * through listeners.
 * (onItemsAdded, onItemsModified, onItemsRemoved, onQueryComplete)
 */
class TestAttributeProvider {
  providerName = "glodaTestHelper:fakeProvider";
  constructor() {
    // Register us with gloda as an attribute provider so that we can
    //  distinguish between fully reindexed messages and fastpath indexed
    //  messages.
    Gloda._attrProviderOrderByNoun[GlodaConstants.NOUN_MESSAGE].push({
      providerName: this.providerName,
      process: this.process,
    });
  }
  /**
   * Fake attribute provider processing function so we can distinguish
   *  between fully reindexed messages and fast-path modified messages.
   * Process has to be invoked for the GlodaCollectionListener
   */
  *process() {
    indexMessageState._numFullIndexed++;

    yield GlodaConstants.kWorkDone;
  }
}

/**
 * This class tracks a GlodaCollection (created by Gloda._wildcardCollection).
 * The listeners for this collection which will notify our IndexMessageState
 * are defined here.
 */
class GlodaCollectionListener {
  // Our catch-all message collection that nets us all messages passing by.
  catchAllCollection = null;
  constructor() {
    this.catchAllCollection = Gloda._wildcardCollection(
      GlodaConstants.NOUN_MESSAGE
    );
    this.catchAllCollection.listener = this;
  }
  /*
   * Our catch-all collection listener.  Any time a new message gets indexed,
   *  we should receive an onItemsAdded call.  Any time an existing message
   *  gets reindexed, we should receive an onItemsModified call.  Any time an
   *  existing message actually gets purged from the system, we should receive
   *  an onItemsRemoved call.
   */
  onItemsAdded(aItems) {
    log.debug("GlodaCollectionListener onItemsAdded received.");
    for (const item of aItems) {
      if (item.headerMessageID in indexMessageState._glodaMessagesByMessageId) {
        throw new Error(
          "Gloda message" +
            item.folderMessage +
            "already indexed once since the last waitForGlodaIndexer call!"
        );
      }
      log.debug(
        "GlodaCollectionListener save item to indexMessageState._glodaMessagesByMessageId."
      );
      indexMessageState._glodaMessagesByMessageId[item.headerMessageID] = item;
    }

    // Simulate some other activity clearing out the the current folder's
    // cached database, which used to kill the indexer's enumerator.
    if (++indexMessageState._numItemsAdded == 3) {
      log.debug("GlodaCollectionListener simulate other activity.");
      GlodaMsgIndexer._indexingFolder.msgDatabase = null;
    }
  }

  onItemsModified(aItems) {
    log.debug("GlodaCollectionListener onItemsModified received.");
    for (const item of aItems) {
      if (item.headerMessageID in indexMessageState._glodaMessagesByMessageId) {
        throw new Error(
          "Gloda message" +
            item +
            "already indexed once since the last waitForGlodaIndexer call!"
        );
      }
      log.debug(
        "GlodaCollectionListener save item to indexMessageState._glodaMessagesByMessageId."
      );
      indexMessageState._glodaMessagesByMessageId[item.headerMessageID] = item;
    }
  }

  onItemsRemoved(aItems) {
    log.debug("GlodaCollectionListener onItemsRemoved received.");
    for (const item of aItems) {
      if (
        item.headerMessageID in indexMessageState._glodaDeletionsByMessageId
      ) {
        throw new Error(
          "Gloda message " +
            item +
            "already deleted once since the last waitForGlodaIndexer call!"
        );
      }
      log.debug(
        "GlodaCollectionListener save item to indexMessageState._glodaDeletionsByMessageId."
      );
      indexMessageState._glodaDeletionsByMessageId[item.headerMessageID] = item;
    }
  }
  onQueryComplete() {
    log.debug(
      "GlodaCollectionListener onQueryComplete received. Nothing done."
    );
  }
}

/**
 * Assert that the set of messages indexed is exactly the set passed in.
 *  If a verification function is provided, use it on a per-message basis
 *  to make sure the resulting gloda message looks like it should given the
 *  synthetic message.
 *
 * Throws Errors if something is not according and returns always [true, string]
 * for `Assert.ok` in your tests. This ensures proper testing output.
 *
 * @param {SyntheticMessage[]} aSynMessageSets A list of SyntheticMessageSets
 *     containing exactly the messages we should expect to see.
 * @param [aConfig.verifier] The function to call to verify that the indexing
 *     had the desired result.  Takes arguments aSynthMessage (the synthetic
 *     message just indexed), aGlodaMessage (the gloda message representation of
 *     the indexed message), and aPreviousResult (the value last returned by the
 *     verifier function for this given set of messages, or undefined if it is
 *     the first message.)
 * @param [aConfig.augment=false] Should we augment the synthetic message sets
 *     with references to their corresponding gloda messages?  The messages
 *     will show up in a 'glodaMessages' list on the syn set.
 * @param {SyntheticMessageSet[]} [aConfig.deleted] A list of SyntheticMessageSets
 *     containing messages that should be recognized as deleted by the gloda
 *     indexer in this pass.
 * @param [aConfig.fullyIndexed] A count of the number of messages we expect
 *     to observe being fully indexed.  This is relevant because in the case
 *     of message moves, gloda may generate an onItemsModified notification but
 *     not reindex the message.  This attribute allows the tests to distinguish
 *     between the two cases.
 * @returns {[true, string]}
 */
export function assertExpectedMessagesIndexed(aSynMessageSets, aConfig) {
  indexMessageState.synMessageSets = aSynMessageSets;

  indexMessageState.applyGlodaIndexerData(aConfig);

  // Check that we have a gloda message for every syn message and verify.
  for (const msgSet of indexMessageState.synMessageSets) {
    if (indexMessageState.augmentSynSets()) {
      msgSet.glodaMessages = [];
    }
    for (const [iSynMsg, synMsg] of msgSet.synMessages.entries()) {
      if (!(synMsg.messageId in indexMessageState._glodaMessagesByMessageId)) {
        const msgHdr = msgSet.getMsgHdr(iSynMsg);
        throw new Error(
          "Header " +
            msgHdr.messageId +
            " in folder: " +
            (msgHdr ? msgHdr.folder.name : "no header?") +
            " should have been indexed."
        );
      }

      const glodaMsg =
        indexMessageState._glodaMessagesByMessageId[synMsg.messageId];
      if (indexMessageState.augmentSynSets()) {
        msgSet.glodaMessages.push(glodaMsg);
      }

      indexMessageState._glodaMessagesByMessageId[synMsg.messageId] = null;

      const verifier = indexMessageState.verifier();
      let previousValue = undefined;
      if (verifier) {
        try {
          // Looking if a previous value have been present.
          previousValue = verifier(synMsg, glodaMsg, previousValue);
        } catch (ex) {
          throw new Error(
            "Verification failure: " +
              synMsg +
              " is not close enough to " +
              glodaMsg +
              "; basing this on exception: " +
              ex
          );
        }
      }
    }
  }

  // Check that we don't have any extra gloda messages. (lacking syn msgs)
  for (const messageId in indexMessageState._glodaMessagesByMessageId) {
    const glodaMsg = indexMessageState._glodaMessagesByMessageId[messageId];
    if (glodaMsg != null) {
      throw new Error(
        "Gloda message:\n" +
          glodaMsg +
          "\nShould not have been indexed.\n" +
          "Source header:\n" +
          glodaMsg.folderMessage
      );
    }
  }

  if (indexMessageState.deletionSynSets()) {
    for (const msgSet of indexMessageState.deletionSynSets()) {
      for (const synMsg of msgSet.synMessages) {
        if (
          !(synMsg.messageId in indexMessageState._glodaDeletionsByMessageId)
        ) {
          throw new Error(
            "Synthetic message " + synMsg + " did not get deleted!"
          );
        }

        indexMessageState._glodaDeletionsByMessageId[synMsg.messageId] = null;
      }
    }
  }

  // Check that we don't have unexpected deletions.
  for (const messageId in indexMessageState._glodaDeletionsByMessageId) {
    const glodaMsg = indexMessageState._glodaDeletionsByMessageId[messageId];
    if (glodaMsg != null) {
      throw new Error(
        "Gloda message with message id " +
          messageId +
          " was " +
          "unexpectedly deleted!"
      );
    }
  }

  if (
    indexMessageState.expectedWorkerRecoveredCount() != null &&
    indexMessageState.expectedWorkerRecoveredCount() !=
      indexMessageState._workerRecoveredCount
  ) {
    throw new Error(
      "Expected worker-recovered count did not match actual!\n" +
        "Expected:\n" +
        indexMessageState.expectedWorkerRecoveredCount() +
        "\nActual:\n" +
        indexMessageState._workerRecoveredCount
    );
  }
  if (
    indexMessageState.expectedFailedToRecoverCount() != null &&
    indexMessageState.expectedFailedToRecoverCount() !=
      indexMessageState._workerFailedToRecoverCount
  ) {
    throw new Error(
      "Expected worker-failed-to-recover count did not match actual!\n" +
        "Expected:\n" +
        indexMessageState.expectedFailedToRecoverCount() +
        "\nActual:\n" +
        indexMessageState._workerFailedToRecoverCount
    );
  }
  if (
    indexMessageState.expectedCleanedUpCount() != null &&
    indexMessageState.expectedCleanedUpCount() !=
      indexMessageState._workerCleanedUpCount
  ) {
    throw new Error(
      "Expected worker-cleaned-up count did not match actual!\n" +
        "Expected:\n" +
        indexMessageState.expectedCleanedUpCount() +
        "\nActual:\n" +
        indexMessageState._workerCleanedUpCount
    );
  }
  if (
    indexMessageState.expectedHadNoCleanUpCount() != null &&
    indexMessageState.expectedHadNoCleanUpCount() !=
      indexMessageState._workerHadNoCleanUpCount
  ) {
    throw new Error(
      "Expected worker-had-no-cleanup count did not match actual!\n" +
        "Expected:\n" +
        indexMessageState.expectedHadNoCleanUpCount() +
        "\nActual\n" +
        indexMessageState._workerHadNoCleanUpCount
    );
  }

  if (
    indexMessageState.expectedNumFullIndexed() != null &&
    indexMessageState.expectedNumFullIndexed() !=
      indexMessageState._numFullIndexed
  ) {
    throw new Error(
      "Expected number of fully indexed messages did not match.\n" +
        "Expected:\n" +
        indexMessageState.expectedNumFullIndexed() +
        "\nActual:\n" +
        indexMessageState._numFullIndexed
    );
  }

  // Cleanup of internal tracking values in the IndexMessageState
  //  for new tests.
  resetIndexMessageState();

  // If no error has been thrown till here were fine!
  // Return values for Assert.ok.
  // Using like Assert.ok(...assertExpectedMessagesIndexed()).
  return [true, "Expected messages were indexed."];
}

/**
 * Resets the IndexMessageState
 *
 * @TODO more docs
 */
function resetIndexMessageState() {
  indexMessageState.synMessageSets = [];
  indexMessageState._glodaMessagesByMessageId = [];
  indexMessageState._glodaDeletionsByMessageId = [];

  indexMessageState._workerRecoveredCount = 0;
  indexMessageState._workerFailedToRecoverCount = 0;
  indexMessageState._workerCleanedUpCount = 0;
  indexMessageState._workerHadNoCleanUpCount = 0;

  indexMessageState._numFullIndexed = 0;
  indexMessageState.resetData();
}

/**
 * Wipe out almost everything from the clutches of the GlodaCollectionManager.
 * By default, it is caching things and knows about all the non-GC'ed
 *  collections.  Tests may want to ensure that their data is loaded from disk
 *  rather than relying on the cache, and so, we exist.
 * The exception to everything is that Gloda's concept of myContact and
 *  myIdentities needs to have its collections still be reachable or invariants
 *  are in danger of being "de-invarianted".
 * The other exception to everything are any catch-all-collections used by our
 *  testing/indexing process.  We don't scan for them, we just hard-code their
 *  addition if they exist.
 */
export function nukeGlodaCachesAndCollections() {
  // Explode if the GlodaCollectionManager somehow doesn't work like we think it
  //  should.  (I am reluctant to put this logic in there, especially because
  //  knowledge of the Gloda contact/identity collections simply can't be known
  //  by the colleciton manager.)
  if (
    GlodaCollectionManager._collectionsByNoun === undefined ||
    GlodaCollectionManager._cachesByNoun === undefined
  ) {
    // We don't check the Gloda contact/identities things because they might not
    //  get initialized if there are no identities, which is the case for our
    //  unit tests right now...
    throw new Error(
      "Try and remember to update the testing infrastructure when you " +
        "change things!"
    );
  }

  // We can just blow away the known collections.
  GlodaCollectionManager._collectionsByNoun = {};
  // But then we have to put the myContact / myIdentities junk back.
  if (Gloda._myContactCollection) {
    GlodaCollectionManager.registerCollection(Gloda._myContactCollection);
    GlodaCollectionManager.registerCollection(Gloda._myIdentitiesCollection);
  }
  // Don't forget our testing catch-all collection.
  if (collectionListener.catchAllCollection) {
    // Empty it out in case it has anything in it.
    collectionListener.catchAllCollection.clear();
    // And now we can register it.
    GlodaCollectionManager.registerCollection(
      collectionListener.catchAllCollection
    );
  }

  // Caches aren't intended to be cleared, but we also don't want to lose our
  //  caches, so we need to create new ones from the ashes of the old ones.
  const oldCaches = GlodaCollectionManager._cachesByNoun;
  GlodaCollectionManager._cachesByNoun = {};
  for (const nounId in oldCaches) {
    const cache = oldCaches[nounId];
    GlodaCollectionManager.defineCache(cache._nounDef, cache._maxCacheSize);
  }
}
