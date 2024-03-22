/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// ChromeUtils.import should be used for this, but it breaks mozmill.
// Assume whatever test loaded this file already has mailTestUtils.
/* globals mailTestUtils */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var allTestedEvents =
  MailServices.mfn.msgAdded |
  MailServices.mfn.msgsClassified |
  MailServices.mfn.msgsJunkStatusChanged |
  MailServices.mfn.msgsDeleted |
  MailServices.mfn.msgsMoveCopyCompleted |
  MailServices.mfn.msgKeyChanged |
  MailServices.mfn.msgUnincorporatedMoved |
  MailServices.mfn.folderAdded |
  MailServices.mfn.folderDeleted |
  MailServices.mfn.folderMoveCopyCompleted |
  MailServices.mfn.folderRenamed |
  MailServices.mfn.folderCompactStart |
  MailServices.mfn.folderCompactFinish |
  MailServices.mfn.folderReindexTriggered;

// Current test being executed
var gTest = 1;

// Which events are expected
var gExpectedEvents = [];

// The current status (what all has been done)
var gCurrStatus = 0;
var kStatus = {
  notificationsDone: 0x1,
  onStopCopyDone: 0x2,
  functionCallDone: 0x4,
  everythingDone: 0,
};
kStatus.everythingDone =
  kStatus.notificationsDone | kStatus.onStopCopyDone | kStatus.functionCallDone;

// For copyFileMessage: this stores the header that was received
var gHdrsReceived = [];

var gMsgHdrs = [];

// Our listener, which captures events and verifies them as they are received.
var gMFListener = {
  msgAdded(aMsg) {
    verify([MailServices.mfn.msgAdded, aMsg]);
    // We might not actually have a header in gHdrsReceived in the IMAP case,
    // so use the aMsg we got instead
    gMsgHdrs.push({ hdr: aMsg, ID: aMsg.messageId });
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    } else if (gExpectedEvents[0][0] == MailServices.mfn.msgsClassified) {
      // XXX this is a hack to deal with limitations of the classification logic
      //  and the new list.  We want to issue a call to clear the list once all
      //  the messages have been added, which would be when the next expected
      //  event is msgsClassified.  (The limitation is that if we don't do this,
      //  we can end up getting told about this message again later.)
      aMsg.folder.clearNewMessages();
    }
  },

  msgsClassified(aMsgs, aJunkProcessed, aTraitProcessed) {
    dump("classified id: " + aMsgs[0].messageId + "\n");
    verify([
      MailServices.mfn.msgsClassified,
      aMsgs,
      aJunkProcessed,
      aTraitProcessed,
    ]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  msgsJunkStatusChanged(messages) {
    verify([MailServices.mfn.msgsJunkStatusChanged, messages]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  msgsDeleted(aMsgs) {
    verify([MailServices.mfn.msgsDeleted, aMsgs]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  msgsMoveCopyCompleted(aMove, aSrcMsgs, aDestFolder, aDestMsgs) {
    verify([
      MailServices.mfn.msgsMoveCopyCompleted,
      aMove,
      aSrcMsgs,
      aDestFolder,
      aDestMsgs,
    ]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  msgKeyChanged(aOldKey, aNewMsgHdr) {
    verify([MailServices.mfn.msgKeyChanged, aOldKey, aNewMsgHdr]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  msgUnincorporatedMoved(srcFolder, msg) {
    verify([MailServices.mfn.msgUnincorporatedMoved, srcFolder, msg]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderAdded(aFolder) {
    verify([MailServices.mfn.folderAdded, aFolder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderDeleted(aFolder) {
    verify([MailServices.mfn.folderDeleted, aFolder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderMoveCopyCompleted(aMove, aSrcFolder, aDestFolder) {
    verify([
      MailServices.mfn.folderMoveCopyCompleted,
      aMove,
      aSrcFolder,
      aDestFolder,
    ]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderRenamed(aOrigFolder, aNewFolder) {
    verify([MailServices.mfn.folderRenamed, aOrigFolder, aNewFolder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderCompactStart(folder) {
    verify([MailServices.mfn.folderCompactStart, folder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderCompactFinish(folder) {
    verify([MailServices.mfn.folderCompactFinish, folder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },

  folderReindexTriggered(folder) {
    verify([MailServices.mfn.folderReindexTriggered, folder]);
    if (gExpectedEvents.length == 0) {
      gCurrStatus |= kStatus.notificationsDone;
      if (gCurrStatus == kStatus.everythingDone) {
        resetStatusAndProceed();
      }
    }
  },
};

// Copy listener, for proceeding after each operation.
var copyListener = {
  // For copyFileMessage: this should be the folder the message is being stored to
  mFolderStoredIn: null,
  mMessageId: "",
  OnStartCopy() {},
  OnProgress() {},
  SetMessageKey(aKey) {
    gHdrsReceived.push(this.mFolderStoredIn.GetMessageHeader(aKey));
  },
  GetMessageId(aMessageId) {
    aMessageId = { value: this.mMessageId };
  },
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
    gCurrStatus |= kStatus.onStopCopyDone;
    if (gCurrStatus == kStatus.everythingDone) {
      resetStatusAndProceed();
    }
  },
};

function resetStatusAndProceed() {
  gHdrsReceived.length = 0;
  gCurrStatus = 0;
  // Ugly hack: make sure we don't get stuck in a JS->C++->JS->C++... call stack
  // This can happen with a bunch of synchronous functions grouped together, and
  // can even cause tests to fail because they're still waiting for the listener
  // to return
  do_timeout(0, () => {
    this.doTest(++gTest);
  });
}

// Checks whether the array returned from a function has exactly these elements.
function hasExactlyElements(array, elements) {
  // If an nsIArray (it could also be a single header or a folder)
  if (elements instanceof Ci.nsIArray) {
    var count = elements.length;

    // Check: array sizes should be equal.
    Assert.equal(count, array.length);

    for (let i = 0; i < count; i++) {
      // Check: query element, must be a header or folder and present in the array
      var currElement;
      try {
        currElement = elements.queryElementAt(i, Ci.nsIMsgDBHdr);
      } catch (e) {}
      if (!currElement) {
        try {
          currElement = elements.queryElementAt(i, Ci.nsIMsgFolder);
        } catch (e) {}
      }
      Assert.equal(typeof currElement, "object");
      Assert.notEqual(
        mailTestUtils.non_strict_index_of(array, currElement),
        -1
      );
    }
  } else if (Array.isArray(elements)) {
    Assert.equal(elements.length, array.length);
    for (const el of elements) {
      Assert.equal(typeof el, "object");
      Assert.equal(
        el instanceof Ci.nsIMsgDBHdr || el instanceof Ci.nsIMsgFolder,
        true
      );
      Assert.notEqual(mailTestUtils.non_strict_index_of(array, el), -1);
    }
  } else if (
    elements instanceof Ci.nsIMsgDBHdr ||
    elements instanceof Ci.nsIMsgFolder
  ) {
    // If a single header or a folder

    // Check: there should be only one element in the array.
    Assert.equal(array.length, 1);

    // Check: the element should be present
    Assert.notEqual(mailTestUtils.non_strict_index_of(array, elements), -1);
  } else {
    // This shouldn't happen
    do_throw("Unrecognized item returned from listener");
  }
}

// Verifies an event
function verify(event) {
  // Check: make sure we actually have an item to process
  Assert.ok(gExpectedEvents.length >= 1);
  var expected = gExpectedEvents.shift();

  // Check: events match.
  var eventType = expected[0];
  Assert.equal(event[0], eventType);

  dump("..... Verifying event type " + eventType + "\n");

  switch (eventType) {
    case MailServices.mfn.msgAdded:
      // So for IMAP right now, we aren't able to get the actual nsIMsgDBHdr.
      // Instead, we'll match up message ids as a (poor?) substitute.
      if (expected[1].expectedMessageId) {
        Assert.equal(expected[1].expectedMessageId, event[1].messageId);
        break;
      }
    // If we do have a header, fall through to the case below
    case MailServices.mfn.msgsDeleted:
    case MailServices.mfn.folderDeleted:
      // Check: headers match/folder matches.
      hasExactlyElements(expected[1], event[1]);
      break;
    case MailServices.mfn.msgsClassified:
      // In the IMAP case expected[1] is a list of mesage-id strings whereas in
      // the local case (where we are copying from files), we actually have
      // the headers.
      if (typeof expected[1][0] == "string") {
        // IMAP; message id strings
        // The IMAP case has additional complexity in that the 'new message'
        // list is not tailored to our needs and so may over-report about
        // new messagse.  So to deal with this we make sure the msgsClassified
        // event is telling us about at least the N expected events and that
        // the last N of these events match
        if (event[1].length < expected[1].length) {
          do_throw("Not enough reported classified messages.");
        }
        const ignoreCount = event[1].length - expected[1].length;
        for (let i = 0; i < expected[1].length; i++) {
          const eventHeader = event[1][i + ignoreCount];
          Assert.equal(expected[1][i], eventHeader.messageId);
        }
      } else {
        // actual headers
        hasExactlyElements(expected[1], event[1]);
      }
      // aJunkProcessed: was the message processed for junk?
      Assert.equal(expected[2], event[2]);
      // aTraitProcessed: was the message processed for traits?
      Assert.equal(expected[3], event[3]);
      break;
    case MailServices.mfn.msgsJunkStatusChanged:
      // Check: same messages?
      hasExactlyElements(expected[1], event[1]);
      break;
    case MailServices.mfn.msgKeyChanged:
      Assert.equal(expected[1].expectedMessageId, event[2].messageId);
      break;
    case MailServices.mfn.msgUnincorporatedMoved:
      // Check: Same folder?
      Assert.equal(expected[1].URI, event[1].URI);
      // Check: message matches?
      hasExactlyElements(expected[2], event[2]);
      break;
    case MailServices.mfn.msgsMoveCopyCompleted:
    case MailServices.mfn.folderMoveCopyCompleted:
      // Check: Move or copy as expected.
      Assert.equal(expected[1], event[1]);

      // Check: headers match/folder matches.
      hasExactlyElements(expected[2], event[2]);

      // Check: destination folder matches.
      Assert.equal(expected[3].URI, event[3].URI);

      if (eventType == MailServices.mfn.folderMoveCopyCompleted) {
        break;
      }

      // Check: destination headers.  We expect these for local and imap folders,
      //  but we will not have heard about the headers ahead of time,
      //  so the best we can do is make sure they match up.  To this end,
      //  we check that the message-id header values match up.
      for (let iMsg = 0; iMsg < event[2].length; iMsg++) {
        const srcHdr = event[2][iMsg];
        const destHdr = event[4][iMsg];
        Assert.equal(srcHdr.messageId, destHdr.messageId);
      }
      break;
    case MailServices.mfn.folderAdded:
      // Check: parent folder matches
      Assert.equal(expected[1].URI, event[1].parent.URI);

      // Check: folder name matches
      Assert.equal(expected[2], event[1].prettyName);
      Assert.equal(expected[2], event[1].name);

      // Not a check, but call the passed in callback with the new folder,
      // used e.g. to store this folder somewhere.
      if (expected[3]) {
        expected[3](event[1]);
      }
      break;
    case MailServices.mfn.folderRenamed:
      // Check: source folder matches
      hasExactlyElements(expected[1], event[1]);

      // Check: destination folder name matches
      Assert.equal(expected[2], event[2].prettyName);
      break;
    case MailServices.mfn.folderCompactStart:
    case MailServices.mfn.folderCompactFinish:
    case MailServices.mfn.folderReindexTriggered:
      // Check: same folder?
      Assert.equal(expected[1].URI, event[1].URI);
      break;
  }
}
