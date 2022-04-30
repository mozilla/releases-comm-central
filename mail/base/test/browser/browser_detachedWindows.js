/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let manager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(
  Ci.nsIMemoryReporterManager
);

add_setup(async function() {
  info("Initial state:");
  await getWindows();
});

add_task(async function testMessageWindow() {
  info("Opening a standalone message window");
  let win = await openMessageFromFile(
    new FileUtils.File(getTestFilePath("files/sampleContent.eml"))
  );
  await new Promise(resolve => win.setTimeout(resolve, 500));

  info("Closing the window");
  await BrowserTestUtils.closeWindow(win);
  win = null;

  await assertNoDetachedWindows();
});

async function getWindows() {
  await new Promise(resolve => manager.minimizeMemoryUsage(resolve));

  let windows = new Set();
  await new Promise(resolve =>
    manager.getReports(
      (process, path, kind, units, amount, description) => {
        if (path.startsWith("explicit/window-objects/top")) {
          path = path.replace("top(none)", "top");
          path = path.substring(0, path.indexOf(")") + 1);
          path = path.replace(/\\/g, "/");
          windows.add(path);
        }
      },
      null,
      resolve,
      null,
      false
    )
  );

  for (let win of windows) {
    info(win);
  }

  return [...windows];
}

async function assertNoDetachedWindows() {
  info("Remaining windows:");
  let windows = await getWindows();

  let noDetachedWindows = true;
  for (let win of windows) {
    if (win.includes("detached")) {
      noDetachedWindows = false;
      let url = win.substring(win.indexOf("(") + 1, win.indexOf(")"));
      Assert.report(true, undefined, undefined, `detached window: ${url}`);
    }
  }

  if (noDetachedWindows) {
    Assert.report(false, undefined, undefined, "no detached windows");
  }
}

async function openMessageFromFile(file) {
  let fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  let winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  let win = await winPromise;

  let browser = win.document.getElementById("messagepane");
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }

  return win;
}
