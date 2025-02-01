/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Attempt to test nsMsgDBView and descendants.  Right now this means we:
 * - Ensure sorting and grouping sorta works, including using custom columns.
 *
 * Things we really should do:
 * - Test that secondary sorting works, especially when the primary column is
 *   a custom column.
 *
 * You may also want to look into the test_viewWrapper_*.js tests as well.
 */

var { MessageGenerator, MessageScenarioFactory, SyntheticMessageSet } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
  );
const { TreeSelection } = ChromeUtils.importESModule(
  "chrome://messenger/content/TreeSelection.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { dump_view_contents } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ViewHelpers.sys.mjs"
);

// Items used to add messages to the folder
var gMessageGenerator = new MessageGenerator();
var gScenarioFactory = new MessageScenarioFactory(gMessageGenerator);
var messageInjection = new MessageInjection({ mode: "local" });

var gTestFolder;
var gSiblingsMissingParentsSubject;
var gMessages;

function setup_messages() {
  // build up a diverse list of messages
  let messages = [];
  messages = messages.concat(gScenarioFactory.directReply(10));
  // the message generator uses a constanty incrementing counter, so we need to
  //  mix up the order of messages ourselves to ensure that the timestamp
  //  ordering is not already in order.  (a poor test of sorting otherwise.)
  messages = gScenarioFactory.directReply(6).concat(messages);

  messages = messages.concat(gScenarioFactory.fullPyramid(3, 3));
  const siblingMessages = gScenarioFactory.siblingsMissingParent();
  // cut off "Re: " part
  gSiblingsMissingParentsSubject = siblingMessages[0].subject.slice(4);
  dump("siblings subect = " + gSiblingsMissingParentsSubject + "\n");
  messages = messages.concat(siblingMessages);
  messages = messages.concat(gScenarioFactory.missingIntermediary());
  // This next line was found to be faulty during linting, but fixing it breaks the test.
  // messages.concat(gMessageGenerator.makeMessage({age: {days: 2, hours: 1}}));

  // build a hierarchy like this (the UID order corresponds to the date order)
  //   1
  //    2
  //     4
  //    3
  const msg1 = gMessageGenerator.makeMessage();
  const msg2 = gMessageGenerator.makeMessage({ inReplyTo: msg1 });
  const msg3 = gMessageGenerator.makeMessage({ inReplyTo: msg1 });
  const msg4 = gMessageGenerator.makeMessage({ inReplyTo: msg2 });
  messages = messages.concat([msg1, msg2, msg3, msg4]);

  // test bug 600140, make a thread that Reply message has smaller MsgKey
  const msgBiggerKey = gMessageGenerator.makeMessage();
  const msgSmallerKey = gMessageGenerator.makeMessage({
    inReplyTo: msgBiggerKey,
  });
  messages = messages.concat([msgSmallerKey, msgBiggerKey]);
  const msgSet = new SyntheticMessageSet(messages);
  return msgSet;
}

/**
 * Sets gTestFolder with msgSet. Ensure that gTestFolder is clean for each test.
 *
 * @param {SyntheticMessageSet} msgSet
 */
async function set_gTestFolder(msgSet) {
  gTestFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);
}

/**
 * Create a synthetic message by passing the provided aMessageArgs to
 *  the message generator, then add the resulting message to the given
 *  folder (or gTestFolder if no folder is provided).
 */
async function make_and_add_message(aMessageArgs) {
  // create the message
  const synMsg = gMessageGenerator.makeMessage(aMessageArgs);
  const msgSet = new SyntheticMessageSet([synMsg]);
  // this is synchronous for local stuff.
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);

  return [synMsg, msgSet];
}

function view_throw(why) {
  dump_view_contents();
  do_throw(why);
}

/**
 * Throw if gDBView has any rows.
 */
function assert_view_empty() {
  if (gTreeView.rowCount != 0) {
    view_throw(
      "Expected view to be empty, but it was not! (" +
        gTreeView.rowCount +
        " rows)"
    );
  }
}

/**
 * Throw if gDBView does not have aCount rows.
 */
function assert_view_row_count(aCount) {
  if (gTreeView.rowCount != aCount) {
    view_throw(
      "Expected view to have " +
        aCount +
        " rows, but it had " +
        gTreeView.rowCount +
        " rows!"
    );
  }
}

/**
 * Throw if any of the arguments (as view indices) do not correspond to dummy
 *  rows in gDBView.
 */
function assert_view_index_is_dummy(...aArgs) {
  for (const viewIndex of aArgs) {
    const flags = gDBView.getFlagsAt(viewIndex);
    if (!(flags & MSG_VIEW_FLAG_DUMMY)) {
      view_throw("Expected index " + viewIndex + " to be a dummy!");
    }
  }
}

/**
 * Throw if any of the arguments (as view indices) correspond to dummy rows in
 *  gDBView.
 */
function assert_view_index_is_not_dummy(...aArgs) {
  for (const viewIndex of aArgs) {
    const flags = gDBView.getFlagsAt(viewIndex);
    if (flags & MSG_VIEW_FLAG_DUMMY) {
      view_throw("Expected index " + viewIndex + " to not be a dummy!");
    }
  }
}

function assert_view_level_is(index, level) {
  if (gDBView.getLevel(index) != level) {
    view_throw(
      "Expected index " +
        index +
        " to be level " +
        level +
        " not " +
        gDBView.getLevel(index)
    );
  }
}

/**
 * Given a message, assert that it is present at the given indices.
 *
 * Usage:
 *  assert_view_message_at_indices(synMsg, 0);
 *  assert_view_message_at_indices(synMsg, 0, 1);
 *  assert_view_message_at_indices(aMsg, 0, bMsg, 1);
 */
function assert_view_message_at_indices(...aArgs) {
  let curHdr;
  for (const thing of aArgs) {
    if (typeof thing == "number") {
      const hdrAt = gDBView.getMsgHdrAt(thing);
      if (curHdr != hdrAt) {
        view_throw(
          "Expected hdr at " +
            thing +
            " to be " +
            curHdr.messageKey +
            ":" +
            curHdr.mime2DecodedSubject.substr(0, 30) +
            " not " +
            hdrAt.messageKey +
            ":" +
            hdrAt.mime2DecodedSubject.substr(0, 30)
        );
      }
    } else {
      // synthetic message, get the header...
      curHdr = gTestFolder.msgDatabase.getMsgHdrForMessageID(thing.messageId);
    }
  }
}

var authorFirstLetterCustomColumn = {
  getCellText(row) {
    const msgHdr = this.dbView.getMsgHdrAt(row);
    return msgHdr.mime2DecodedAuthor.charAt(0).toUpperCase() || "?";
  },
  getSortStringForRow(msgHdr) {
    // charAt(0) is a quote, charAt(1) is the first letter!
    return msgHdr.mime2DecodedAuthor.charAt(1).toUpperCase() || "?";
  },
  isString() {
    return true;
  },

  getCellProperties() {
    return "";
  },
  getRowProperties() {
    return "";
  },
  getImageSrc() {
    return null;
  },
  getSortLongForRow() {
    return 0;
  },
};

var gDBView;
var gTreeView;

var MSG_VIEW_FLAG_DUMMY = 0x20000000;

var gFakeSelection = new TreeSelection(null);

function setup_view(aViewType, aViewFlags, aTestFolder) {
  const dbviewContractId =
    "@mozilla.org/messenger/msgdbview;1?type=" + aViewType;

  if (aTestFolder == null) {
    aTestFolder = gTestFolder;
  }

  // always start out fully expanded
  aViewFlags |= Ci.nsMsgViewFlagsType.kExpandAll;

  gDBView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  gDBView.init(null, null, null);
  gDBView.open(
    aViewType != "search" ? aTestFolder : null,
    Ci.nsMsgViewSortType.byDate,
    aViewType != "search"
      ? Ci.nsMsgViewSortOrder.ascending
      : Ci.nsMsgViewSortOrder.descending,
    aViewFlags
  );

  // we need to cram messages into the search via nsIMsgSearchNotify interface
  if (
    aViewType == "search" ||
    aViewType == "quicksearch" ||
    aViewType == "xfvf"
  ) {
    const searchNotify = gDBView.QueryInterface(Ci.nsIMsgSearchNotify);
    searchNotify.onNewSearch();
    for (const msgHdr of aTestFolder.msgDatabase.enumerateMessages()) {
      searchNotify.onSearchHit(msgHdr, msgHdr.folder);
    }
    searchNotify.onSearchDone(Cr.NS_OK);
  }

  gDBView.addColumnHandler(
    "authorFirstLetterCol",
    authorFirstLetterCustomColumn
  );
  // XXX this sets the custom column to use for sorting by the custom column.
  // It has been argued (and is generally accepted) that this should not be
  // so limited.
  gDBView.curCustomColumn = "authorFirstLetterCol";

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);
  gTreeView.selection = gFakeSelection;
  gFakeSelection.view = gTreeView;
}

function setup_group_view(aSortType, aSortOrder, aTestFolder) {
  const dbviewContractId = "@mozilla.org/messenger/msgdbview;1?type=group";

  if (aTestFolder == null) {
    aTestFolder = gTestFolder;
  }

  // grouped view uses these flags
  const viewFlags =
    Ci.nsMsgViewFlagsType.kGroupBySort |
    Ci.nsMsgViewFlagsType.kExpandAll |
    Ci.nsMsgViewFlagsType.kThreadedDisplay;

  gDBView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  gDBView.init(null, null, null);
  var outCount = {};
  gDBView.open(aTestFolder, aSortType, aSortOrder, viewFlags, outCount);

  gDBView.addColumnHandler(
    "authorFirstLetterCol",
    authorFirstLetterCustomColumn
  );
  gDBView.curCustomColumn = "authorFirstLetterCol";

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);
  gFakeSelection.view = gTreeView;
  gTreeView.selection = gFakeSelection;
}

/**
 * Comparison func for built-in types (including strings, so no subtraction.)
 */
function generalCmp(a, b) {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Check that sort order and grouping logic (if applicable) are doing the right
 *  thing.
 *
 * In the case of groups (indicated by dummy headers), we want to ignore the
 *  dummies and 1) make sure all the values in the group have the same value,
 *  2) verify that the headers meet our total ordering.
 * In the case of threads, we want to ensure that each level of the hierarchy
 *  meets our ordering demands, recursing into children.  Because the tree
 *  representation is rather quite horrible, the easiest thing for us is to
 *  track a per-level list of comparison values we have seen, nuking older
 *  values when changes in levels indicate closure of a level.  (Namely,
 *  if we see a node at level N, then all levels >N are no longer valid.)
 *
 * @param {nsMsgViewType} aSortBy - The sort type.
 * @param {nsMsgViewSortOrder} aDirection - The sort direction.
 * @param {string|Function} aKeyOrValueGetter - A string naming the attribute on
 *   the message headerto retrieve, or if that is not sufficient a function that
 *   takes a message header and returns the sort value for it.
 * @param {Function} [aGetGroupValue] - An optional function that takes a
 *   message header and  returns the grouping value for the header.
 *   If omitted, it is assumed that the sort value is the grouping value.
 */
function ensure_view_ordering(
  aSortBy,
  aDirection,
  aKeyOrValueGetter,
  aGetGroupValue
) {
  if (!gTreeView.rowCount) {
    do_throw("There are no rows in my folder! I can't test anything!");
  }
  dump(
    "  Ensuring sort order for " +
      aSortBy +
      " (Row count: " +
      gTreeView.rowCount +
      ")\n"
  );
  dump("    cur view flags: " + gDBView.viewFlags + "\n");

  // standard grouping doesn't re-group when you sort.  so we need to actually
  //  re-initialize the view.
  // but search mode is special and does the right thing because asuth didn't
  //  realize that it shouldn't do the right thing, so it can just change the
  //  sort.  (of course, under the hood, it is actually creating a new view...)
  if (
    gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort &&
    gDBView.viewType != Ci.nsMsgViewType.eShowSearch
  ) {
    // we must close to re-open (or we could just use a new view)
    const msgFolder = gDBView.msgFolder;
    gDBView.close();
    gDBView.open(msgFolder, aSortBy, aDirection, gDBView.viewFlags, {});
  } else {
    gDBView.sort(aSortBy, aDirection);
  }

  const comparisonValuesByLevel = [];
  const expectedLevel0CmpResult =
    aDirection == Ci.nsMsgViewSortOrder.ascending ? 1 : -1;
  const comparator = generalCmp;

  let dummyCount = 0,
    emptyDummyCount = 0;

  const valueGetter =
    typeof aKeyOrValueGetter == "string"
      ? function (msgHdr) {
          return msgHdr[aKeyOrValueGetter];
        }
      : aKeyOrValueGetter;
  const groupValueGetter = aGetGroupValue || valueGetter;

  // don't do group testing until we see a dummy header (which we will see
  //  before we see any grouped headers, so it's fine to do this)
  let inGroup = false;
  // the current grouping value for the current group.  this allows us to
  //  detect erroneous grouping of different group values together.
  let curGroupValue = null;
  // the set of group values observed before the current group.  this allows
  //  us to detect improper grouping where there are multiple groups with the
  //  same grouping value.
  const previouslySeenGroupValues = {};

  for (let iViewIndex = 0; iViewIndex < gTreeView.rowCount; iViewIndex++) {
    const msgHdr = gDBView.getMsgHdrAt(iViewIndex);
    const msgViewFlags = gDBView.getFlagsAt(iViewIndex);

    // ignore dummy headers; testing grouping logic happens elsewhere
    if (msgViewFlags & MSG_VIEW_FLAG_DUMMY) {
      if (dummyCount && curGroupValue == null) {
        emptyDummyCount++;
      }
      dummyCount++;
      if (curGroupValue != null) {
        previouslySeenGroupValues[curGroupValue] = true;
      }
      curGroupValue = null;
      inGroup = true;
      continue;
    }

    // level is 0-based
    const level = gTreeView.getLevel(iViewIndex);
    // nuke existing comparison levels
    if (level < comparisonValuesByLevel.length - 1) {
      comparisonValuesByLevel.splice(level);
    }

    // get the value for comparison
    const curValue = valueGetter(msgHdr);
    if (inGroup) {
      const groupValue = groupValueGetter(msgHdr);
      if (groupValue in previouslySeenGroupValues) {
        do_throw(`Group value ${groupValue} observed in more than one group!`);
      }
      if (curGroupValue == null) {
        curGroupValue = groupValue;
      } else if (curGroupValue != groupValue) {
        do_throw(
          "Inconsistent grouping! " + groupValue + " != " + curGroupValue
        );
      }
    }

    // is this level new to our comparisons?  then track it...
    if (level >= comparisonValuesByLevel.length) {
      // null-fill any gaps (due to, say, dummy nodes)
      while (comparisonValuesByLevel.length <= level) {
        comparisonValuesByLevel.push(null);
      }
      comparisonValuesByLevel.push(curValue);
    } else {
      // otherwise compare it
      const prevValue = comparisonValuesByLevel[level - 1];
      const cmpResult = comparator(curValue, prevValue);
      const expectedCmpResult = level > 0 ? 1 : expectedLevel0CmpResult;
      if (cmpResult && cmpResult != expectedCmpResult) {
        do_throw(
          "Ordering failure on key " +
            msgHdr.messageKey +
            ". " +
            curValue +
            " should have been " +
            (expectedCmpResult == 1 ? ">=" : "<=") +
            " " +
            prevValue +
            " but was not."
        );
      }
    }
  }

  if (inGroup && curGroupValue == null) {
    emptyDummyCount++;
  }
  if (dummyCount) {
    dump(
      "  saw " +
        dummyCount +
        " dummy headers (" +
        emptyDummyCount +
        " empty).\n"
    );
  }
}

/**
 * Test sorting functionality.
 */
function test_sort_columns() {
  ensure_view_ordering(
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.descending,
    "date",
    function getDateAgeBucket() {
      // so, this is a cop-out, but we know that the date age bucket for our
      //  generated messages is always more than 2-weeks ago!
      return 5;
    }
  );
  ensure_view_ordering(
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    "date",
    function getDateAgeBucket() {
      // so, this is a cop-out, but we know that the date age bucket for our
      //  generated messages is always more than 2-weeks ago!
      return 5;
    }
  );
  // (note, subject doesn't use dummy groups and so won't have grouping tested)
  ensure_view_ordering(
    Ci.nsMsgViewSortType.bySubject,
    Ci.nsMsgViewSortOrder.ascending,
    "mime2DecodedSubject"
  );
  ensure_view_ordering(
    Ci.nsMsgViewSortType.byAuthor,
    Ci.nsMsgViewSortOrder.ascending,
    "mime2DecodedAuthor"
  );
  // Id
  // Thread
  // Priority
  // Status
  // Size
  // Flagged
  // Unread
  ensure_view_ordering(
    Ci.nsMsgViewSortType.byRecipient,
    Ci.nsMsgViewSortOrder.ascending,
    "mime2DecodedRecipients"
  );
  // Location
  // Tags
  // JunkStatus
  // Attachments
  // Account
  // Custom
  ensure_view_ordering(
    Ci.nsMsgViewSortType.byCustom,
    Ci.nsMsgViewSortOrder.ascending,
    function (msgHdr) {
      return authorFirstLetterCustomColumn.getSortStringForRow(msgHdr);
    }
  );
  // Received
}

function test_number_of_messages() {
  // Bug 574799
  if (gDBView.numMsgsInView != gTestFolder.getTotalMessages(false)) {
    do_throw(
      "numMsgsInView is " +
        gDBView.numMsgsInView +
        " but should be " +
        gTestFolder.getTotalMessages(false) +
        "\n"
    );
  }
  // Bug 600140
  // Maybe elided so open it, now only consider the first one
  if (gDBView.isContainer(0) && !gDBView.isContainerOpen(0)) {
    gDBView.toggleOpenState(0);
  }
  let numMsgInTree = gTreeView.rowCount;
  if (gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort) {
    for (let iViewIndex = 0; iViewIndex < gTreeView.rowCount; iViewIndex++) {
      const flags = gDBView.getFlagsAt(iViewIndex);
      if (flags & MSG_VIEW_FLAG_DUMMY) {
        numMsgInTree--;
      }
    }
  }
  if (gDBView.numMsgsInView != numMsgInTree) {
    view_throw(
      "message in tree is " +
        numMsgInTree +
        " but should be " +
        gDBView.numMsgsInView +
        "\n"
    );
  }
}

function test_selected_messages() {
  gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);

  // Select one message
  gTreeView.selection.select(1);
  let selectedMessages = gDBView.getSelectedMsgHdrs();

  if (selectedMessages.length != 1) {
    do_throw(
      "getSelectedMsgHdrs.length is " +
        selectedMessages.length +
        " but should be 1\n"
    );
  }

  const firstSelectedMsg = gDBView.hdrForFirstSelectedMessage;
  if (selectedMessages[0] != firstSelectedMsg) {
    do_throw(
      "getSelectedMsgHdrs[0] is " +
        selectedMessages[0].messageKey +
        " but should be " +
        firstSelectedMsg.messageKey +
        "\n"
    );
  }

  // Select all messages
  gTreeView.selection.selectAll();
  if (gDBView.numSelected != gDBView.numMsgsInView) {
    do_throw(
      "numSelected is " +
        gDBView.numSelected +
        " but should be " +
        gDBView.numMsgsInView +
        "\n"
    );
  }

  selectedMessages = gDBView.getSelectedMsgHdrs();
  if (selectedMessages.length != gTestFolder.getTotalMessages(false)) {
    do_throw(
      "getSelectedMsgHdrs.length is " +
        selectedMessages.length +
        " but should be " +
        gTestFolder.getTotalMessages(false) +
        "\n"
    );
  }

  for (let i = 0; i < selectedMessages.length; i++) {
    const expectedHdr = gDBView.getMsgHdrAt(i);
    if (!selectedMessages.includes(expectedHdr)) {
      view_throw(
        "Expected " +
          expectedHdr.messageKey +
          ":" +
          expectedHdr.mime2DecodedSubject.substr(0, 30) +
          " to be selected, but it wasn't\n"
      );
    }
  }

  gTreeView.selection.clearSelection();
}

async function test_msg_added_to_search_view() {
  // if the view is a non-grouped search view, test adding a header to
  // the search results, and verify it gets put at top.
  if (!(gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort)) {
    gDBView.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
    const [synMsg] = await make_and_add_message();
    const msgHdr = gTestFolder.msgDatabase.getMsgHdrForMessageID(
      synMsg.messageId
    );
    gDBView
      .QueryInterface(Ci.nsIMsgSearchNotify)
      .onSearchHit(msgHdr, msgHdr.folder);
    assert_view_message_at_indices(synMsg, 0);
  }
}

function IsHdrChildOf(possibleParent, possibleChild) {
  const parentHdrId = possibleParent.messageId;
  const numRefs = possibleChild.numReferences;
  for (let refIndex = 0; refIndex < numRefs; refIndex++) {
    if (parentHdrId == possibleChild.getStringReference(refIndex)) {
      return true;
    }
  }
  return false;
}

// This could be part of ensure_view_ordering() but I don't want to make that
// function any harder to read.
function test_threading_levels() {
  if (!gTreeView.rowCount) {
    do_throw("There are no rows in my folder! I can't test anything!");
  }
  // only look at threaded, non-grouped views.
  if (
    gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort ||
    !(gDBView.viewFlags & Ci.nsMsgViewFlagsType.kThreadedDisplay)
  ) {
    return;
  }

  let prevLevel = 1;
  let prevMsgHdr;
  for (let iViewIndex = 0; iViewIndex < gTreeView.rowCount; iViewIndex++) {
    const msgHdr = gDBView.getMsgHdrAt(iViewIndex);
    const level = gTreeView.getLevel(iViewIndex);
    if (level > prevLevel && msgHdr.subject != gSiblingsMissingParentsSubject) {
      if (!IsHdrChildOf(prevMsgHdr, msgHdr)) {
        view_throw("indented message not child of parent");
      }
    }
    prevLevel = level;
    prevMsgHdr = msgHdr;
  }
}

function test_expand_collapse() {
  let oldRowCount = gDBView.rowCount;
  const thirdChild = gDBView.getMsgHdrAt(3);
  gDBView.toggleOpenState(0);
  if (gDBView.rowCount != oldRowCount - 9) {
    view_throw("collapsing first item should have removed 9 items");
  }

  // test that expand/collapse works with killed sub-thread.
  oldRowCount = gDBView.rowCount;
  gTestFolder.msgDatabase.markKilled(thirdChild.messageKey, true, null);
  gDBView.toggleOpenState(0);
  if (gDBView.rowCount != oldRowCount + 2) {
    view_throw("expanding first item should have aded 2 items");
  }
  gTestFolder.msgDatabase.markKilled(thirdChild.messageKey, false, null);
  oldRowCount = gDBView.rowCount;
  gDBView.toggleOpenState(0);
  if (gDBView.rowCount != oldRowCount - 2) {
    view_throw("collapsing first item should have removed 2 items");
  }
}

function test_qs_results() {
  // This just tests that bug 505967 hasn't regressed.
  if (gTreeView.getLevel(0) != 0) {
    view_throw("first message should be at level 0");
  }
  if (gTreeView.getLevel(1) != 1) {
    view_throw("second message should be at level 1");
  }
  if (gTreeView.getLevel(2) != 2) {
    view_throw("third message should be at level 2");
  }
  test_threading_levels();
}

async function test_group_sort_collapseAll_expandAll_threading() {
  // - start with an empty folder
  gTestFolder = await messageInjection.makeEmptyFolder();

  // - create a normal unthreaded view
  setup_view("threaded", 0);

  // - ensure it's empty
  assert_view_empty();

  // - add 3 messages:
  // msg1: from A, custom column val A, to be starred
  // msg2: from A, custom column val A
  // msg3: from B, custom column val B
  const [smsg1] = await make_and_add_message({ from: ["A", "A@a.invalid"] });
  await make_and_add_message({ from: ["A", "A@a.invalid"] });
  const [smsg3] = await make_and_add_message({ from: ["B", "B@b.invalid"] });

  assert_view_row_count(3);
  gDBView.getMsgHdrAt(0).markFlagged(true);
  if (!gDBView.getMsgHdrAt(0).isFlagged) {
    view_throw("Expected smsg1 to be flagged");
  }

  // - create grouped view; open folder in byFlagged AZ sort
  setup_group_view(
    Ci.nsMsgViewSortType.byFlagged,
    Ci.nsMsgViewSortOrder.ascending,
    gTestFolder
  );
  // - make sure there are 5 rows; index 0 and 2 are dummy, 1 is flagged message,
  //   3-4 are messages
  assert_view_row_count(5);
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1);
  assert_view_message_at_indices(smsg1, 1);
  if (!gDBView.getMsgHdrAt(1).isFlagged) {
    view_throw("Expected grouped smsg1 to be flagged");
  }
  assert_view_index_is_dummy(2);
  assert_view_index_is_not_dummy(3);
  assert_view_index_is_not_dummy(4);

  // - collapse the grouped threads; there should be 2 dummy rows
  gDBView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
  assert_view_row_count(2);
  assert_view_index_is_dummy(0);
  assert_view_index_is_dummy(1);

  // - expand the grouped threads; there should be 5 rows
  gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);
  assert_view_row_count(5);
  assert_view_index_is_dummy(0);
  assert_view_index_is_dummy(2);

  // - reverse sort; create grouped view; open folder in byFlagged ZA sort
  setup_group_view(
    Ci.nsMsgViewSortType.byFlagged,
    Ci.nsMsgViewSortOrder.descending,
    gTestFolder
  );
  // - make sure there are 5 rows; index 0 and 3 are dummy, 1-2 are messages,
  //   4 is flagged message
  assert_view_row_count(5);
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1);
  assert_view_index_is_not_dummy(2);
  assert_view_index_is_dummy(3);
  assert_view_index_is_not_dummy(4);
  assert_view_message_at_indices(smsg1, 4);
  if (!gDBView.getMsgHdrAt(4).isFlagged) {
    view_throw("Expected reverse sorted grouped smsg1 to be flagged");
  }

  // - test grouped by custom column; the custCol is first letter of author
  // - create grouped view; open folder in byCustom ZA sort
  setup_group_view(
    Ci.nsMsgViewSortType.byCustom,
    Ci.nsMsgViewSortOrder.descending,
    gTestFolder
  );

  // - make sure there are 5 rows; index 0 and 2 are dummy, 1 is B value message,
  //   3-4 are messages with A value
  assert_view_row_count(5);
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1);
  assert_view_message_at_indices(smsg3, 1);
  if (
    authorFirstLetterCustomColumn.getSortStringForRow(gDBView.getMsgHdrAt(1)) !=
    "B"
  ) {
    view_throw(
      "Expected grouped by custom column, ZA sortOrder smsg3 value to be B"
    );
  }
  assert_view_index_is_dummy(2);
  assert_view_index_is_not_dummy(3);
  assert_view_index_is_not_dummy(4);
  if (
    authorFirstLetterCustomColumn.getSortStringForRow(gDBView.getMsgHdrAt(4)) !=
    "A"
  ) {
    view_throw(
      "Expected grouped by custom column, ZA sortOrder smsg2 value to be A"
    );
  }
}

async function test_group_dummies_under_mutation_by_date() {
  // - start with an empty folder
  gTestFolder = await messageInjection.makeEmptyFolder();

  // - create the view
  setup_view("group", Ci.nsMsgViewFlagsType.kGroupBySort);
  gDBView.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.ascending);

  // - ensure it's empty
  assert_view_empty();

  // - add a message from this week
  // (we want to make sure all the messages end up in the same bucket and that
  //  the current day changing as we run the test does not change buckets
  //  either. bucket 1 is same day, bucket 2 is yesterday, bucket 3 is last
  //  week, so 2 days ago or older is always last week, even if we roll over
  //  and it becomes 3 days ago.)
  const [smsg, synSet] = await make_and_add_message({
    age: { days: 2, hours: 1 },
  });

  // - make sure the message and a dummy appear
  assert_view_row_count(2);
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1);
  assert_view_message_at_indices(smsg, 0, 1);

  // we used to display total in tag column - make sure we don't do that.
  if (gDBView.cellTextForColumn(0, "tags") != "") {
    view_throw("tag column shouldn't display total count in group view");
  }

  // - move the messages to the trash
  await messageInjection.trashMessages(synSet);

  // - make sure the message and dummy disappear
  assert_view_empty();

  // - add two messages from this week (same date bucket concerns)
  const [newer, newerSet] = await make_and_add_message({
    age: { days: 2, hours: 1 },
  });
  const [older] = await make_and_add_message({ age: { days: 2, hours: 2 } });

  // - sanity check addition
  assert_view_row_count(3); // 2 messages + 1 dummy
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1, 2);
  // the dummy should be based off the older guy
  assert_view_message_at_indices(older, 0, 1);
  assert_view_message_at_indices(newer, 2);

  // - delete the message right under the dummy
  // (this will be the newer one)
  await messageInjection.trashMessages(newerSet);

  // - ensure we still have the dummy and the right child node
  assert_view_row_count(2);
  assert_view_index_is_dummy(0);
  assert_view_index_is_not_dummy(1);
  // now the dummy should be based off the remaining older one
  assert_view_message_at_indices(older, 0, 1);
}

async function test_xfvf_threading() {
  // - start with an empty folder
  const save_gTestFolder = gTestFolder;
  gTestFolder = await messageInjection.makeEmptyFolder();

  let messages = [];
  // Add messages such that ancestors arrive after their descendants in
  // various interesting ways.
  // build a hierarchy like this (the UID order corresponds to the date order)
  //   3
  //    1
  //     4
  //      2
  //     5
  const msg3 = gMessageGenerator.makeMessage({ age: { days: 2, hours: 5 } });
  const msg1 = gMessageGenerator.makeMessage({
    age: { days: 2, hours: 4 },
    inReplyTo: msg3,
  });
  const msg4 = gMessageGenerator.makeMessage({
    age: { days: 2, hours: 3 },
    inReplyTo: msg1,
  });
  const msg2 = gMessageGenerator.makeMessage({
    age: { days: 2, hours: 1 },
    inReplyTo: msg4,
  });
  const msg5 = gMessageGenerator.makeMessage({
    age: { days: 2, hours: 2 },
    inReplyTo: msg1,
  });
  messages = messages.concat([msg1, msg2, msg3, msg4, msg5]);

  const msgSet = new SyntheticMessageSet(messages);

  gTestFolder = await messageInjection.makeEmptyFolder();

  // - create the view
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);
  setup_view("xfvf", Ci.nsMsgViewFlagsType.kThreadedDisplay);
  assert_view_row_count(5);
  gDBView.toggleOpenState(0);
  gDBView.toggleOpenState(0);

  assert_view_message_at_indices(msg3, 0);
  assert_view_message_at_indices(msg1, 1);
  assert_view_message_at_indices(msg4, 2);
  assert_view_message_at_indices(msg2, 3);
  assert_view_message_at_indices(msg5, 4);
  assert_view_level_is(0, 0);
  assert_view_level_is(1, 1);
  assert_view_level_is(2, 2);
  assert_view_level_is(3, 3);
  assert_view_level_is(4, 2);
  gTestFolder = save_gTestFolder;
}

/*
 * Tests the sorting order of collapsed threads, not of messages within
 * threads. Currently limited to testing the sort-threads-by-date case,
 * sorting both by thread root and by newest message.
 */
async function test_thread_sorting() {
  const save_gTestFolder = gTestFolder;
  gTestFolder = await messageInjection.makeEmptyFolder();
  let messages = [];
  // build a hierarchy like this (the UID order corresponds to the date order)
  //  1
  //   4
  //  2
  //   5
  //  3
  const msg1 = gMessageGenerator.makeMessage({ age: { days: 1, hours: 10 } });
  const msg2 = gMessageGenerator.makeMessage({ age: { days: 1, hours: 9 } });
  const msg3 = gMessageGenerator.makeMessage({ age: { days: 1, hours: 8 } });
  const msg4 = gMessageGenerator.makeMessage({
    age: { days: 1, hours: 7 },
    inReplyTo: msg1,
  });
  const msg5 = gMessageGenerator.makeMessage({
    age: { days: 1, hours: 6 },
    inReplyTo: msg2,
  });
  messages = messages.concat([msg1, msg2, msg3, msg4, msg5]);

  const msgSet = new SyntheticMessageSet(messages);

  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);

  // test the non-default pref state first, so the pref gets left with its
  // default value at the end
  Services.prefs.setBoolPref("mailnews.sort_threads_by_root", true);
  gDBView.open(
    gTestFolder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    {}
  );

  assert_view_row_count(3);
  assert_view_message_at_indices(msg1, 0);
  assert_view_message_at_indices(msg2, 1);
  assert_view_message_at_indices(msg3, 2);

  gDBView.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
  assert_view_message_at_indices(msg3, 0);
  assert_view_message_at_indices(msg2, 1);
  assert_view_message_at_indices(msg1, 2);

  Services.prefs.clearUserPref("mailnews.sort_threads_by_root");
  gDBView.open(
    gTestFolder,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    {}
  );

  assert_view_row_count(3);
  assert_view_message_at_indices(msg3, 0);
  assert_view_message_at_indices(msg1, 1);
  assert_view_message_at_indices(msg2, 2);

  gDBView.sort(Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending);
  assert_view_message_at_indices(msg2, 0);
  assert_view_message_at_indices(msg1, 1);
  assert_view_message_at_indices(msg3, 2);

  gDBView.close();
  gTestFolder = save_gTestFolder;
}

const VIEW_TYPES = [
  ["threaded", Ci.nsMsgViewFlagsType.kThreadedDisplay],
  ["quicksearch", Ci.nsMsgViewFlagsType.kThreadedDisplay],
  ["search", Ci.nsMsgViewFlagsType.kThreadedDisplay],
  ["search", Ci.nsMsgViewFlagsType.kGroupBySort],
  ["xfvf", Ci.nsMsgViewFlagsType.kNone],
  // group does unspeakable things to gTestFolder, so put it last.
  ["group", Ci.nsMsgViewFlagsType.kGroupBySort],
];

/**
 * These are tests which are for every test configuration.
 */
function tests_for_all_views() {
  test_sort_columns();
  test_number_of_messages();
  test_selected_messages();
}

add_setup(function () {
  gMessages = setup_messages();
});

add_task(async function test_threaded() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[0];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for threaded.
  test_expand_collapse();
  await test_thread_sorting();
});

add_task(async function test_quicksearch_threaded() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[1];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for quicksearch threaded.
  test_qs_results();
});

add_task(async function test_search_threaded() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[2];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for search threaded.
  await test_msg_added_to_search_view();
});

add_task(async function test_search_group_by_sort() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[3];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for search group by sort.
  await test_msg_added_to_search_view();
});

add_task(async function test_xfvf() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[4];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for xfvf.
  await test_xfvf_threading();
});

add_task(async function test_group() {
  await set_gTestFolder(gMessages);
  const [view_type, view_flag] = VIEW_TYPES[5];
  setup_view(view_type, view_flag);

  tests_for_all_views();

  // Specific tests for group.
  await test_group_sort_collapseAll_expandAll_threading;
  await test_group_dummies_under_mutation_by_date;
});

add_task(function test_teardown() {
  // Delete view reference to avoid a cycle leak.
  gFakeSelection.view = null;
});
