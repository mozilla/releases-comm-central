/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Attempt to test nsMsgDBView's handling of sorting by sender/recipients
 * when using a display name from the address book.
 */

/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { dump_view_contents } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ViewHelpers.sys.mjs"
);

var gMessageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });

Services.prefs.setBoolPref("mail.showCondensedAddresses", true);

var gTestFolder;

// Setup the display name to be opposite of alphabetic order of e-mail address.
var cards = [
  { email: "aaa@b.invalid", displayName: "4" },
  { email: "ccc@d.invalid", displayName: "3" },
  { email: "eee@f.invalid", displayName: "2" },
  { email: "ggg@h.invalid", displayName: "1" },
];

add_setup(async function () {
  // Ensure all the directories are initialised.
  MailServices.ab.directories;

  const ab = MailServices.ab.getDirectory(kPABData.URI);

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

  const msgSet = new SyntheticMessageSet(messages);
  gTestFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([gTestFolder], [msgSet]);
});

add_task(function test_view_sort_by_addresses() {
  // - create the view
  setup_view("threaded", Ci.nsMsgViewFlagsType.kNone);
  // Check that sorting by sender uses the display name
  gDBView.sort(Ci.nsMsgViewSortType.byAuthor, Ci.nsMsgViewSortOrder.ascending);
  const sender1 = gDBView.cellTextForColumn(0, "senderCol");
  const sender2 = gDBView.cellTextForColumn(1, "senderCol");

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
  const recip1 = gDBView.cellTextForColumn(0, "recipientCol");
  const recip2 = gDBView.cellTextForColumn(1, "recipientCol");

  if (recip1 != 1) {
    view_throw("expected recip 1 to be 1");
  }
  if (recip2 != 3) {
    view_throw("expected recip 2 to be 3");
  }
});

function view_throw(why) {
  dump_view_contents();
  do_throw(why);
}
var gDBView;
var gTreeView;

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

  gTreeView = gDBView.QueryInterface(Ci.nsITreeView);
}
