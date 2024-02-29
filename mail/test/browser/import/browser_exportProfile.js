/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

add_task(async function testProfileExport() {
  const profileDir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "profile-tmp"
  );
  const zipFile = PathUtils.join(profileDir, "export.zip");
  const filePath = Services.io
    .newURI(PathUtils.toFileURI(zipFile))
    .QueryInterface(Ci.nsIFileURL);
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles([filePath.file]);
  registerCleanupFunction(async () => {
    await IOUtils.remove(profileDir, {
      recursive: true,
    });
    MockFilePicker.cleanup();
  });

  const tab = await new Promise(resolve => {
    const tab = window.openTab("contentTab", {
      url: "about:import",
      onLoad(event, browser) {
        browser.contentWindow.showTab("tab-export", true);
        resolve(tab);
      },
    });
  });
  const importDocument = tab.browser.contentDocument;
  const exportPane = importDocument.getElementById("tabPane-export");

  ok(
    BrowserTestUtils.isVisible(importDocument.getElementById("exportDocs")),
    "Export docs link is visible"
  );
  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("importDocs")),
    "Import docs link is hidden"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#exportButton",
    {},
    tab.browser
  );
  const progressPane = exportPane.querySelector(".progressPane");
  await BrowserTestUtils.waitForMutationCondition(
    exportPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(progressPane)
  );
  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("exportButton")),
    "Export button is hidden while export is in progress"
  );

  const finish = exportPane.querySelector(".progressFinish");
  await BrowserTestUtils.waitForMutationCondition(
    exportPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(finish)
  );
  ok(
    BrowserTestUtils.isVisible(progressPane),
    "When export succeeds and finish is shown, progress is still displayed"
  );

  const tabClosedPromise = BrowserTestUtils.waitForEvent(
    tab.tabNode,
    "TabClose"
  );
  // Using BrowserTestUtils fails, because clicking the button destroys the
  // context, which means the actor from BTU gets destroyed before it can report
  // that it emitted the event.
  await EventUtils.synthesizeMouseAtCenter(
    finish,
    {},
    tab.browser.contentWindow
  );
  await tabClosedPromise;

  const exportZipStat = await IOUtils.stat(zipFile);
  info(exportZipStat.size);
  Assert.greater(exportZipStat.size, 10, "Zip is not empty");
});
