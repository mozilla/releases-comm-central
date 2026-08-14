/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for bug 1698140.
//
// Opening a PDF attachment from the compose window routes it through
// nsIURILoader.openURI with a system principal and NO browsing context (see
// OpenSelectedAttachment in MsgComposeCommands.js). When PDF handling is set to
// "always ask" / an external application, the PDF must be handed to the
// external helper (the unknownContentType dialog), NOT claimed by PDF.js:
// PDF.js cannot render without a browsing context, and it previously still
// rewrote the channel's type to text/html, so the attachment was mishandled
// (opened as "nsmail.pdf" in a browser on Linux; an error on Windows).
//
// This exercises the shared toolkit/components/pdfjs guard end-to-end through
// Thunderbird's actual attachment-open path.

const gMimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
const gHandlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);

let gIdentity;

add_setup(async function () {
  const { smtpAccount, smtpIdentity } = createSMTPAccount();
  gIdentity = smtpIdentity;
  MailServices.accounts.defaultAccount = smtpAccount;

  // Configure PDFs for "always ask" -- the handler state that triggers the bug.
  // Anything other than handleInternally sends OpenSelectedAttachment down the
  // windowless nsIURILoader.openURI path.
  const handlerInfo = gMimeService.getFromTypeAndExtension(
    "application/pdf",
    "pdf"
  );
  const previous = [
    handlerInfo.preferredAction,
    handlerInfo.alwaysAskBeforeHandling,
  ];
  handlerInfo.preferredAction = Ci.nsIHandlerInfo.useHelperApp;
  handlerInfo.alwaysAskBeforeHandling = true;
  gHandlerService.store(handlerInfo);

  registerCleanupFunction(function () {
    const info = gMimeService.getFromTypeAndExtension("application/pdf", "pdf");
    info.preferredAction = previous[0];
    info.alwaysAskBeforeHandling = previous[1];
    gHandlerService.store(info);
    MailServices.accounts.removeAccount(smtpAccount, false);
  });
});

add_task(async function test_open_pdf_attachment_uses_external_handler() {
  const { composeWindow } = await newComposeWindow(gIdentity);

  const pdfFile = new FileUtils.File(getTestFilePath("data/attachment.pdf"));
  const attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  attachment.name = "attachment.pdf";
  attachment.contentType = "application/pdf";
  attachment.url = Services.io.newFileURI(pdfFile).spec;
  attachment.size = pdfFile.fileSize;
  await composeWindow.AddAttachments([attachment]);

  const bucket = composeWindow.gAttachmentBucket;
  bucket.selectedItem = bucket.getItemAtIndex(0);
  Assert.equal(bucket.selectedItems.length, 1, "the attachment is selected");

  // With the fix, the windowless PDF load is not claimed by PDF.js and falls
  // through to the external helper, which -- because we set always-ask -- shows
  // the unknownContentType dialog. Without the fix, PDF.js claims the channel,
  // rewrites it to text/html, and this dialog never appears, so the test fails.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://mozapps/content/downloads/unknownContentType.xhtml"
  );

  composeWindow.OpenSelectedAttachment();

  await dialogPromise;
  Assert.ok(
    true,
    "the PDF attachment was routed to the external handler (unknownContentType dialog)"
  );

  await BrowserTestUtils.closeWindow(composeWindow);
});
