/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests the selection of a virtual folder's searched folders.
 */

var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const context = about3Pane.document.getElementById("folderPaneContext");

let rootFolder, wrappedVirtual, virtualFolder, first, second, third, fourth;

add_setup(async function () {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  rootFolder = localAccount.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  first = rootFolder.createLocalSubfolder("first");
  second = rootFolder.createLocalSubfolder("second");
  third = rootFolder.createLocalSubfolder("third");
  third.QueryInterface(Ci.nsIMsgLocalMailFolder);
  fourth = third.createLocalSubfolder("fourth");

  wrappedVirtual = VirtualFolderHelper.createNewVirtualFolder(
    "virtual",
    rootFolder,
    [first, second],
    "ALL",
    false
  );
  virtualFolder = wrappedVirtual.virtualFolder;

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "localhost",
    "pop3"
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
  });
});

add_task(async function () {
  const virtualPropsPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const chosenFoldersCount = doc.getElementById("chosenFoldersCount");
        const folderListButton = doc.getElementById("folderListPicker");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        if (doc.hasPendingL10nMutations) {
          await BrowserTestUtils.waitForEvent(doc, "L10nMutationsFinished");
        }

        Assert.equal(chosenFoldersCount.textContent, "2 folders chosen");

        // Open the folder selection dialog.
        folderListButton.click();
        await folderSelectionPromise;
        await SimpleTest.promiseFocus(win);

        Assert.equal(chosenFoldersCount.textContent, "3 folders chosen");

        acceptButton.click();
      },
    }
  );
  const folderSelectionPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/virtualFolderListEdit.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);
        await new Promise(resolve => win.requestAnimationFrame(resolve));

        const doc = win.document;
        const tree = doc.getElementById("folderPickerTree");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        // Check the initial state.
        Assert.equal(tree.view.rowCount, 7);
        Assert.ok(
          !tree.view.isContainerOpen(0),
          "pop3 root folder should not be open"
        );
        Assert.ok(
          tree.view.isContainerOpen(1),
          "local root folder should be open"
        );
        Assert.ok(
          !tree.view.isContainerOpen(6),
          "unselected folder should not be open"
        );
        tree.view.toggleOpenState(6); // Open "third" folder.
        Assert.equal(tree.view.rowCount, 8);
        await new Promise(resolve => win.requestAnimationFrame(resolve));

        Assert.equal(tree.view.getCellText(0, "name"), "nobody on localhost");
        Assert.equal(tree.view.getCellText(1, "name"), "Local Folders");
        Assert.equal(tree.view.getCellText(2, "name"), "Trash");
        Assert.equal(tree.view.getCellText(3, "name"), "Outbox");
        Assert.equal(tree.view.getCellText(4, "name"), "first");
        Assert.equal(tree.view.getCellText(5, "name"), "second");
        Assert.equal(tree.view.getCellText(6, "name"), "third");
        Assert.equal(tree.view.getCellText(7, "name"), "fourth");

        // Check the initial selection.
        const isSelected = index =>
          tree.view.rowAt(index).hasProperty("checked") &&
          tree.getRowAtIndex(index).querySelector("input").checked;
        Assert.ok(!isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(!isSelected(3));
        Assert.ok(isSelected(4));
        Assert.ok(isSelected(5));
        Assert.ok(!isSelected(6));
        Assert.ok(!isSelected(7));

        // Change the selection by clicking on a check box.
        await BrowserTestUtils.waitForMutationCondition(
          tree.table.body,
          { subtree: true, childList: true },
          () => tree.table.body.rows[4].querySelector('input[type="checkbox"]')
        );
        EventUtils.synthesizeMouseAtCenter(
          tree.table.body.rows[4].querySelector('input[type="checkbox"]'),
          {},
          win
        );
        // ... and using the keyboard.
        tree.table.body.rows[6].querySelector('input[type="checkbox"]').focus();
        EventUtils.synthesizeKey(" ", {}, win);
        EventUtils.synthesizeKey("KEY_Tab", {}, win);
        EventUtils.synthesizeKey(" ", {}, win);

        // Check the changed selection.
        Assert.ok(!isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(!isSelected(3));
        Assert.ok(!isSelected(4));
        Assert.ok(isSelected(5));
        Assert.ok(isSelected(6));
        Assert.ok(isSelected(7));

        acceptButton.click();
      },
    }
  );

  // Check the state before we begin.
  Assert.equal(wrappedVirtual.searchString, `ALL`);
  Assert.equal(wrappedVirtual.searchFolderURIs, `${first.URI}|${second.URI}`);

  // Open the virtual folder properties dialog.
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderPane.getRowForFolder(virtualFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(
    about3Pane.document.getElementById("folderPaneContext-properties")
  );
  await BrowserTestUtils.waitForPopupEvent(context, "hidden");
  await virtualPropsPromise;

  // Check the state after we finish.
  Assert.equal(wrappedVirtual.searchString, `ALL`);
  Assert.equal(
    wrappedVirtual.searchFolderURIs,
    `${second.URI}|${third.URI}|${fourth.URI}`
  );
});

/**
 * Tests that the "Search online" checkbox in virtual folder properties
 * remembers its state across dialog opens (bug 2053894).
 */
add_task(async function test_searchOnline() {
  // Create an IMAP account. IMAP servers have offlineSupportLevel > 0, which
  // enables the "Search online" checkbox.
  const imapServer = MailServices.accounts
    .createIncomingServer("nobody", "imap.example.com", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = imapServer;
  const imapIdentity = MailServices.accounts.createIdentity();
  imapIdentity.email = "tinderbox@example.com";
  imapAccount.addIdentity(imapIdentity);

  const imapRootFolder = imapServer.rootFolder;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(imapAccount, false);
  });

  // Create a virtual folder that searches the IMAP root folder, with online
  // search initially enabled.
  const onlineWrapped = VirtualFolderHelper.createNewVirtualFolder(
    "onlineTest",
    rootFolder,
    [imapRootFolder],
    "ALL",
    true
  );
  const onlineVF = onlineWrapped.virtualFolder;

  // Helper: open the properties dialog via context menu.
  async function openPropertiesViaContextMenu(winCallback) {
    const virtualPropsPromise = BrowserTestUtils.promiseAlertDialog(
      undefined,
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      { callback: winCallback }
    );

    EventUtils.synthesizeMouseAtCenter(
      about3Pane.folderPane.getRowForFolder(onlineVF).querySelector(".name"),
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(context, "shown");
    context.activateItem(
      about3Pane.document.getElementById("folderPaneContext-properties")
    );
    await BrowserTestUtils.waitForPopupEvent(context, "hidden");
    await virtualPropsPromise;
  }

  // First open: checkbox should be enabled and checked.
  await openPropertiesViaContextMenu(async win => {
    await SimpleTest.promiseFocus(win);
    const doc = win.document;
    if (doc.hasPendingL10nMutations) {
      await BrowserTestUtils.waitForEvent(doc, "L10nMutationsFinished");
    }

    const checkbox = doc.getElementById("searchOnline");
    Assert.ok(
      !checkbox.disabled,
      "Search online should be enabled for IMAP search folders"
    );
    Assert.ok(
      checkbox.checked,
      "Search online should be checked when onlineSearch was set to true at creation"
    );

    doc.querySelector("dialog").getButton("accept").click();
  });

  // Second open: the checkbox should still be enabled and checked — it must not
  // have been reset by updateOnlineSearchState().
  await openPropertiesViaContextMenu(async win => {
    await SimpleTest.promiseFocus(win);
    const doc = win.document;
    if (doc.hasPendingL10nMutations) {
      await BrowserTestUtils.waitForEvent(doc, "L10nMutationsFinished");
    }

    const checkbox = doc.getElementById("searchOnline");
    Assert.ok(
      !checkbox.disabled,
      "Search online should still be enabled after reopening"
    );
    Assert.ok(
      checkbox.checked,
      "Search online should still be checked after reopening"
    );

    doc.querySelector("dialog").getButton("cancel").click();
  });
});

/**
 * Opens the saved-search dialog and waits for the callback to close it.
 *
 * @param {{folder: nsIMsgFolder, newFolderName?: string,
 *   editExistingFolder?: boolean}} args - Dialog arguments.
 * @param {function(Window): Promise<void>} callback - Interacts with the dialog.
 * @returns {Promise<void>} Resolves when the dialog closes.
 */
async function openVirtualFolderDialog(args, callback) {
  const url = "chrome://messenger/content/virtualFolderProperties.xhtml";
  const closed = BrowserTestUtils.promiseAlertDialog(undefined, url, {
    async callback(win) {
      registerCleanupFunction(() => {
        if (!win.closed) {
          win.close();
        }
      });
      await SimpleTest.promiseFocus(win);
      await callback(win);
    },
  });
  window.openDialog(
    url,
    "",
    "chrome,dialog,modal,centerscreen,resizable",
    args
  );
  await closed;
}

add_task(async function test_switchFromMatchAllMessages() {
  for (const mode of ["and", "or"]) {
    const name = `matchAllMessages-${mode}`;
    await openVirtualFolderDialog(
      { folder: first, newFolderName: name },
      async win => {
        win.document.getElementById("matchAllItem").click();
        win.document.querySelector("dialog").getButton("accept").click();
      }
    );
    const folder = first.getChildNamed(name);
    const wrapped = VirtualFolderHelper.wrapVirtualFolder(folder);
    const args = { folder, editExistingFolder: true };
    Assert.equal(
      wrapped.searchString,
      "ALL",
      "New search should match all messages"
    );

    await openVirtualFolderDialog(args, async win => {
      Assert.equal(
        win.document.getElementById("booleanAndGroup").value,
        "matchAll",
        "Reopened search should still match all messages"
      );
      win.document.querySelector("dialog").getButton("accept").click();
    });
    Assert.equal(
      wrapped.searchString,
      "ALL",
      "Saving without changes should preserve matching all messages"
    );

    await openVirtualFolderDialog(args, async win => {
      win.document.querySelector(`radio[value="${mode}"]`).click();
      win.document.querySelector("dialog").getButton("accept").click();
    });
    Assert.equal(
      wrapped.searchString,
      `${mode.toUpperCase()} (subject,contains,)`,
      "Switching match modes should save a valid blank Subject criterion"
    );

    await openVirtualFolderDialog(args, async win => {
      const doc = win.document;
      const attribute = doc.querySelector("search-attribute");
      const operator = doc.querySelector("search-operator");
      const value = doc.querySelector("search-value");
      Assert.ok(attribute, "Reopened search should have an attribute widget");
      Assert.ok(operator, "Reopened search should have an operator widget");
      Assert.ok(value, "Reopened search should have a value widget");
      Assert.equal(
        doc.getElementById("booleanAndGroup").value,
        mode,
        "Reopened search should retain the selected match mode"
      );
      Assert.equal(
        attribute.value,
        Ci.nsMsgSearchAttrib.Subject,
        "Reopened criterion should search the Subject"
      );
      Assert.equal(
        operator.value,
        Ci.nsMsgSearchOp.Contains,
        "Reopened criterion should use the contains operator"
      );
      Assert.equal(
        value.getInputValue(),
        "",
        "Reopened criterion should have an empty value"
      );
      doc.querySelector("dialog").getButton("cancel").click();
    });
  }
});

add_task(async function test_preserveCriteriaWhenSwitchingMatchModes() {
  const condition =
    "AND (from,contains,example.invalid) AND (subject,contains,test)";
  const wrapped = VirtualFolderHelper.createNewVirtualFolder(
    "populatedCriteria",
    first,
    [second],
    condition,
    false
  );
  const args = { folder: wrapped.virtualFolder, editExistingFolder: true };

  await openVirtualFolderDialog(args, async win => {
    win.document.querySelector("dialog").getButton("accept").click();
  });
  Assert.equal(
    wrapped.searchString,
    condition,
    "Saving without changes should preserve populated criteria"
  );

  for (const mode of ["or", "and"]) {
    await openVirtualFolderDialog(args, async win => {
      win.document.getElementById("matchAllItem").click();
      win.document.querySelector(`radio[value="${mode}"]`).click();
      win.document.querySelector("dialog").getButton("accept").click();
    });
    Assert.equal(
      wrapped.searchString,
      condition.replaceAll("AND", mode.toUpperCase()),
      "Switching match modes should preserve populated criteria"
    );
  }
});

add_task(async function test_defaultSearchAttributeByScope() {
  await openVirtualFolderDialog({ folder: first }, async win => {
    const attribute = win.document.querySelector("search-attribute");
    const operator = win.document.querySelector("search-operator");
    const value = win.document.querySelector("search-value");
    Assert.ok(attribute, "Search should have an attribute widget");
    Assert.ok(operator, "Search should have an operator widget");
    Assert.ok(value, "Search should have a value widget");

    for (const [scope, expected] of [
      [Ci.nsMsgSearchScope.offlineMail, Ci.nsMsgSearchAttrib.Subject],
      [Ci.nsMsgSearchScope.onlineMail, Ci.nsMsgSearchAttrib.Subject],
      [Ci.nsMsgSearchScope.news, Ci.nsMsgSearchAttrib.Subject],
      [Ci.nsMsgSearchScope.LocalAB, Ci.nsMsgSearchAttrib.Name],
      [Ci.nsMsgSearchScope.LocalABAnd, Ci.nsMsgSearchAttrib.DisplayName],
      [Ci.nsMsgSearchScope.LDAP, Ci.nsMsgSearchAttrib.Name],
      [Ci.nsMsgSearchScope.LDAPAnd, Ci.nsMsgSearchAttrib.DisplayName],
    ]) {
      attribute.searchScope = scope;
      attribute.value = Ci.nsMsgSearchAttrib.Email;
      attribute.value = Ci.nsMsgSearchAttrib.Default;
      Assert.equal(
        attribute.value,
        expected,
        `Default should select the default attribute for scope ${scope}`
      );
      Assert.ok(
        attribute.menulist.selectedItem,
        "Default should select an attribute menu item"
      );
      Assert.equal(
        attribute.menulist.selectedItem.value,
        String(expected),
        "Default should select a concrete menu item"
      );
      Assert.equal(
        operator.searchAttribute,
        expected,
        "Operator widget should receive the resolved attribute"
      );
      Assert.equal(
        value.searchAttribute,
        expected,
        "Value widget should receive the resolved attribute"
      );
    }
    win.document.querySelector("dialog").getButton("cancel").click();
  });
});

add_task(async function test_preserveCustomSearchAttributes() {
  const { sinon } = ChromeUtils.importESModule(
    "resource://testing-common/Sinon.sys.mjs"
  );
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());

  const customTerm = {
    id: "bug550726@example.invalid#custom",
    name: "Custom search test",
    getAvailable() {
      return true;
    },
    getAvailableOperators() {
      return [Ci.nsMsgSearchOp.Is];
    },
  };
  const filters = MailServices.filters;
  sandbox.stub(MailServices, "filters").value({
    getCustomTerms() {
      return [...filters.getCustomTerms(), customTerm];
    },
    getCustomTerm(id) {
      return id == customTerm.id ? customTerm : filters.getCustomTerm(id);
    },
    getTempFilterList(folder) {
      return filters.getTempFilterList(folder);
    },
  });

  for (const id of [customTerm.id, "bug550726@example.invalid#missing"]) {
    const condition = `AND (${id},is,test)`;
    const wrapped = VirtualFolderHelper.createNewVirtualFolder(
      id == customTerm.id ? "customAttribute" : "missingCustomAttribute",
      first,
      [second],
      condition,
      false
    );
    const args = { folder: wrapped.virtualFolder, editExistingFolder: true };
    for (let reopen = 0; reopen < 2; reopen++) {
      await openVirtualFolderDialog(args, async win => {
        const attribute = win.document.querySelector("search-attribute");
        Assert.ok(attribute, "Search should have an attribute widget");
        Assert.equal(
          attribute.value,
          id,
          "Custom attribute should retain its ID even if its provider is missing"
        );
        Assert.ok(
          attribute.menulist.selectedItem,
          "Custom attribute should have a selected menu item"
        );
        Assert.equal(
          attribute.menulist.selectedItem.value,
          id,
          "Custom attribute should retain its menu selection"
        );
        Assert.equal(
          attribute.menulist.selectedItem.hidden,
          id != customTerm.id,
          "Custom attribute should be hidden only if its provider is missing"
        );
        win.document.querySelector("dialog").getButton("accept").click();
      });
      Assert.equal(
        wrapped.searchString,
        condition,
        "Saving should preserve the custom attribute, operator, and value"
      );
    }
  }
  sandbox.restore();
});
