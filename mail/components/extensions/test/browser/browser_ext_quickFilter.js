/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let messages;
const about3Pane = document.getElementById("tabmail").currentAbout3Pane;

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);

  // Modify the messages so the filters can be checked against them.

  messages = [...subFolders[0].messages];
  messages.at(-1).markRead(true);
  messages.at(-3).markRead(true);
  messages.at(-5).markRead(true);
  messages.at(-7).markRead(true);
  messages.at(-9).markRead(true);
  messages.at(-2).markFlagged(true);
  messages.at(-7).markFlagged(true);
  messages.at(-1).setStringProperty("keywords", "$label1");
  messages.at(-2).setStringProperty("keywords", "$label2");
  messages.at(-4).setStringProperty("keywords", "$label1 $label2");
  messages.at(-6).setStringProperty("keywords", "$label2");
  messages.at(-7).setStringProperty("keywords", "$label1");
  messages.at(-8).setStringProperty("keywords", "$label2 $label3");
  messages.at(-9).setStringProperty("keywords", "$label3");
  messages.at(0).setStringProperty("keywords", "$label1 $label2 $label3");
  messages.at(0).markHasAttachments(true);

  // Add an author to the address book.

  const author = messages.at(-8).author.replace(/["<>]/g, "").split(" ");
  const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.setProperty("FirstName", author[0]);
  card.setProperty("LastName", author[1]);
  card.setProperty("DisplayName", `${author[0]} ${author[1]}`);
  card.setProperty("PrimaryEmail", author[2]);
  const ab = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const addedCard = ab.addCard(card);

  about3Pane.displayFolder(subFolders[0]);

  registerCleanupFunction(() => {
    ab.deleteCards([addedCard]);
  });
});

add_task(async () => {
  async function background() {
    browser.mailTabs.setQuickFilter({ unread: true });
    await window.sendMessage("checkVisible", 8, 6, 4, 2, 0);

    browser.mailTabs.setQuickFilter({ flagged: true });
    await window.sendMessage("checkVisible", 8, 3);

    browser.mailTabs.setQuickFilter({ flagged: true, unread: true });
    await window.sendMessage("checkVisible", 8);

    browser.mailTabs.setQuickFilter({ tags: true });
    await window.sendMessage("checkVisible", 9, 8, 6, 4, 3, 2, 1, 0);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label1: true } },
    });
    await window.sendMessage("checkVisible", 9, 6, 3, 0);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label2: true } },
    });
    await window.sendMessage("checkVisible", 8, 6, 4, 2, 0);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "any", tags: { $label1: true, $label2: true } },
    });
    await window.sendMessage("checkVisible", 9, 8, 6, 4, 3, 2, 0);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "all", tags: { $label1: true, $label2: true } },
    });
    await window.sendMessage("checkVisible", 6, 0);

    browser.mailTabs.setQuickFilter({
      tags: { mode: "all", tags: { $label1: true, $label2: false } },
    });
    await window.sendMessage("checkVisible", 9, 3);

    browser.mailTabs.setQuickFilter({ attachment: true });
    await window.sendMessage("checkVisible", 0);

    browser.mailTabs.setQuickFilter({ attachment: false });
    await window.sendMessage("checkVisible", 9, 8, 7, 6, 5, 4, 3, 2, 1);

    browser.mailTabs.setQuickFilter({ contact: true });
    await window.sendMessage("checkVisible", 2);

    browser.mailTabs.setQuickFilter({ contact: false });
    await window.sendMessage("checkVisible", 9, 8, 7, 6, 5, 4, 3, 1, 0);

    browser.test.notifyPass("quickFilter");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkVisible", async (...expected) => {
    const actual = [];
    const dbView = about3Pane.gDBView;
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
