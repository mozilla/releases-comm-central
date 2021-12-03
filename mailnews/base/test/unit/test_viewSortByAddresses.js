/*
 * Attempt to test nsMsgDBView's handling of sorting by sender/recipients
 * when using a display name from the address book.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/messageModifier.js */
/* import-globals-from ../../../test/resources/messageInjection.js */
/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/messageModifier.js");
load("../../../resources/messageInjection.js");
load("../../../resources/abSetup.js");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gMessageGenerator = new MessageGenerator();

Services.prefs.setBoolPref("mail.showCondensedAddresses", true);

var gTestFolder;

// Setup the display name to be opposite of alphabetic order of e-mail address.
var cards = [
  { email: "aaa@b.invalid", displayName: "4" },
  { email: "ccc@d.invalid", displayName: "3" },
  { email: "eee@f.invalid", displayName: "2" },
  { email: "ggg@h.invalid", displayName: "1" },
];

function run_test() {
  configure_message_injection({ mode: "local" });

  // Ensure all the directories are initialised.
  MailServices.ab.directories;

  let ab = MailServices.ab.getDirectory(kPABData.URI);

  function createAndAddCard(element) {
    var card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );

    card.primaryEmail = element.email;
    card.displayName = element.displayName;

    ab.addCard(card);
  }

  // Add address to addressbook so we can set display name and verify that
  // the view uses the display name for display and sorting.
  cards.forEach(createAndAddCard);

  // build up a couple message with addresses in the ab.
  let messages = [];
  messages = messages.concat(
    gMessageGenerator.makeMessage({
      from: ["aaa", "aaa@b.invalid"],
      to: [["ccc", "ccc@d.invalid"]],
    })
  );
  messages = messages.concat(
    gMessageGenerator.makeMessage({
      from: ["eee", "eee@f.invalid"],
      to: [["ggg", "ggg@h.invalid"]],
    })
  );

  let msgSet = new SyntheticMessageSet(messages);

  do_test_pending();

  gTestFolder = make_empty_folder();
  add_sets_to_folders(gTestFolder, [msgSet]);
  // - create the view
  setup_view("threaded", Ci.nsMsgViewFlagsType.kNone);
  // Check that sorting by sender uses the display name
  gDBView.sort(Ci.nsMsgViewSortType.byAuthor, Ci.nsMsgViewSortOrder.ascending);
  let sender1 = gDBView.cellTextForColumn(0, "senderCol");
  let sender2 = gDBView.cellTextForColumn(1, "senderCol");

  if (sender1 != 2) {
    view_throw("expected sender 1 to be 2");
  }
  if (sender2 != 4) {
    view_throw("expected sender 2 to be 4");
  }

  gDBView.sort(
    Ci.nsMsgViewSortType.byRecipient,
    Ci.nsMsgViewSortOrder.ascending
  );
  let recip1 = gDBView.cellTextForColumn(0, "recipientCol");
  let recip2 = gDBView.cellTextForColumn(1, "recipientCol");

  if (recip1 != 1) {
    view_throw("expected recip 1 to be 1");
  }
  if (recip2 != 3) {
    view_throw("expected recip 2 to be 3");
  }

  do_test_finished();
}

var gCommandUpdater = {
  updateCommandStatus() {
    // the back end is smart and is only telling us to update command status
    // when the # of items in the selection has actually changed.
  },

  displayMessageChanged(aFolder, aSubject, aKeywords) {},

  updateNextMessageAfterDelete() {},
  summarizeSelection() {
    return false;
  },
};

var WHITESPACE = "                                              ";
/**
 * Print out the current db view as best we can.
 */
function dump_view_contents() {
  dump("********* Current View State\n");
  for (let iViewIndex = 0; iViewIndex < gTreeView.rowCount; iViewIndex++) {
    let level = gTreeView.getLevel(iViewIndex);
    let flags = gDBView.getFlagsAt(iViewIndex);

    let s = WHITESPACE.substr(0, level * 2);
    if (gTreeView.isContainer(iViewIndex)) {
      s += gTreeView.isContainerOpen(iViewIndex) ? "- " : "+ ";
    } else {
      s += ". ";
    }
    let MSG_VIEW_FLAG_DUMMY = 0x20000000;
    if (flags & MSG_VIEW_FLAG_DUMMY) {
      s += "dummy: ";
    }
    s +=
      gDBView.cellTextForColumn(iViewIndex, "subjectCol") +
      " " +
      gDBView.cellTextForColumn(iViewIndex, "senderCol");

    dump(s + "\n");
  }
  dump("********* end view state\n");
}

function view_throw(why) {
  dump_view_contents();
  do_throw(why);
}
var gDBView;
var gTreeView;

function setup_view(aViewType, aViewFlags, aTestFolder) {
  let dbviewContractId = "@mozilla.org/messenger/msgdbview;1?type=" + aViewType;

  if (aTestFolder == null) {
    aTestFolder = gTestFolder;
  }

  // always start out fully expanded
  aViewFlags |= Ci.nsMsgViewFlagsType.kExpandAll;

  gDBView = Cc[dbviewContractId].createInstance(Ci.nsIMsgDBView);
  gDBView.init(null, null, gCommandUpdater);
  var outCount = {};
  gDBView.open(
    aViewType != "search" ? aTestFolder : null,
    Ci.nsMsgViewSortType.byDate,
    aViewType != "search"
      ? Ci.nsMsgViewSortOrder.ascending
      : Ci.nsMsgViewSortOrder.descending,
    aViewFlags,
    outCount
  );
  dump("  View Out Count: " + outCount.value + "\n");

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);
}
