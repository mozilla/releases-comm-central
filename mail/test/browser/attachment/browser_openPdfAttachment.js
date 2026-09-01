/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { add_message_to_folder, create_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

const aboutMessage = get_about_message();
const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
const handlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);

let folder;

add_setup(async function () {
  const handlerInfo = mimeService.getFromTypeAndExtension(
    "application/pdf",
    "pdf"
  );
  const previousHandler = {
    alwaysAskBeforeHandling: handlerInfo.alwaysAskBeforeHandling,
    preferredAction: handlerInfo.preferredAction,
  };
  handlerInfo.alwaysAskBeforeHandling = false;
  handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
  handlerService.store(handlerInfo);

  const pdfBytes = await IOUtils.read(
    getTestFilePath(
      "../../../components/compose/test/browser/data/attachment.pdf"
    )
  );
  const pdfBody = btoa(String.fromCharCode(...pdfBytes));

  folder = await create_folder("OpenPdfAttachment");
  await add_message_to_folder(
    [folder],
    create_message({
      subject: "PDF attachment",
      body: { body: "A message with a PDF attachment." },
      attachments: [
        {
          body: pdfBody,
          contentType: "application/pdf",
          encoding: "base64",
          filename: "document.pdf",
        },
      ],
    })
  );
  await be_in_folder(folder);
  await select_click_row(0);

  registerCleanupFunction(function () {
    const currentHandler = mimeService.getFromTypeAndExtension(
      "application/pdf",
      "pdf"
    );
    currentHandler.alwaysAskBeforeHandling =
      previousHandler.alwaysAskBeforeHandling;
    currentHandler.preferredAction = previousHandler.preferredAction;
    handlerService.store(currentHandler);
    folder.deleteSelf(null);
  });
});

add_task(async function test_open_pdf_attachment_in_content_tab() {
  const tabmail = document.getElementById("tabmail");
  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen",
    false,
    event => event.detail.tabInfo.mode.name == "contentTab"
  );

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    {},
    aboutMessage
  );

  const { detail } = await tabOpenPromise;
  const contentTab = detail.tabInfo;
  try {
    await BrowserTestUtils.waitForContentEvent(
      contentTab.browser,
      "textlayerrendered",
      false,
      null,
      true
    );
    await SpecialPowers.spawn(contentTab.browser, [], () => {
      Assert.ok(
        content.wrappedJSObject.PDFViewerApplication.pdfDocument,
        "the PDF document loaded in the content tab"
      );
    });
  } finally {
    tabmail.closeTab(contentTab);
  }
});
