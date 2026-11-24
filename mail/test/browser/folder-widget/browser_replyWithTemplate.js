/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { be_in_folder, create_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let filterFolder;

add_setup(async function () {
  filterFolder = await create_folder("ReplyWithTemplateFilterFolder");
  registerCleanupFunction(() => {
    filterFolder.deleteSelf(false);
    Services.focus.focusedWindow = window;
  });
  await make_message_sets_in_folders([filterFolder], [{ count: 1 }]);
});

/**
 * Tests that a stale account-default Templates URI is resolved on the
 * configured server when editing filters for Local Folders.
 */
add_task(async function test_reply_with_template_for_stale_default_uri() {
  const account = MailServices.accounts.defaultAccount;
  const identity =
    MailServices.accounts.getIdentitiesForServer(filterFolder.server)[0] ??
    account.defaultIdentity;
  const rootFolder = account.incomingServer.rootFolder;
  const parentFolder = await rootFolder.createSubfolderAsync(
    "FilterTemplatesParent"
  );
  registerCleanupFunction(() => parentFolder.deleteSelf(false));
  const templatesFolder =
    await parentFolder.createSubfolderAsync("FilterTemplates");

  const templatesPref = `mail.identity.${identity.key}.stationery_folder`;
  const staleTemplatesURI = `${account.incomingServer.serverURI}/StaleTemplates`;
  const oldTemplatesURI = identity.templatesFolderURI;
  const oldPickerMode = identity.templatesFolderPickerMode;
  registerCleanupFunction(async () => {
    await SpecialPowers.flushPrefEnv();
    identity.templatesFolderPickerMode = oldPickerMode;
    identity.templatesFolderURI = oldTemplatesURI;
  });
  identity.templatesFolderPickerMode = "0"; // Choose between servers.
  // Establish the canonical folder first so it is the server's designated
  // Templates folder, then replace only the stored preference with a stale
  // value like one left by an old namespace mapping.
  identity.templatesFolderURI = templatesFolder.URI;
  await make_message_sets_in_folders([templatesFolder], [{ count: 1 }]);

  // Set the stale preference directly so the actual Templates folder keeps
  // its flag.
  await SpecialPowers.pushPrefEnv({
    set: [[templatesPref, staleTemplatesURI]],
  });

  Assert.equal(
    identity.getTemplatesFolder(),
    templatesFolder,
    "the identity should resolve the configured server's Templates folder"
  );
  Assert.equal(
    identity.templatesFolderURI,
    staleTemplatesURI,
    "looking up the Templates folder should not repair the preference"
  );

  Assert.equal(
    templatesFolder.flags & Ci.nsMsgFolderFlags.Templates,
    Ci.nsMsgFolderFlags.Templates,
    "the actual folder should carry the Templates flag"
  );
  Assert.equal(
    templatesFolder.getTotalMessages(false),
    1,
    "the Templates folder should contain the injected message"
  );

  await be_in_folder(filterFolder);
  const filterWindow = await openFiltersDialog();
  registerCleanupFunction(async () => {
    if (!filterWindow.closed) {
      await BrowserTestUtils.closeWindow(filterWindow);
    }
  });
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/FilterEditor.xhtml",
    {
      callback(filterEditor) {
        const replyAction = filterEditor.document.querySelector(
          ".reply-message-action"
        );
        Assert.ok(replyAction, "Reply with Template action should exist");
        Assert.equal(
          filterEditor.gFilterList.folder.server,
          filterFolder.server,
          "the filter should use the Local Folders filter list"
        );
        Assert.ok(
          !replyAction.hidden,
          "Reply with Template should be visible for the resolved folder"
        );
        Assert.equal(
          identity.templatesFolderURI,
          staleTemplatesURI,
          "the filter editor should not change the Templates preference"
        );
        filterEditor.close();
      },
    }
  );

  EventUtils.synthesizeMouseAtCenter(
    filterWindow.document.getElementById("newButton"),
    {},
    filterWindow
  );
  await dialogPromise;
  await BrowserTestUtils.closeWindow(filterWindow);
});

/**
 * Opens the Message Filters window.
 *
 * @returns {Promise<Window>} The Message Filters window.
 */
async function openFiltersDialog() {
  const filterListPromise = promise_new_window("mailnews:filterlist");
  window.MsgFilters();
  return filterListPromise;
}
