/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let gAccount, gMessages, gAbout3Pane, gAboutMessage;

// Mock the prompt service. We're going to be asked if we're sure
// we want to remove a contact, so let's say yes.

/** @implements {nsIPromptService} */
const mockPromptService = {
  confirm() {
    return true;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
};

add_setup(async () => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  await createMessages(subFolders[0], 10);
  gMessages = subFolders[0].messages;

  gAbout3Pane = document.getElementById("tabmail").currentAbout3Pane;
  gAbout3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: subFolders[0],
    messagePaneVisible: true,
  });
  gAbout3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(
    gAbout3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );

  // Disable animations on the panel, so that we don't have to deal with
  // async openings. The panel is lazy-loaded, so it needs to be referenced
  // this way rather than finding it in the DOM.
  gAboutMessage = document.getElementById("tabmail").currentAboutMessage;
  gAboutMessage.editContactInlineUI.panel.setAttribute("animate", false);

  // Mock prompt service.
  const originalPromptService = Services.prompt;
  Services.prompt = mockPromptService;

  registerCleanupFunction(async () => {
    // Restore prompt service.
    Services.prompt = originalPromptService;
    // Restore animation to the contact panel.
    gAboutMessage.document
      .getElementById("editContactPanel")
      .removeAttribute("animate");
  });
});

add_task(async function test_moving_contact_bug_1742904() {
  const files = {
    "background.js": async () => {
      // Create a new test address book.
      const testAbId = await browser.addressBooks.create({ name: "testAB" });

      // Keep track of UIDs (they should all be unique).
      const UUIDS = new Set();

      // Select a message.
      const { messages } = await browser.messages.query();
      browser.test.assertEq(
        10,
        messages.length,
        "Should have found the correct number of messages"
      );
      const display_promise = new Promise(resolve => {
        const onDisplayed = (tab, list) => {
          if (list.messages.some(m => m.id == messages[0].id)) {
            browser.messageDisplay.onMessagesDisplayed.removeListener(
              onDisplayed
            );
            resolve();
          }
        };
        browser.messageDisplay.onMessagesDisplayed.addListener(onDisplayed);
      });
      await browser.mailTabs.setSelectedMessages([messages[0].id]);
      await display_promise;

      // Repeat the STR from Bug 1742904 multiple times.
      const STR_RUNS = 4;
      for (let i = 0; i < STR_RUNS; i++) {
        // Wait for the widget being used to create a new contact from the recipient
        // of the selected message.
        const create_promise = new Promise(resolve => {
          const onCreated = node => {
            browser.addressBooks.contacts.onCreated.removeListener(onCreated);
            resolve(node);
          };
          browser.addressBooks.contacts.onCreated.addListener(onCreated);
        });
        await window.sendMessage("create");
        const node1 = await create_promise;
        browser.test.assertFalse(
          UUIDS.has(node1.id),
          "Created node should have a unique UUID"
        );
        UUIDS.add(node1.id);
        browser.test.assertTrue(
          node1.vCard.includes("FN:Bob Bell"),
          "Should have seen the correct contact"
        );

        // Try to access the created contact with browser.addressBooks.contacts.get().
        const node2 = await browser.addressBooks.contacts.get(node1.id);
        window.assertDeepEqual(
          node1,
          node2,
          "The created contact should have been returned by contacts.get()",
          { strict: true }
        );

        // Wait for the widget being used to move the contact to the test address
        // book.
        const move_promise = new Promise(resolve => {
          let createdNode = null;
          let deletedNode = null;
          const onCreated = node => {
            browser.test.assertEq(
              testAbId,
              node.parentId,
              "Should have seen a contact created in the test AB"
            );
            browser.addressBooks.contacts.onCreated.removeListener(onCreated);
            createdNode = node;
            if (createdNode && deletedNode) {
              resolve(createdNode);
            }
          };
          const onDeleted = (parentId, nodeId) => {
            browser.test.assertEq(
              node1.id,
              nodeId,
              "Should have seen the correct contact being deleted"
            );
            browser.test.assertEq(
              node1.parentId,
              parentId,
              "Should have seen the contact being deleted from the correct address book"
            );
            browser.addressBooks.contacts.onDeleted.removeListener(onDeleted);
            deletedNode = nodeId;
            if (createdNode && deletedNode) {
              resolve(createdNode);
            }
          };
          browser.addressBooks.contacts.onDeleted.addListener(onDeleted);
          browser.addressBooks.contacts.onCreated.addListener(onCreated);
        });
        await window.sendMessage("move");
        const node3 = await move_promise;
        browser.test.assertFalse(
          UUIDS.has(node3.id),
          "Created node should have a unique UUID"
        );
        UUIDS.add(node3.id);
        browser.test.assertTrue(
          node3.vCard.includes("FN:Bob Bell"),
          "Should have seen the correct contact"
        );

        // Try to access the moved contact with browser.addressBooks.contacts.get().
        const node4 = await browser.addressBooks.contacts.get(node3.id);
        window.assertDeepEqual(
          node3,
          node4,
          "The moved contact should have been returned by contacts.get()",
          { strict: true }
        );

        // Wait for the widget being used to removed the contact from the testAB.
        const delete_promise = new Promise(resolve => {
          const onDeleted = (parentId, nodeId) => {
            browser.test.assertEq(
              node3.id,
              nodeId,
              "Should have seen the correct contact being deleted"
            );
            browser.test.assertEq(
              testAbId,
              parentId,
              "Should have seen the contact being deleted from the test address book"
            );
            browser.addressBooks.contacts.onDeleted.removeListener(onDeleted);
            resolve();
          };
          browser.addressBooks.contacts.onDeleted.addListener(onDeleted);
        });
        await window.sendMessage("delete");
        await delete_promise;
      }

      browser.test.assertEq(
        STR_RUNS * 2,
        UUIDS.size,
        "Number of found unique contact ids should be correct"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks", "messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("create", () => {
    const doc = gAboutMessage.document;
    doc.querySelector("#expandedtoRow .recipient-address-book-button").click();
    extension.sendMessage();
  });

  extension.onMessage("move", async () => {
    // Ensure that the inline contact editing panel is not open.
    const doc = gAboutMessage.document;
    const contactPanel = doc.getElementById("editContactPanel");
    Assert.notEqual(contactPanel.state, "open");

    // Click the ab indicator and wait for the panel to open.
    const panelOpened = TestUtils.waitForCondition(
      () => contactPanel.state == "open",
      "The contactPanel was opened"
    );
    doc.querySelector("#expandedtoRow .recipient-address-book-button").click();
    await panelOpened;

    // Change the ab selection, click the done button and wait for the panel to
    // close.
    doc.querySelector("#editContactAddressBookList").selectedIndex = 1;
    doc.querySelector("#editContactPanelDoneButton").click();
    await TestUtils.waitForCondition(
      () => contactPanel.state == "closed",
      "The contactPanel was closed"
    );
    extension.sendMessage();
  });

  extension.onMessage("delete", async () => {
    // Ensure that the inline contact editing panel is not open
    const doc = gAboutMessage.document;
    const contactPanel = doc.getElementById("editContactPanel");
    Assert.notEqual(contactPanel.state, "open");

    // Click the ab indicator and wait for the panel to open.
    const panelOpened = TestUtils.waitForCondition(
      () => contactPanel.state == "open",
      "The contactPanel was opened"
    );
    doc.querySelector("#expandedtoRow .recipient-address-book-button").click();
    await panelOpened;

    // Click the delete button and wait for the panel to close.
    doc.querySelector("#editContactPanelDeleteContactButton").click();
    await TestUtils.waitForCondition(
      () => contactPanel.state == "closed",
      "The contactPanel was closed"
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
