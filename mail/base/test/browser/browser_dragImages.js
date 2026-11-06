/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { DragUtils } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/modules/DragUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);

const { AttachmentInfo } = ChromeUtils.importESModule(
  "resource:///modules/AttachmentInfo.sys.mjs"
);

add_task(async function test_multiDragImage() {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  const text = sandbox.spy(CanvasRenderingContext2D.prototype, "fillText");
  const dataTransfer = { setDragImage: sandbox.spy() };
  const event = { target: document.documentElement, dataTransfer };

  Assert.ok(
    !DragUtils.setMultiDragImage(event, 1),
    "a single item should retain its existing drag image"
  );
  Assert.ok(
    dataTransfer.setDragImage.notCalled,
    "a single item should not receive a count badge"
  );

  for (const [count, scale] of [
    [2, "1"],
    [12, "2"],
    [10000, "2"],
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [["layout.css.devPixelsPerPx", scale]],
    });
    await TestUtils.waitForCondition(
      () => devicePixelRatio == Number(scale),
      "the window should use the requested pixel ratio"
    );
    dataTransfer.setDragImage.resetHistory();
    text.resetHistory();
    Assert.ok(
      DragUtils.setMultiDragImage(event, count),
      "multiple items should receive a custom drag image"
    );
    Assert.equal(
      dataTransfer.setDragImage.callCount,
      1,
      "the drag image should be set once"
    );
    const [canvas, x, y] = dataTransfer.setDragImage.firstCall.args;
    Assert.ok(
      HTMLCanvasElement.isInstance(canvas),
      "the drag image should be a canvas"
    );
    Assert.equal(
      text.firstCall.args[0],
      count.toLocaleString(),
      "the badge should display the number of exported items"
    );
    Assert.equal(
      canvas.height,
      Math.ceil(48 * devicePixelRatio),
      "the canvas should account for the screen pixel ratio"
    );
    Assert.ok(
      canvas.width > x * devicePixelRatio &&
        canvas.height > y * devicePixelRatio,
      "the pointer hotspot should be inside the drag image"
    );
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height);
    Assert.ok(
      pixels.data.some((value, index) => index % 4 == 3 && value > 0),
      "the preview should contain painted pixels"
    );
    await SpecialPowers.popPrefEnv();
  }
  sandbox.restore();
});

add_task(function test_attachmentDragImage() {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  const preview = sandbox.spy(DragUtils, "setMultiDragImage");
  const attachments = [
    { name: "first.txt", url: "file:///first.txt", contentType: "text/plain" },
    { name: "missing.txt", url: "", contentType: "text/plain" },
    {
      name: "second.txt",
      url: "file:///second.txt",
      contentType: "text/plain",
    },
  ];

  for (const selected of [
    attachments.slice(0, 1),
    attachments,
    [...attachments, { contentType: "text/x-moz-deleted" }, attachments[0]],
  ]) {
    const items = [];
    const dataTransfer = {
      mozSetDataAt(type, value, index) {
        (items[index] ??= new Map()).set(type, value);
      },
      setDragImage: sandbox.spy(),
    };
    DragUtils.setupAttachmentDataTransfer(
      { target: document.documentElement, dataTransfer },
      selected
    );
    Assert.equal(
      preview.lastCall.args[1],
      items.length,
      "the preview count should match exported attachments, excluding missing URLs"
    );
    Assert.equal(
      dataTransfer.setDragImage.callCount,
      items.length > 1 ? 1 : 0,
      "only multiple exported attachments should receive a custom preview"
    );
    Assert.equal(
      items[0].get("application/x-moz-file-promise-url"),
      attachments[0].url,
      "the first attachment should retain its exported URL"
    );
    if (items.length > 1) {
      Assert.equal(
        items[1].get("application/x-moz-file-promise-url"),
        attachments[2].url,
        "the second exported attachment should retain its URL"
      );
    }
  }
  sandbox.restore();
});

add_task(async function test_attachmentFilePromises() {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  const save = sandbox.spy(AttachmentInfo.prototype, "saveToFile");
  const rootPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "attachmentFilePromises"
  );
  const list = await Downloads.getList(Downloads.ALL);
  registerCleanupFunction(async () => {
    for (const download of await list.getAll()) {
      if (PathUtils.parent(download.target.path) == rootPath) {
        await list.remove(download);
      }
    }
    await IOUtils.remove(rootPath, { recursive: true });
  });
  const sourcePath = PathUtils.join(rootPath, "null-report.txt");
  await IOUtils.writeUTF8(sourcePath, "Composer attachment");
  const reader = new AttachmentInfo({
    url: "data:text/plain,Reader%20attachment",
    name: "reader.txt",
    contentType: "text/plain",
    uri: "mailbox-message://original-message",
  });
  const composer = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  composer.url = PathUtils.toFileURI(sourcePath);
  composer.name = "long-" + "a".repeat(100) + ".txt";
  composer.contentType = "text/plain";
  const attachments = [reader, composer];

  function beginDrag() {
    const items = [];
    DragUtils.setupAttachmentDataTransfer(
      {
        target: document.documentElement,
        dataTransfer: {
          mozSetDataAt(type, value, index) {
            (items[index] ??= new Map()).set(type, value);
          },
          setDragImage() {},
        },
      },
      attachments
    );
    return items;
  }

  const items = beginDrag();
  const transferables = [];
  const savedPaths = [];
  Assert.strictEqual(
    items[0].get("application/x-moz-file-promise"),
    items[1].get("application/x-moz-file-promise"),
    "all items in a drag should share a provider"
  );
  const originalPath = PathUtils.join(rootPath, reader.name);
  await IOUtils.writeUTF8(originalPath, "Existing file");

  // Composer edits after dragstart should not change the promised source.
  composer.url = PathUtils.toFileURI(PathUtils.join(rootPath, "missing.txt"));
  for (const [index, item] of items.entries()) {
    const transferable = Cc[
      "@mozilla.org/widget/transferable;1"
    ].createInstance(Ci.nsITransferable);
    transferable.init(window.docShell);
    const source = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    source.data = item.get("application/x-moz-file-promise-url");
    transferable.setTransferData("application/x-moz-file-promise-url", source);
    const filename = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    filename.data = item.get("application/x-moz-file-promise-dest-filename");
    transferable.setTransferData(
      "application/x-moz-file-promise-dest-filename",
      filename
    );
    const directory = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    directory.initWithPath(rootPath);
    transferable.setTransferData(
      "application/x-moz-file-promise-dir",
      directory
    );

    const provider = item
      .get("application/x-moz-file-promise")
      .QueryInterface(Ci.nsIFlavorDataProvider);
    const result = {};
    const before = save.callCount;
    provider.getFlavorData(
      transferable,
      "application/x-moz-file-promise",
      result
    );
    const file = result.value.QueryInterface(Ci.nsIFile);
    transferables.push(transferable);
    savedPaths.push(file.path);
    Assert.equal(
      save.callCount,
      before + 1,
      "the provider should save the requested attachment"
    );
    Assert.deepEqual(
      save.lastCall.args,
      [file.path],
      "saving should use the default isTmp flag rather than passing the message URI"
    );
    await save.lastCall.returnValue;
    Assert.equal(
      await IOUtils.readUTF8(file.path),
      index == 0 ? "Reader attachment" : "Composer attachment",
      "the promised file should contain the corresponding attachment"
    );
    Assert.ok(
      (await list.getAll()).some(download => download.target.path == file.path),
      "the saved attachment should appear in the downloads list"
    );
    if (index == 0) {
      Assert.notEqual(
        file.path,
        originalPath,
        "saving should preserve an existing file"
      );
    } else {
      Assert.equal(
        file.leafName,
        item.get("application/x-moz-file-promise-dest-filename"),
        "saving should use the shortened filename exported at dragstart"
      );
    }

    const repeated = {};
    provider.getFlavorData(
      transferable,
      "application/x-moz-file-promise",
      repeated
    );
    if (AppConstants.platform == "macosx") {
      Assert.equal(
        save.callCount,
        before + 1,
        "repeated macOS requests should save only once"
      );
      Assert.equal(
        repeated.value.path,
        file.path,
        "repeated macOS requests should reuse the reserved file"
      );
    } else {
      Assert.equal(
        save.callCount,
        before + 2,
        "another request should save to another unique file"
      );
      await save.lastCall.returnValue;
    }
  }
  Assert.equal(
    await IOUtils.readUTF8(originalPath),
    "Existing file",
    "the original file should remain intact"
  );

  const nextProvider = beginDrag()[0].get("application/x-moz-file-promise");
  Assert.notStrictEqual(
    nextProvider,
    items[0].get("application/x-moz-file-promise"),
    "a new drag should have an independent provider"
  );
  const nextResult = {};
  const before = save.callCount;
  nextProvider.getFlavorData(
    transferables[0],
    "application/x-moz-file-promise",
    nextResult
  );
  Assert.equal(
    save.callCount,
    before + 1,
    "a new drag should save the attachment again, including on macOS"
  );
  await save.lastCall.returnValue;
  Assert.notEqual(
    nextResult.value.path,
    savedPaths[0],
    "a new drag should reserve a new destination file"
  );
  Assert.ok(
    !Object.hasOwn(reader, "lastSavedPath"),
    "duplicate-save tracking should not mutate the attachment"
  );
  sandbox.restore();
});

add_task(async function test_messageDragImage() {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  const preview = sandbox.spy(DragUtils, "setMultiDragImage");
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const originalFolder = about3Pane.gFolder;
  const account = MailServices.accounts.createLocalMailAccount();
  const folder = account.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("dragImages")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let searchWindow = null;
  registerCleanupFunction(async () => {
    if (searchWindow && !searchWindow.closed) {
      await BrowserTestUtils.closeWindow(searchWindow);
    }
    about3Pane.restoreState({
      folderURI: originalFolder?.URI ?? account.incomingServer.rootFolder.URI,
      messagePaneVisible: true,
    });
    MailServices.accounts.removeAccount(account, false);
  });
  folder.addMessageBatch(
    new MessageGenerator()
      .makeMessages({ count: 3, subject: "Drag image" })
      .map(msg => msg.toMessageString())
  );
  about3Pane.restoreState({ folderURI: folder.URI, messagePaneVisible: false });
  await ensure_table_view(document);

  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win =>
      win.document.documentURI ==
      "chrome://messenger/content/searchDialog.xhtml"
  );
  window.searchAllMessages();
  searchWindow = await opened;
  searchWindow.document.querySelector(
    "#searchTermList search-value input"
  ).value = "Drag image";
  searchWindow.onSearch();
  const searchTree = searchWindow.document.getElementById("threadTree");
  await TestUtils.waitForCondition(
    () => searchTree.view?.rowCount == 3,
    "the search should find all three messages"
  );

  for (const win of [about3Pane, searchWindow]) {
    const threadTree = win.document.getElementById("threadTree");
    for (const indices of [[0], [0, 2]]) {
      preview.resetHistory();
      threadTree.selectedIndices = indices;
      const row = threadTree.getRowAtIndex(0);
      const images = [];
      const items = [];
      const dataTransfer = {
        mozSetDataAt(type, value, index) {
          (items[index] ??= new Map()).set(type, value);
        },
        setDragImage(image) {
          images.push(image);
        },
        addElement: sandbox.spy(),
      };
      const event = {
        target: row,
        clientX: 20,
        clientY: 20,
        dataTransfer,
      };
      if (win == about3Pane) {
        about3Pane.threadPane._onDragStart(event);
      } else {
        searchWindow.ThreadPaneOnDragStart(event);
      }
      Assert.equal(
        items.length,
        indices.length,
        "all selected messages should be exported"
      );
      Assert.equal(
        images.length,
        indices.length > 1 || win == about3Pane ? 1 : 0,
        "the drag should use a count preview for multiple messages and retain single-item feedback"
      );
      Assert.equal(
        preview.lastCall.args[1],
        indices.length,
        "the preview should count the exported messages"
      );
      if (indices.length == 1 && win == about3Pane) {
        Assert.equal(
          images[0],
          row,
          "a single message should retain its row preview"
        );
      } else if (indices.length > 1) {
        Assert.ok(
          win.HTMLCanvasElement.isInstance(images[0]),
          "multiple messages should use a count preview"
        );
      } else {
        Assert.ok(
          dataTransfer.addElement.calledOnceWithExactly(row),
          "a single search result should retain its drag source"
        );
      }
    }
  }
  await BrowserTestUtils.closeWindow(searchWindow);
  sandbox.restore();
});
