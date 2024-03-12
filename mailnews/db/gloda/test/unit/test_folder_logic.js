/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the gloda folder logic.
 */

var { glodaTestHelperInitialize } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var msgGen;
var messageInjection;

add_setup(function () {
  msgGen = new MessageGenerator();
  // Tests in this file assume that returned folders are nsIMsgFolders and not
  //  handles which currently only local injection supports.
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

/**
 * Newly created folders should not be filthy (at least as long as they have
 *  nothing in them.)
 */
add_task(async function test_newly_created_folders_start_clean() {
  const msgFolder = await messageInjection.makeEmptyFolder();
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  Assert.equal(glodaFolder.dirtyStatus, glodaFolder.kFolderClean);
});

/**
 * Deleted folders should not leave behind any mapping, and that mapping
 *  definitely should not interfere with a newly created folder of the same
 *  name.
 */
add_task(async function test_deleted_folder_tombstones_get_forgotten() {
  const oldFolder = await messageInjection.makeEmptyFolder("volver");
  const oldGlodaFolder = Gloda.getFolderForFolder(oldFolder);
  messageInjection.deleteFolder(oldFolder);

  // The tombstone needs to know it is deleted.
  Assert.ok(oldGlodaFolder._deleted);

  const newFolder = await messageInjection.makeEmptyFolder("volver");
  const newGlodaFolder = Gloda.getFolderForFolder(newFolder);

  // This folder better not be the same and better not think it is deleted.
  Assert.notEqual(oldGlodaFolder, newGlodaFolder);
  Assert.ok(!newGlodaFolder._deleted);
});
