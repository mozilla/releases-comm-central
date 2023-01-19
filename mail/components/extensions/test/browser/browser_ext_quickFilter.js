/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let messages;
let about3Pane = document.getElementById("tabmail").currentAbout3Pane;

add_setup(async () => {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);

  // Modify the messages so the filters can be checked against them.

  messages = [...subFolders[0].messages];
  messages[0].markRead(true);
  messages[2].markRead(true);
  messages[4].markRead(true);
  messages[6].markRead(true);
  messages[8].markRead(true);
  messages[1].markFlagged(true);
  messages[6].markFlagged(true);
  messages[0].setStringProperty("keywords", "$label1");
  messages[1].setStringProperty("keywords", "$label2");
  messages[3].setStringProperty("keywords", "$label1 $label2");
  messages[5].setStringProperty("keywords", "$label2");
  messages[6].setStringProperty("keywords", "$label1");
  messages[7].setStringProperty("keywords", "$label2 $label3");
  messages[8].setStringProperty("keywords", "$label3");
  messages[9].setStringProperty("keywords", "$label1 $label2 $label3");
  messages[9].markHasAttachments(true);

  // Add an author to the address book.

  let author = messages[7].author.replace(/["<>]/g, "").split(" ");
  let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.setProperty("FirstName", author[0]);
  card.setProperty("LastName", author[1]);
  card.setProperty("DisplayName", `${author[0]} ${author[1]}`);
  card.setProperty("PrimaryEmail", author[2]);
  let ab = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  let addedCard = ab.addCard(card);

  about3Pane.displayFolder(subFolders[0]);

  registerCleanupFunction(() => {
    ab.deleteCards([addedCard]);
  });
});

add_task(async () => {
  async function background() {
    browser.mailTabs.setQuickFilter({ unread: true });
    await window.sendMessage("checkVisible", 1, 3, 5, 7, 9);

    browser.mailTabs.setQuickFilter({ flagged: true });
    await window.sendMessage("checkVisible", 1, 6);

    browser.mailTabs.setQuickFilter({ flagged: true, unread: true });
    await window.sendMessage("checkVisible", 1);

    browser.mailTabs.setQuickFilter({ tags: true });
    await window.sendMessage("checkVisible", 0, 1, 3, 5, 6, 7, 8, 9);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label1: true } },
    });
    await window.sendMessage("checkVisible", 0, 3, 6, 9);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label2: true } },
    });
    await window.sendMessage("checkVisible", 1, 3, 5, 7, 9);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label1: true, $label2: true } },
    });
    await window.sendMessage("checkVisible", 0, 1, 3, 5, 6, 7, 9);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "all", tags: { $label1: true, $label2: true } },
    });
    await window.sendMessage("checkVisible", 3, 9);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "all", tags: { $label1: true, $label2: false } },
    });
    await window.sendMessage("checkVisible", 0, 6);

    browser.mailTabs.setQuickFilter({ attachment: true });
    await window.sendMessage("checkVisible", 9);

    browser.mailTabs.setQuickFilter({ attachment: false });
    await window.sendMessage("checkVisible", 0, 1, 2, 3, 4, 5, 6, 7, 8);

    browser.mailTabs.setQuickFilter({ contact: true });
    await window.sendMessage("checkVisible", 7);

    browser.mailTabs.setQuickFilter({ contact: false });
    await window.sendMessage("checkVisible", 0, 1, 2, 3, 4, 5, 6, 8, 9);

    browser.test.notifyPass("quickFilter");
  }

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkVisible", async (...expected) => {
    let actual = [];
    let dbView = about3Pane.gDBView;
    for (let i = 0; i < dbView.numMsgsInView; i++) {
      actual.push(messages.indexOf(dbView.getMsgHdrAt(i)));
    }

    Assert.deepEqual(actual, expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("quickFilter");
  await extension.unload();
});
