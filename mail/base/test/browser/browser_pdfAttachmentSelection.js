/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * PDFs opened from mailbox:// or imap:// attachments run in Thunderbird's
 * parent process and in that configuration, bug 2070962 causes WebRender to drop
 * the selection element's `backdrop-filter`, leaving the selection present
 * but invisible.
 *
 * As a temporary fix for bug 2070410, Thunderbird disables pdf.js selection
 * rendering so native selection highlighting is used instead. The
 * mailbox test below will fail if the preference is re-enabled before bug
 * 2070962 is fixed.
 */

const tabmail = document.getElementById("tabmail");
let testFolder;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("pdfsel")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessage(
    await IOUtils.readUTF8(getTestFilePath("files/pdfsel.eml"))
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Open a URL in a content tab and wait for the pdf.js text layer to appear.
 *
 * @param {string} url
 * @returns {object} The tab info.
 */
async function openInViewer(url) {
  const tab = tabmail.openTab("contentTab", {
    url,
    background: false,
    linkHandler: "single-page",
  });
  await TestUtils.waitForCondition(
    () => tab.browser.currentURI?.spec != "about:blank",
    "waiting for the tab to start loading"
  );
  await SpecialPowers.spawn(tab.browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".textLayer span"),
      "waiting for the pdf.js text layer"
    );
  });
  return tab;
}

async function paint() {
  await new Promise(resolve =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  );
  // There's no event for "the compositor has produced a frame", so settle.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => window.setTimeout(resolve, 300));
}

function setSelection(browser, enabled) {
  return SpecialPowers.spawn(browser, [enabled], select => {
    const selection = content.getSelection();
    selection.removeAllRanges();
    if (!select) {
      return;
    }
    const span = Array.from(
      content.document.querySelectorAll(".textLayer span")
    ).find(s => {
      const rect = s.getBoundingClientRect();
      return s.textContent.trim() && rect.width > 5 && rect.height > 5;
    });
    const range = content.document.createRange();
    range.selectNodeContents(span);
    selection.addRange(range);
  });
}

async function frameToImageData(dataURI, region) {
  const image = new Image();
  image.src = dataURI;
  await image.decode();
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(region.x, region.y, region.width, region.height);
}

/**
 * Wait until the compositor stops producing frames, so that a later recording
 * only contains the frames caused by the change under test.
 */
async function waitForIdleCompositor() {
  await TestUtils.waitForCondition(async () => {
    await window.windowUtils.startCompositionRecording();
    await paint();
    const collected = await window.windowUtils.stopCompositionRecording(false);
    return (collected?.frames ?? []).length == 0;
  }, "waiting for the compositor to go idle");
}

/**
 * Settle on the opposite selection state, then record the composited output
 * while switching to `selected`, and return the pixels of `region` from the
 * last frame.
 *
 * @param {XULElement} browser
 * @param {boolean} selected - Whether text should end up selected.
 * @param {object} region - Device-pixel rect to read back.
 * @returns {ImageData}
 */
async function regionWithSelection(browser, selected, region) {
  await setSelection(browser, !selected);
  await paint();
  await waitForIdleCompositor();

  await window.windowUtils.startCompositionRecording();
  await setSelection(browser, selected);
  await paint();
  const collected = await window.windowUtils.stopCompositionRecording(false);
  const frames = collected?.frames ?? [];
  Assert.greater(
    frames.length,
    0,
    `toggling the selection ${selected ? "on" : "off"} should compose a frame`
  );
  return frameToImageData(frames.at(-1).dataUri, region);
}

/**
 * Whether selecting text changes what the compositor puts on screen where the
 * selected text is.
 *
 * @param {XULElement} browser
 * @returns {boolean}
 */
async function selectionIsPainted(browser) {
  await waitForIdleCompositor();
  const spanRect = await SpecialPowers.spawn(browser, [], () => {
    const span = Array.from(
      content.document.querySelectorAll(".textLayer span")
    ).find(s => {
      const rect = s.getBoundingClientRect();
      return s.textContent.trim() && rect.width > 5 && rect.height > 5;
    });
    return span.getBoundingClientRect().toJSON();
  });
  const browserRect = browser.getBoundingClientRect();
  const scale = window.devicePixelRatio;
  const region = {
    x: Math.floor((browserRect.x + spanRect.x) * scale),
    y: Math.floor((browserRect.y + spanRect.y) * scale),
    width: Math.ceil(spanRect.width * scale),
    height: Math.ceil(spanRect.height * scale),
  };

  const unselected = await regionWithSelection(browser, false, region);
  const selected = await regionWithSelection(browser, true, region);
  for (let i = 0; i < unselected.data.length; i++) {
    if (unselected.data[i] != selected.data[i]) {
      return true;
    }
  }
  return false;
}

add_task(async function testFileURL() {
  const url =
    Services.io.newFileURI(
      new FileUtils.File(getTestFilePath("files/pdfsel.pdf"))
    ).spec + "?type=application/pdf";
  const tab = await openInViewer(url);
  Assert.ok(
    tab.browser.isRemoteBrowser,
    "a file:// pdf should load in a content process"
  );
  Assert.ok(
    await selectionIsPainted(tab.browser),
    "selecting text in a file:// pdf should be visible on screen"
  );
  tabmail.closeTab(tab);
});

add_task(async function testMailboxURL() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndex = 0;
  await TestUtils.waitForCondition(
    () =>
      about3Pane.messageBrowser.contentWindow.currentAttachments?.length == 1,
    "waiting for the attachment to be listed"
  );
  const attachment =
    about3Pane.messageBrowser.contentWindow.currentAttachments[0];
  let url = attachment.url;
  if (!url.includes("type=application/pdf")) {
    url += (url.includes("?") ? "&" : "?") + "type=application/pdf";
  }
  const tab = await openInViewer(url);

  const selection = await SpecialPowers.spawn(tab.browser, [], () => {
    const span = Array.from(
      content.document.querySelectorAll(".textLayer span")
    ).find(s => s.textContent.trim());
    const range = content.document.createRange();
    range.selectNodeContents(span);
    content.getSelection().addRange(range);
    return content.getSelection().toString();
  });
  Assert.equal(
    selection,
    "Test text TRY TO SELECT test text",
    "text in a mailbox:// pdf should be selectable"
  );

  Assert.ok(
    await selectionIsPainted(tab.browser),
    "selecting text in a mailbox:// pdf should be visible on screen"
  );
  tabmail.closeTab(tab);
});
