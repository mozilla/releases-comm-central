/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");
initViewWrapperTestUtils({ mode: "imap", offline: false });

add_task(async function test_real_folder_load_and_move_to_trash() {
  const viewWrapper = make_view_wrapper();
  const [[msgFolder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  await view_open(
    viewWrapper,
    messageInjection.getRealInjectionFolder(msgFolder)
  );
  verify_messages_in_view(msgSet, viewWrapper);

  await messageInjection.trashMessages(msgSet);
  verify_empty_view(viewWrapper);
});

add_task(async function test_empty_trash() {
  const viewWrapper = make_view_wrapper();
  const trashHandle = await messageInjection.getTrashFolder();
  const trashFolder = messageInjection.getRealInjectionFolder(trashHandle);

  await view_open(viewWrapper, trashFolder);

  await messageInjection.emptyTrash();
  verify_empty_view(viewWrapper);

  Assert.ok(viewWrapper.displayedFolder !== null);

  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [trashHandle],
    [{ count: 1 }]
  );

  verify_messages_in_view(msgSet, viewWrapper);
});
