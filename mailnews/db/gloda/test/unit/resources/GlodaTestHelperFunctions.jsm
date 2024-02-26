/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "configureGlodaIndexing",
  "waitForGlodaDBFlush",
  "waitForIndexingHang",
  "resumeFromSimulatedHang",
  "permuteMessages",
  "makeABCardForAddressPair",
];

/*
 * This file provides gloda testing infrastructure functions which are not coupled
 * with the IndexMessageState from GlodaTestHelper.jsm
 */

var { GlodaDatastore } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDatastore.jsm"
);
var { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
var { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);
var { SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var log = console.createInstance({
  prefix: "gloda.helperFunctions",
  maxLogLevel: "Warn",
  maxLogLevelPref: "gloda.loglevel",
});

/**
 * Resume execution when the db has run all the async statements whose execution
 *  was queued prior to this call.  We trigger a commit to accomplish this,
 *  although this could also be accomplished without a commit.  (Though we would
 *  have to reach into GlodaDatastore.jsm and get at the raw connection or extend
 *  datastore to provide a way to accomplish this.)
 */
async function waitForGlodaDBFlush() {
  // We already have a mechanism to do this by forcing a commit.  Arguably,
  //  it would be better to use a mechanism that does not induce an fsync.
  var savedDepth = GlodaDatastore._transactionDepth;
  if (!savedDepth) {
    GlodaDatastore._beginTransaction();
  }

  let promiseResolve;
  const promise = new Promise(resolve => {
    promiseResolve = resolve;
  });
  GlodaDatastore.runPostCommit(promiseResolve);
  // We don't actually need to run things to zero. We can just wait for the
  //  outer transaction to close itself.
  GlodaDatastore._commitTransaction();
  if (savedDepth) {
    GlodaDatastore._beginTransaction();
  }
  await promise;
}

/**
 * An injected fault exception.
 */
function InjectedFault(aWhy) {
  this.message = aWhy;
}
InjectedFault.prototype = {
  toString() {
    return "[InjectedFault: " + this.message + "]";
  },
};

function _inject_failure_on_MsgHdrToMimeMessage() {
  throw new InjectedFault("MsgHdrToMimeMessage");
}

let hangResolve;
let hangPromise = new Promise(resolve => {
  hangResolve = resolve;
});

function _simulate_hang_on_MsgHdrToMimeMessage(...aArgs) {
  hangResolve([MsgHdrToMimeMessage, null, aArgs]);
}

/**
 * If you have configured gloda to hang while indexing, this is the thing
 *  you wait on to make sure the indexer actually gets to the point where it
 *  hangs.
 */
async function waitForIndexingHang() {
  await hangPromise;
}

/**
 * Configure gloda indexing.  For most settings, the settings get clobbered by
 *  the next time this method is called.  Omitted settings reset to the defaults.
 *  However, anything labeled as a 'sticky' setting stays that way until
 *  explicitly changed.
 *
 * @param {object} aArgs - Configuration.
 * @param {boolean} [aArgs.event=true] - Should event-driven indexing be enabled
 *   (true) or disabled (false)? Right now, this actually suppresses
 *   indexing... the semantics will be ironed out as-needed.
 * @param {null|"streaming"} [aArgs.hangWhile] Must be either omitted
 *   (for don't force a hang) or "streaming" indicating that we should do a
 *   no-op instead of performing the message streaming.
 *   This will manifest as a hang until
 *   |resumeFromSimulatedHang| is invoked or the test explicitly causes the
 *   indexer to abort (in which case you do not need to call the resume
 *   function.)  You must omit injectFaultIn if you use hangWhile.
 * @param {null|"streaming"}[aArgs.injectFaultIn=null]
 *   Must be omitted (for don't inject a failure) or "streaming" indicating
 *   that we should inject a failure when the message indexer attempts to
 *   stream a message. The fault will be an appropriate exception.
 *   You must omit hangWhile if you use injectFaultIn.
 */
function configureGlodaIndexing(aArgs) {
  const shouldSuppress = "event" in aArgs ? !aArgs.event : false;
  if (shouldSuppress != GlodaIndexer.suppressIndexing) {
    log.debug(`Setting suppress indexing to ${shouldSuppress}.`);
    GlodaIndexer.suppressIndexing = shouldSuppress;
  }

  if ("hangWhile" in aArgs) {
    log.debug(`Enabling hang injection in ${aArgs.hangWhile}.`);
    switch (aArgs.hangWhile) {
      case "streaming":
        GlodaMsgIndexer._MsgHdrToMimeMessageFunc =
          _simulate_hang_on_MsgHdrToMimeMessage;
        break;
      default:
        throw new Error(
          aArgs.hangWhile + " is not a legal choice for hangWhile"
        );
    }
  } else if ("injectFaultIn" in aArgs) {
    log.debug(`Enabling fault injection in ${aArgs.hangWhile}.`);
    switch (aArgs.injectFaultIn) {
      case "streaming":
        GlodaMsgIndexer._MsgHdrToMimeMessageFunc =
          _inject_failure_on_MsgHdrToMimeMessage;
        break;
      default:
        throw new Error(
          aArgs.injectFaultIn + " is not a legal choice for injectFaultIn"
        );
    }
  } else {
    if (GlodaMsgIndexer._MsgHdrToMimeMessageFunc != MsgHdrToMimeMessage) {
      log.debug("Clearing hang/fault injection.");
    }
    GlodaMsgIndexer._MsgHdrToMimeMessageFunc = MsgHdrToMimeMessage;
  }
}

/**
 * Call this to resume from the hang induced by configuring the indexer with
 *  a "hangWhile" argument to |configureGlodaIndexing|.
 *
 * @param {boolean} [aJustResumeExecution=false] - Should we just poke the
 *   callback driver for the indexer rather than continuing the call.
 *   You would likely want to do this if you committed a lot of violence while
 *   in the simulated hang and proper resumption would throw exceptions all over
 *   the place. For example; if you hang before streaming and destroy the
 *   message header while suspended, resuming the attempt to stream will throw.)
 */
async function resumeFromSimulatedHang(aJustResumeExecution) {
  if (aJustResumeExecution) {
    log.debug("Resuming from simulated hang with direct wrapper callback.");
    GlodaIndexer._wrapCallbackDriver();
  } else {
    const [func, dis, args] = await hangPromise;
    log.debug(`Resuming from simulated hang with call to: ${func.name}.`);
    func.apply(dis, args);
  }
  // Reset the promise for the hang.
  hangPromise = new Promise(resolve => {
    hangResolve = resolve;
  });
}

/**
 * Prepares permutations for messages with aScenarioMaker. Be sure to wait for the indexer
 * for every permutation and verify the result.
 *
 * This process is executed once for each possible permutation of observation
 *  of the synthetic messages.  (Well, we cap it; brute-force test your logic
 *  on your own time; you should really only be feeding us minimal scenarios.)
 *
 * @param {Function} aScenarioMaker - A function that, when called,
 *   will generate a series of SyntheticMessage instances.
 *   Each call to this method should generate
 *   a new set of conceptually equivalent, but not identical, messages.  This
 *   allows us to process without having to reset our state back to nothing each
 *   time.  (This is more to try and make sure we run the system with a 'dirty'
 *   state than a bid for efficiency.)
 * @param {MessageInjection} messageInjection - An instance to use for permuting
 *   the messages and creating folders.
 *
 * @returns {Promise[SyntheticMessageSet]} Await it sequentially with a
 *   for...of loop.
 *   Wait for each element for the Indexer and assert afterwards.
 */
async function permuteMessages(aScenarioMaker, messageInjection) {
  const folder = await messageInjection.makeEmptyFolder();

  // To calculate the permutations, we need to actually see what gets produced.
  let scenarioMessages = aScenarioMaker();
  const numPermutations = Math.min(factorial(scenarioMessages.length), 32);

  const permutations = [];
  for (let iPermutation = 0; iPermutation < numPermutations; iPermutation++) {
    permutations.push(async () => {
      log.debug(`Run permutation: ${iPermutation + 1} / ${numPermutations}`);
      // If this is not the first time through, we need to create a new set.
      if (iPermutation) {
        scenarioMessages = aScenarioMaker();
      }
      scenarioMessages = permute(scenarioMessages, iPermutation);
      const scenarioSet = new SyntheticMessageSet(scenarioMessages);
      await messageInjection.addSetsToFolders([folder], [scenarioSet]);
      return scenarioSet;
    });
  }
  return permutations;
}

/**
 * A simple factorial function used to calculate the number of permutations
 *  possible for a given set of messages.
 */
function factorial(i, rv) {
  if (i <= 1) {
    return rv || 1;
  }
  return factorial(i - 1, (rv || 1) * i); // tail-call capable
}

/**
 * Permute an array given a 'permutation id' that is an integer that fully
 *  characterizes the permutation through the decisions that need to be made
 *  at each step.
 *
 * @param {object[]} aArray - Source array that is destructively processed.
 * @param {integer} aPermutationId - The permutation id. A permutation id of 0
 *   results in the original array's sequence being maintained.
 */
function permute(aArray, aPermutationId) {
  const out = [];
  for (let i = aArray.length; i > 0; i--) {
    const offset = aPermutationId % i;
    out.push(aArray[offset]);
    aArray.splice(offset, 1);
    aPermutationId = Math.floor(aPermutationId / i);
  }
  return out;
}

/**
 * Add a name-and-address pair as generated by `makeNameAndAddress` to the
 *  personal address book.
 */
function makeABCardForAddressPair(nameAndAddress) {
  // XXX bug 314448 demands that we trigger creation of the ABs...  If we don't
  //  do this, then the call to addCard will fail if someone else hasn't tickled
  //  this.
  MailServices.ab.directories;

  // kPABData is copied from abSetup.js
  const kPABData = {
    URI: "jsaddrbook://abook.sqlite",
  };
  const addressBook = MailServices.ab.getDirectory(kPABData.URI);

  const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.displayName = nameAndAddress[0];
  card.primaryEmail = nameAndAddress[1];

  // Just save the new node straight away.
  addressBook.addCard(card);

  log.debug(`Adding address book card for: ${nameAndAddress}`);
}
