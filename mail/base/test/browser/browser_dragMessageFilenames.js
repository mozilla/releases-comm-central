/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { threadTree } = about3Pane;
const mailboxService = MailServices.messageServiceFromURI("mailbox:");
let sourceFolder;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  sourceFolder = rootFolder
    .createLocalSubfolder("dragFilenames")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const generator = new MessageGenerator();
  sourceFolder.addMessageBatch(
    generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString())
  );
});

add_task(async function test_dragFilenameLimits() {
  about3Pane.restoreState({
    folderURI: sourceFolder.URI,
    messagePaneVisible: false,
  });
  await ensure_table_view(document);
  threadTree.selectedIndices = [0, 1];
  const uris = about3Pane.gDBView.getURIsForSelection();
  const rootPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "dragFilenameLimits"
  );
  registerCleanupFunction(() => IOUtils.remove(rootPath, { recursive: true }));
  const sandbox = sinon.createSandbox();
  const filenameBase = sandbox.stub(MailUtils, "getEmlFilenameBase");
  await SpecialPowers.pushPrefEnv({
    set: [["mail.save_msg_filename_underscores_for_space", false]],
  });
  let searchWindow;
  try {
    const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
      null,
      win =>
        win.document.documentURI ==
        "chrome://messenger/content/searchDialog.xhtml"
    );
    window.searchAllMessages();
    searchWindow = await opened;
    sandbox
      .stub(searchWindow.gFolderDisplay.view, "dbView")
      .value(about3Pane.gDBView);
    sandbox.stub(searchWindow.gFolderDisplay, "hintAboutToDeleteMessages");

    const subjects = ["Subject", "\u{1f600}a".repeat(100)];
    for (const subject of subjects) {
      filenameBase.returns(subject);
      for (const win of [about3Pane, searchWindow]) {
        const items = [];
        const dataTransfer = {
          mozSetDataAt(type, value, index) {
            (items[index] ??= new Map()).set(type, value);
          },
          addElement() {},
          setDragImage() {},
        };
        if (win == about3Pane) {
          about3Pane.threadPane._onDragStart({
            target: threadTree.getRowAtIndex(0),
            dataTransfer,
          });
        } else {
          searchWindow.ThreadPaneOnDragStart({
            target: searchWindow.document.querySelector(
              "#threadTree treechildren"
            ),
            dataTransfer,
          });
        }
        Assert.equal(
          items.length,
          2,
          "both drag implementations should export the selected messages"
        );
        const names = items.map(item =>
          item.get("application/x-moz-file-promise-dest-filename")
        );
        for (const filename of names) {
          Assert.lessOrEqual(
            [...filename].length,
            85,
            "a dragged filename should fit the code point limit including counters"
          );
          Assert.ok(
            filename.endsWith(".eml"),
            "dragging should retain the extension"
          );
          Assert.ok(
            !/[\r\n]/.test(filename),
            "dragging should sanitize ASCII controls"
          );
          Assert.ok(
            filename.isWellFormed(),
            "dragging should preserve code points"
          );
        }
        Assert.notEqual(
          names[0].toLowerCase(),
          names[1].toLowerCase(),
          "dragged filenames should resolve collisions"
        );
        Assert.ok(
          names[1].endsWith("-2.eml"),
          "dragging should retain collision counters"
        );
        if ([...(subject + ".eml")].length <= 85) {
          Assert.equal(
            names[0],
            subject + ".eml",
            "a short dragged filename should stay intact"
          );
        } else {
          Assert.ok(
            names[0].includes("..."),
            "a long dragged filename should shorten"
          );
        }

        const directoryPath = await IOUtils.createUniqueDirectory(
          rootPath,
          "drop"
        );
        if (
          AppConstants.platform == "win" &&
          names.some(name => PathUtils.join(directoryPath, name).length > 254)
        ) {
          // nsIFile.createUnique() shortens paths beyond MAX_PATH - 6.
          continue;
        }
        const directory = await IOUtils.getFile(directoryPath);
        for (const [index, item] of items.entries()) {
          const transferable = Cc[
            "@mozilla.org/widget/transferable;1"
          ].createInstance(Ci.nsITransferable);
          transferable.init(window.docShell);
          for (const type of [
            "text/plain",
            "application/x-moz-file-promise-dest-filename",
          ]) {
            const value = Cc["@mozilla.org/supports-string;1"].createInstance(
              Ci.nsISupportsString
            );
            value.data = item.get(type);
            transferable.setTransferData(type, value);
          }
          transferable.setTransferData(
            "application/x-moz-file-promise-dir",
            directory
          );

          const saved = TestUtils.topicObserved("message-saved");
          item
            .get("application/x-moz-file-promise")
            .getFlavorData(transferable, "application/x-moz-file-promise");
          await saved;

          const path = PathUtils.join(directoryPath, names[index]);
          Assert.ok(
            await IOUtils.exists(path),
            "the saved filename should preserve the generated ending and counter"
          );
          const header = mailboxService.messageURIToMsgHdr(uris[index]);
          Assert.stringContains(
            await IOUtils.readUTF8(path),
            `Message-Id: <${header.messageId}>`,
            "the file should contain the corresponding dragged message"
          );
        }
        Assert.deepEqual(
          (await IOUtils.getChildren(directoryPath))
            .map(path => PathUtils.filename(path))
            .sort(),
          [...names].sort(),
          "the drop should save both messages with their generated filenames"
        );
      }
    }
  } finally {
    sandbox.restore();
    if (searchWindow) {
      await BrowserTestUtils.closeWindow(searchWindow);
    }
    await SpecialPowers.popPrefEnv();
  }
});
