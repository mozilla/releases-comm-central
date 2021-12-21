/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Filelink URL insertion behaviours in compose windows.
 */

"use strict";

var {
  gMockFilePicker,
  gMockFilePickReg,
  select_attachments,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);
var { gMockCloudfileManager, MockCloudfileAccount } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
var {
  add_cloud_attachments,
  convert_selected_to_cloud_attachment,
  rename_selected_cloud_attachment,
  assert_previous_text,
  close_compose_window,
  get_compose_body,
  open_compose_new_mail,
  open_compose_with_forward,
  open_compose_with_reply,
  type_in_composer,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  assert_next_nodes,
  assert_previous_nodes,
  wait_for_element,
} = ChromeUtils.import("resource://testing-common/mozmill/DOMHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var kUploadedFile = "attachment-uploaded";
var kHtmlPrefKey = "mail.identity.default.compose_html";
var kReplyOnTopKey = "mail.identity.default.reply_on_top";
var kReplyOnTop = 1;
var kReplyOnBottom = 0;
var kTextNodeType = 3;
var kSigPrefKey = "mail.identity.id1.htmlSigText";
var kSigOnReplyKey = "mail.identity.default.sig_on_reply";
var kSigOnForwardKey = "mail.identity.default.sig_on_fwd";
var kDefaultSigKey = "mail.identity.id1.htmlSigText";
var kDefaultSig = "This is my signature.\n\nCheck out my website sometime!";
var kFiles = ["./data/testFile1", "./data/testFile2"];
var kLines = ["This is a line of text", "and here's another!"];

const DATA_URLS = {
  "chrome://messenger/content/extension.svg":
    "data:image/svg+xml;filename=extension.svg;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljCiAgIC0gTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpcwogICAtIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uIC0tPgo8c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiCiAgICAgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiB2aWV3Qm94PSIwIDAgNjQgNjQiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuc3R5bGUtcHV6emxlLXBpZWNlIHsKICAgICAgICBmaWxsOiB1cmwoJyNncmFkaWVudC1saW5lYXItcHV6emxlLXBpZWNlJyk7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImdyYWRpZW50LWxpbmVhci1wdXp6bGUtcGllY2UiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzY2Y2M1MiIgc3RvcC1vcGFjaXR5PSIxIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzYwYmY0YyIgc3RvcC1vcGFjaXR5PSIxIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cGF0aCBjbGFzcz0ic3R5bGUtcHV6emxlLXBpZWNlIiBkPSJNNDIsNjJjMi4yLDAsNC0xLjgsNC00bDAtMTQuMmMwLDAsMC40LTMuNywyLjgtMy43YzIuNCwwLDIuMiwzLjksNi43LDMuOWMyLjMsMCw2LjItMS4yLDYuMi04LjIgYzAtNy0zLjktNy45LTYuMi03LjljLTQuNSwwLTQuMywzLjctNi43LDMuN2MtMi40LDAtMi44LTMuOC0yLjgtMy44VjIyYzAtMi4yLTEuOC00LTQtNEgzMS41YzAsMC0zLjQtMC42LTMuNC0zIGMwLTIuNCwzLjgtMi42LDMuOC03LjFjMC0yLjMtMS4zLTUuOS04LjMtNS45cy04LDMuNi04LDUuOWMwLDQuNSwzLjQsNC43LDMuNCw3LjFjMCwyLjQtMy40LDMtMy40LDNINmMtMi4yLDAtNCwxLjgtNCw0bDAsNy44IGMwLDAtMC40LDYsNC40LDZjMy4xLDAsMy4yLTQuMSw3LjMtNC4xYzIsMCw0LDEuOSw0LDZjMCw0LjItMiw2LjMtNCw2LjNjLTQsMC00LjItNC4xLTcuMy00LjFjLTQuOCwwLTQuNCw1LjgtNC40LDUuOEwyLDU4IGMwLDIuMiwxLjgsNCw0LDRIMTljMCwwLDYuMywwLjQsNi4zLTQuNGMwLTMuMS00LTMuNi00LTcuN2MwLTIsMi4yLTQuNSw2LjQtNC41YzQuMiwwLDYuNiwyLjUsNi42LDQuNWMwLDQtMy45LDQuNi0zLjksNy43IGMwLDQuOSw2LjMsNC40LDYuMyw0LjRINDJ6Ii8+Cjwvc3ZnPgo=",
  "chrome://messenger/skin/icons/globe.svg":
    "data:image/svg+xml;filename=globe.svg;base64,PCEtLSBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljCiAgIC0gTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpcwogICAtIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uIC0tPgo8c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiB2aWV3Qm94PSIwIDAgMTYgMTYiPgogIDxwYXRoIGZpbGw9ImNvbnRleHQtZmlsbCIgZD0iTTggMGE4IDggMCAxIDAgOCA4IDguMDA5IDguMDA5IDAgMCAwLTgtOHptNS4xNjMgNC45NThoLTEuNTUyYTcuNyA3LjcgMCAwIDAtMS4wNTEtMi4zNzYgNi4wMyA2LjAzIDAgMCAxIDIuNjAzIDIuMzc2ek0xNCA4YTUuOTYzIDUuOTYzIDAgMCAxLS4zMzUgMS45NThoLTEuODIxQTEyLjMyNyAxMi4zMjcgMCAwIDAgMTIgOGExMi4zMjcgMTIuMzI3IDAgMCAwLS4xNTYtMS45NThoMS44MjFBNS45NjMgNS45NjMgMCAwIDEgMTQgOHptLTYgNmMtMS4wNzUgMC0yLjAzNy0xLjItMi41NjctMi45NThoNS4xMzVDMTAuMDM3IDEyLjggOS4wNzUgMTQgOCAxNHpNNS4xNzQgOS45NThhMTEuMDg0IDExLjA4NCAwIDAgMSAwLTMuOTE2aDUuNjUxQTExLjExNCAxMS4xMTQgMCAwIDEgMTEgOGExMS4xMTQgMTEuMTE0IDAgMCAxLS4xNzQgMS45NTh6TTIgOGE1Ljk2MyA1Ljk2MyAwIDAgMSAuMzM1LTEuOTU4aDEuODIxYTEyLjM2MSAxMi4zNjEgMCAwIDAgMCAzLjkxNkgyLjMzNUE1Ljk2MyA1Ljk2MyAwIDAgMSAyIDh6bTYtNmMxLjA3NSAwIDIuMDM3IDEuMiAyLjU2NyAyLjk1OEg1LjQzM0M1Ljk2MyAzLjIgNi45MjUgMiA4IDJ6bS0yLjU2LjU4MmE3LjcgNy43IDAgMCAwLTEuMDUxIDIuMzc2SDIuODM3QTYuMDMgNi4wMyAwIDAgMSA1LjQ0IDIuNTgyem0tMi42IDguNDZoMS41NDlhNy43IDcuNyAwIDAgMCAxLjA1MSAyLjM3NiA2LjAzIDYuMDMgMCAwIDEtMi42MDMtMi4zNzZ6bTcuNzIzIDIuMzc2YTcuNyA3LjcgMCAwIDAgMS4wNTEtMi4zNzZoMS41NTJhNi4wMyA2LjAzIDAgMCAxLTIuNjA2IDIuMzc2eiI+PC9wYXRoPgo8L3N2Zz4K",
};

var gInbox;

function test_expected_included(actual, expected, description) {
  Assert.equal(
    actual.length,
    expected.length,
    `${description}: correct length`
  );
  for (let i = 0; i < expected.length; i++) {
    for (let item of Object.keys(expected[i])) {
      Assert.equal(
        actual[i][item],
        expected[i][item],
        `${description}: ${item} exists and is correct`
      );
    }
  }
}

add_task(async function setupModule(module) {
  requestLongerTimeout(3);

  // These prefs can't be set in the manifest as they contain white-space.
  Services.prefs.setStringPref(
    "mail.identity.id1.htmlSigText",
    "Tinderbox is soo 90ies"
  );
  Services.prefs.setStringPref(
    "mail.identity.id2.htmlSigText",
    "Tinderboxpushlog is the new <b>hotness!</b>"
  );

  // For replies and forwards, we'll work off a message in the Inbox folder
  // of the fake "tinderbox" account.
  let server = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gInbox = await get_special_folder(Ci.nsMsgFolderFlags.Inbox, false, server);
  await add_message_to_folder([gInbox], create_message());

  gMockFilePickReg.register();
  gMockCloudfileManager.register();

  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  // Don't create paragraphs in the test.
  // The test fails if it encounters paragraphs <p> instead of breaks <br>.
  Services.prefs.setBoolPref("mail.compose.default_to_paragraph", false);
});

registerCleanupFunction(function teardownModule(module) {
  gMockCloudfileManager.unregister();
  gMockFilePickReg.unregister();
  Services.prefs.clearUserPref(kDefaultSigKey);
  Services.prefs.clearUserPref(kHtmlPrefKey);
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
});

function setupTest() {
  // If our signature got accidentally wiped out, let's just put it back.
  Services.prefs.setCharPref(kDefaultSigKey, kDefaultSig);
}

/**
 * Given some compose window controller, wait for some Filelink URLs to be
 * inserted.
 *
 * @param aController the controller for a compose window.
 * @param aNumUrls the number of Filelink URLs that are expected.
 * @param aUploads an array containing the objects returned by
 *                 cloudFileAccounts.uploadFile() for all uploads
 * @returns an array containing the root containment node, the list node, and
 *          an array of the link URL nodes.
 */
function wait_for_attachment_urls(aController, aNumUrls, aUploads = []) {
  let mailBody = get_compose_body(aController);

  // Wait until we can find the root attachment URL node...
  let root = wait_for_element(
    mailBody.parentNode,
    "body > #cloudAttachmentListRoot"
  );

  let list = wait_for_element(
    mailBody,
    "#cloudAttachmentListRoot > #cloudAttachmentList"
  );

  let urls = null;
  aController.waitFor(function() {
    urls = mailBody.querySelectorAll(
      "#cloudAttachmentList > .cloudAttachmentItem"
    );
    return urls != null && urls.length == aNumUrls;
  });

  Assert.equal(
    aUploads.length,
    aNumUrls,
    "Number of uploads matches number of uploaded files."
  );

  let bucket = aController.e("attachmentBucket");

  // Check the actual content of the generated cloudAttachmentItems.
  for (let i = 0; i < urls.length; i++) {
    if (aController.window.gMsgCompose.composeHTML) {
      let downloadUrl = urls[i].querySelector(".downloadUrl");
      Assert.equal(
        downloadUrl.href,
        aUploads[i].url,
        "The seen downloadUrl is correct."
      );

      let providerLink = urls[i].querySelector(".providerLink");
      Assert.ok(
        !!providerLink == !!aUploads[i].serviceURL,
        "The providerLink has been correctly added."
      );
      if (providerLink) {
        Assert.equal(
          providerLink.href.toLowerCase().replace(/\/$/, ""),
          aUploads[i].serviceURL.toLowerCase().replace(/\/$/, ""),
          "The seen providerLink is correct."
        );
      }

      // The provider name is either embedded into the link, or a stand-alone span.
      let providerName = providerLink || urls[i].querySelector(".providerName");
      Assert.equal(
        providerName.textContent,
        aUploads[i].serviceName,
        "The seen providerName is correct."
      );

      let providerIcon = urls[i].querySelector(".providerIcon");
      Assert.equal(
        DATA_URLS[aUploads[i].serviceIcon] || aUploads[i].serviceIcon,
        providerIcon.src,
        "The seen providerIcon is correct."
      );
    } else {
      Assert.ok(
        urls[i].textContent.startsWith(`* ${aUploads[i].name} (`),
        "Part 1 of plainttext listitem is correct."
      );
      Assert.ok(
        urls[i].textContent.endsWith(
          `) hosted on ${aUploads[i].serviceName}: ${aUploads[i].url}`
        ),
        "Part 2 of plainttext listitem is correct."
      );
    }

    // Find the bucket entry for this upload.
    let items = Array.from(
      bucket.querySelectorAll(".attachmentItem"),
      item => item
    ).filter(item => item.attachment.name == aUploads[i].name);
    Assert.equal(
      items.length,
      1,
      `Should find one matching bucket entry for ${aUploads[i].serviceName} / ${aUploads[i].name}.`
    );
    Assert.equal(
      items[0].querySelector("img.attachmentcell-icon").src,
      aUploads[i].serviceIcon,
      `CloudFile icon should be correct for ${aUploads[i].serviceName} / ${aUploads[i].name}`
    );
    Assert.equal(
      items[0].querySelector("span.attachmentcell-size").textContent,
      "",
      `CloudFile size should be empty.`
    );
  }

  return [root, list, urls];
}

/**
 * Helper function that sets up the mock file picker for a series of files,
 * spawns a reply window for the first message in the gInbox, optionally
 * types some strings into the compose window, and then attaches some
 * Filelinks.
 *
 * @param aText an array of strings to type into the compose window. Each
 *              string is followed by pressing the RETURN key, except for
 *              the final string.  Pass an empty array if you don't want
 *              anything typed.
 * @param aFiles an array of filename strings for files located beneath
 *               the test directory.
 */
function prepare_some_attachments_and_reply(aText, aFiles) {
  gMockFilePicker.returnFiles = collectFiles(aFiles);

  let provider = new MockCloudfileAccount();
  provider.init("providerF", {
    serviceName: "MochiTest F",
    serviceURL: "https://www.provider-F.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });

  be_in_folder(gInbox);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  let cw = open_compose_with_reply();

  // If we have any typing to do, let's do it.
  type_in_composer(cw, aText);
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerF/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest F",
        serviceURL: "https://www.provider-F.org",
      },
      {
        url: "http://www.example.com/providerF/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest F",
        serviceURL: "https://www.provider-F.org",
      },
    ],
    `Expected values in uploads array #11`
  );
  let [root] = wait_for_attachment_urls(cw, aFiles.length, uploads);

  return [cw, root];
}

/**
 * Helper function that sets up the mock file picker for a series of files,
 * spawns an inline forward compose window for the first message in the gInbox,
 * optionally types some strings into the compose window, and then attaches
 * some Filelinks.
 *
 * @param aText an array of strings to type into the compose window. Each
 *              string is followed by pressing the RETURN key, except for
 *              the final string.  Pass an empty array if you don't want
 *              anything typed.
 * @param aFiles an array of filename strings for files located beneath
 *               the test directory.
 */
function prepare_some_attachments_and_forward(aText, aFiles) {
  gMockFilePicker.returnFiles = collectFiles(aFiles);

  let provider = new MockCloudfileAccount();
  provider.init("providerG", {
    serviceName: "MochiTest G",
    serviceURL: "https://www.provider-G.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });

  be_in_folder(gInbox);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  let cw = open_compose_with_forward();

  // Put the selection at the beginning of the document...
  let editor = cw.window.GetCurrentEditor();
  editor.beginningOfDocument();

  // Do any necessary typing...
  type_in_composer(cw, aText);
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerG/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest G",
        serviceURL: "https://www.provider-G.org",
      },
      {
        url: "http://www.example.com/providerG/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest G",
        serviceURL: "https://www.provider-G.org",
      },
    ],
    `Expected values in uploads array #12`
  );
  let [root] = wait_for_attachment_urls(cw, aFiles.length, uploads);

  return [cw, root];
}

/**
 * Helper function that runs a test function with signature-in-reply and
 * signature-in-forward enabled, and then runs the test again with those
 * prefs disabled.
 *
 * @param aSpecialTest a test that takes two arguments - the first argument
 *                     is the aText array of any text that should be typed,
 *                     and the second is a boolean for whether or not the
 *                     special test should expect a signature or not.
 * @param aText any text to be typed into the compose window, passed to
 *              aSpecialTest.
 */
function try_with_and_without_signature_in_reply_or_fwd(aSpecialTest, aText) {
  // By default, we have a signature included in replies, so we'll start
  // with that.
  Services.prefs.setBoolPref(kSigOnReplyKey, true);
  Services.prefs.setBoolPref(kSigOnForwardKey, true);
  aSpecialTest(aText, true);

  Services.prefs.setBoolPref(kSigOnReplyKey, false);
  Services.prefs.setBoolPref(kSigOnForwardKey, false);
  aSpecialTest(aText, false);
}

/**
 * Helper function that runs a test function without a signature, once
 * in HTML mode, and again in plaintext mode.
 *
 * @param aTest a test that takes no arguments.
 */
function try_without_signature(aTest) {
  let oldSig = Services.prefs.getCharPref(kSigPrefKey);
  Services.prefs.setCharPref(kSigPrefKey, "");

  try_with_plaintext_and_html_mail(aTest);
  Services.prefs.setCharPref(kSigPrefKey, oldSig);
}

/**
 * Helper function that runs a test function for HTML mail composition, and
 * then again in plaintext mail composition.
 *
 * @param aTest a test that takes no arguments.
 */
function try_with_plaintext_and_html_mail(aTest) {
  aTest();
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  aTest();
  Services.prefs.setBoolPref(kHtmlPrefKey, true);
}

/**
 * Test that if we open up a composer and immediately attach a Filelink,
 * a linebreak is inserted before the containment node in order to allow
 * the user to write before the attachment URLs.  This assumes the user
 * does not have a signature already inserted into the message body.
 */
add_task(function test_inserts_linebreak_on_empty_compose() {
  try_without_signature(subtest_inserts_linebreak_on_empty_compose);
});

/**
 * Subtest for test_inserts_linebreak_on_empty_compose - can be executed
 * on both plaintext and HTML compose windows.
 */
function subtest_inserts_linebreak_on_empty_compose() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("someKey");

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
      {
        url: "http://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
    ],
    `Expected values in uploads array #1`
  );
  let [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  let br = root.previousSibling;
  Assert.equal(
    br.localName,
    "br",
    "The attachment URL containment node should be preceded by a linebreak"
  );

  let mailBody = get_compose_body(cw);

  Assert.equal(
    mailBody.firstChild,
    br,
    "The linebreak should be the first child of the compose body"
  );

  close_compose_window(cw);
}

/**
 * Test that if we open up a composer and immediately attach a Filelink,
 * a linebreak is inserted before the containment node. This test also
 * ensures that, with a signature already in the compose window, we don't
 * accidentally insert the attachment URL containment within the signature
 * node.
 */
add_task(function test_inserts_linebreak_on_empty_compose_with_signature() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("someKey");

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
      {
        url: "http://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
    ],
    `Expected values in uploads array #2`
  );
  // wait_for_attachment_urls ensures that the attachment URL containment
  // node is an immediate child of the body of the message, so if this
  // succeeds, then we were not in the signature node.
  let [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  let br = assert_previous_nodes("br", root, 1);

  let mailBody = get_compose_body(cw);
  Assert.equal(
    mailBody.firstChild,
    br,
    "The linebreak should be the first child of the compose body"
  );

  // Now ensure that the node after the attachments is a br, and following
  // that is the signature.
  br = assert_next_nodes("br", root, 1);

  let pre = br.nextSibling;
  Assert.equal(
    pre.localName,
    "pre",
    "The linebreak should be followed by the signature pre"
  );
  Assert.ok(
    pre.classList.contains("moz-signature"),
    "The pre should have the moz-signature class"
  );

  close_compose_window(cw);

  Services.prefs.setBoolPref(kHtmlPrefKey, false);

  // Now let's try with plaintext mail.
  cw = open_compose_new_mail();
  uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
      {
        url: "http://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
    ],
    `Expected values in uploads array #3`
  );
  [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  br = assert_previous_nodes("br", root, 1);

  mailBody = get_compose_body(cw);
  Assert.equal(
    mailBody.firstChild,
    br,
    "The linebreak should be the first child of the compose body"
  );

  // Now ensure that the node after the attachments is a br, and following
  // that is the signature.
  br = assert_next_nodes("br", root, 1);

  let div = br.nextSibling;
  Assert.equal(
    div.localName,
    "div",
    "The linebreak should be followed by the signature div"
  );
  Assert.ok(
    div.classList.contains("moz-signature"),
    "The div should have the moz-signature class"
  );

  close_compose_window(cw);

  Services.prefs.setBoolPref(kHtmlPrefKey, true);
});

/**
 * Tests that removing all Filelinks causes the root node to be removed.
 */
add_task(function test_removing_filelinks_removes_root_node() {
  try_with_plaintext_and_html_mail(
    subtest_removing_filelinks_removes_root_node
  );
});

/**
 * Test for test_removing_filelinks_removes_root_node - can be executed
 * on both plaintext and HTML compose windows.
 */
function subtest_removing_filelinks_removes_root_node() {
  let [cw, root] = prepare_some_attachments_and_reply([], kFiles);

  // Now select the attachments in the attachment bucket, and remove them.
  select_attachments(cw, 0, 1);
  cw.window.goDoCommand("cmd_delete");

  // Wait for the root to be removed.
  let mailBody = get_compose_body(cw);
  cw.waitFor(function() {
    let result = mailBody.querySelector(root.id);
    return result == null;
  }, "Timed out waiting for attachment container to be removed");

  close_compose_window(cw);
}

/**
 * Test that if we write some text in an empty message (no signature),
 * and the selection is at the end of a line of text, attaching some Filelinks
 * causes the attachment URL container to be separated from the text by
 * two br tags.
 */
add_task(function test_adding_filelinks_to_written_message() {
  try_without_signature(subtest_adding_filelinks_to_written_message);
});

/**
 * Subtest for test_adding_filelinks_to_written_message - generalized for both
 * HTML and plaintext mail.
 */
function subtest_adding_filelinks_to_written_message() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("someKey");
  let cw = open_compose_new_mail();

  type_in_composer(cw, kLines);
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
      {
        url: "http://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "default",
        serviceURL: "",
      },
    ],
    `Expected values in uploads array #4`
  );
  let [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  let br = root.previousSibling;
  Assert.equal(
    br.localName,
    "br",
    "The attachment URL containment node should be preceded by a linebreak"
  );
  br = br.previousSibling;
  Assert.equal(
    br.localName,
    "br",
    "The attachment URL containment node should be preceded by " +
      "two linebreaks"
  );
  close_compose_window(cw);
}

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply above the quote.
 */
add_task(function test_adding_filelinks_to_empty_reply_above() {
  let oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);

  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_above,
    []
  );
  // Now with HTML mail...
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_above_plaintext,
    []
  );

  Services.prefs.setBoolPref(kHtmlPrefKey, true);
  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply above the quote, after entering some text.
 */
add_task(function test_adding_filelinks_to_nonempty_reply_above() {
  let oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);

  subtest_adding_filelinks_to_reply_above(kLines);

  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  subtest_adding_filelinks_to_reply_above_plaintext(kLines);
  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Subtest for test_adding_filelinks_to_reply_above for the plaintext composer.
 * Does some special casing for the weird br insertions that happens in
 * various cases.
 */
function subtest_adding_filelinks_to_reply_above_plaintext(aText, aWithSig) {
  let [cw, root] = prepare_some_attachments_and_reply(aText, kFiles);

  let br;
  if (aText.length) {
    br = assert_next_nodes("br", root, 2);
  } else {
    br = assert_next_nodes("br", root, 1);
  }

  let div = br.nextSibling;
  Assert.equal(
    div.localName,
    "div",
    "The linebreak should be followed by a div"
  );

  Assert.ok(div.classList.contains("moz-cite-prefix"));

  if (aText.length) {
    br = assert_previous_nodes("br", root, 2);
  } else {
    br = assert_previous_nodes("br", root, 1);
  }

  if (aText.length == 0) {
    // If we didn't type anything, that br should be the first element of the
    // message body.
    let msgBody = get_compose_body(cw);
    Assert.equal(
      msgBody.firstChild,
      br,
      "The linebreak should have been the first element in the " +
        "message body"
    );
  } else {
    let targetText = aText[aText.length - 1];
    let textNode = br.previousSibling;
    Assert.equal(textNode.nodeType, kTextNodeType);
    Assert.equal(textNode.nodeValue, targetText);
  }

  close_compose_window(cw);
}

/**
 * Subtest for test_adding_filelinks_to_reply_above for the HTML composer.
 */
function subtest_adding_filelinks_to_reply_above(aText) {
  let [cw, root] = prepare_some_attachments_and_reply(aText, kFiles);

  // If there's any text written, then there's only a single break between the
  // end of the text and the reply. Otherwise, there are two breaks.
  let br =
    aText.length > 1
      ? assert_next_nodes("br", root, 2)
      : assert_next_nodes("br", root, 1);

  // ... which is followed by a div with a class of "moz-cite-prefix".
  let div = br.nextSibling;
  Assert.equal(
    div.localName,
    "div",
    "The linebreak should be followed by a div"
  );

  Assert.ok(div.classList.contains("moz-cite-prefix"));

  close_compose_window(cw);
}

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply below the quote.
 */
add_task(function test_adding_filelinks_to_empty_reply_below() {
  let oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnBottom);

  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_below,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_plaintext_reply_below,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply below the quote, after entering some text.
 */
add_task(function test_adding_filelinks_to_nonempty_reply_below() {
  let oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnBottom);

  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_below,
    kLines
  );

  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_plaintext_reply_below,
    kLines
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Subtest for test_adding_filelinks_to_reply_below for the HTML composer.
 */
function subtest_adding_filelinks_to_reply_below(aText, aWithSig) {
  let [cw, root] = prepare_some_attachments_and_reply(aText, kFiles);

  // So, we should have the root, followed by a br
  let br = root.nextSibling;
  Assert.equal(
    br.localName,
    "br",
    "The attachment URL containment node should be followed by a br"
  );

  let blockquote;
  if (aText.length) {
    // If there was any text inserted, check for 2 previous br nodes, and then
    // the inserted text, and then the blockquote.
    br = assert_previous_nodes("br", root, 2);
    let textNode = assert_previous_text(br.previousSibling, aText);
    blockquote = textNode.previousSibling;
  } else {
    // If no text was inserted, check for 1 previous br node, and then the
    // blockquote.
    br = assert_previous_nodes("br", root, 1);
    blockquote = br.previousSibling;
  }

  Assert.equal(
    blockquote.localName,
    "blockquote",
    "The linebreak should be preceded by a blockquote."
  );

  let prefix = blockquote.previousSibling;
  Assert.equal(
    prefix.localName,
    "div",
    "The blockquote should be preceded by the prefix div"
  );
  Assert.ok(
    prefix.classList.contains("moz-cite-prefix"),
    "The prefix should have the moz-cite-prefix class"
  );

  close_compose_window(cw);
}

/**
 * Subtest for test_adding_filelinks_to_reply_below for the plaintext composer.
 */
function subtest_adding_filelinks_to_plaintext_reply_below(aText, aWithSig) {
  let [cw, root] = prepare_some_attachments_and_reply(aText, kFiles);
  let br, span;

  assert_next_nodes("br", root, 1);

  if (aText.length) {
    br = assert_previous_nodes("br", root, 2);
    // If text was entered, make sure it matches what we expect...
    let textNode = assert_previous_text(br.previousSibling, aText);
    // And then grab the span, which should be before the final text node.
    span = textNode.previousSibling;
  } else {
    br = assert_previous_nodes("br", root, 1);
    // If no text was entered, just grab the last br's previous sibling - that
    // will be the span.
    span = br.previousSibling;
    // Sometimes we need to skip one more linebreak.
    if (span.localName != "span") {
      span = span.previousSibling;
    }
  }

  Assert.equal(
    span.localName,
    "span",
    "The linebreak should be preceded by a span."
  );

  let prefix = span.previousSibling;
  Assert.equal(
    prefix.localName,
    "div",
    "The blockquote should be preceded by the prefix div"
  );
  Assert.ok(
    prefix.classList.contains("moz-cite-prefix"),
    "The prefix should have the moz-cite-prefix class"
  );

  close_compose_window(cw);
}

/**
 * Tests Filelink insertion on an inline-forward compose window with nothing
 * typed into it.
 */
add_task(function test_adding_filelinks_to_empty_forward() {
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);
});

/**
 * Tests Filelink insertion on an inline-forward compose window with some
 * text typed into it.
 */
add_task(function test_adding_filelinks_to_forward() {
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    kLines
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    kLines
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);
});

/**
 * Subtest for both test_adding_filelinks_to_empty_forward and
 * test_adding_filelinks_to_forward - ensures that the inserted Filelinks
 * are positioned correctly.
 */
function subtest_adding_filelinks_to_forward(aText, aWithSig) {
  let [cw, root] = prepare_some_attachments_and_forward(aText, kFiles);

  let br = assert_next_nodes("br", root, 1);
  let forwardDiv = br.nextSibling;
  Assert.equal(forwardDiv.localName, "div");
  Assert.ok(forwardDiv.classList.contains("moz-forward-container"));

  if (aText.length) {
    // If there was text typed in, it should be separated from the root by two
    // br's
    let br = assert_previous_nodes("br", root, 2);
    assert_previous_text(br.previousSibling, aText);
  } else {
    // Otherwise, there's only 1 br, and that br should be the first element
    // of the message body.
    let br = assert_previous_nodes("br", root, 1);
    let mailBody = get_compose_body(cw);
    Assert.equal(br, mailBody.firstChild);
  }

  close_compose_window(cw);
}

/**
 * Test that if we convert a Filelink from one provider to another, that the
 * old Filelink is removed, and a new Filelink is added for the new provider.
 * We test this on both HTML and plaintext mail.
 */
add_task(function test_converting_filelink_updates_urls() {
  try_with_plaintext_and_html_mail(subtest_converting_filelink_updates_urls);
});

/**
 * Subtest for test_converting_filelink_updates_urls that creates two
 * storage provider accounts, uploads files to one, converts them to the
 * other, and ensures that the attachment links in the message body get
 * get updated.
 */
function subtest_converting_filelink_updates_urls() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let providerA = new MockCloudfileAccount();
  let providerB = new MockCloudfileAccount();
  providerA.init("providerA", {
    serviceName: "MochiTest A",
    serviceURL: "https://www.provider-A.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });
  providerB.init("providerB", {
    serviceName: "MochiTest B",
    serviceURL: "https://www.provider-B.org",
  });

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, providerA);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerA/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
      {
        url: "http://www.example.com/providerA/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
    ],
    `Expected values in uploads array #5`
  );
  let [, , UrlsA] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  // Convert each Filelink to providerB, ensuring that the URLs are replaced.
  uploads = [];
  for (let i = 0; i < kFiles.length; ++i) {
    select_attachments(cw, i);
    uploads.push(...convert_selected_to_cloud_attachment(cw, providerB));
  }
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerB/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest B",
        serviceURL: "https://www.provider-B.org",
      },
      {
        url: "http://www.example.com/providerB/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest B",
        serviceURL: "https://www.provider-B.org",
      },
    ],
    `Expected values in uploads array #6`
  );
  let [, , UrlsB] = wait_for_attachment_urls(cw, kFiles.length, uploads);
  Assert.notEqual(UrlsA, UrlsB, "The original URL should have been replaced");

  close_compose_window(cw);
}

/**
 * Test that if we rename a Filelink, that the old Filelink is removed, and a
 * new Filelink is added. We test this on both HTML and plaintext mail.
 */
add_task(function test_renaming_filelink_updates_urls() {
  try_with_plaintext_and_html_mail(subtest_renaming_filelink_updates_urls);
});

/**
 * Subtest for test_renaming_filelink_updates_urls that uploads a file to a
 * storage provider account, renames the upload, and ensures that the attachment
 * links in the message body get get updated.
 */
function subtest_renaming_filelink_updates_urls() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("providerA", {
    serviceName: "MochiTest A",
    serviceURL: "https://www.provider-A.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerA/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
      {
        url: "http://www.example.com/providerA/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
    ],
    `Expected values in uploads array before renaming the files`
  );

  let [, , Urls1] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  // Rename each Filelink, ensuring that the URLs are replaced.
  let newNames = ["testFile1Renamed", "testFile2Renamed"];
  uploads = [];
  for (let i = 0; i < kFiles.length; ++i) {
    select_attachments(cw, i);
    uploads.push(rename_selected_cloud_attachment(cw, newNames[i]));
  }

  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerA/testFile1Renamed",
        name: "testFile1Renamed",
        leafName: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
      {
        url: "http://www.example.com/providerA/testFile2Renamed",
        name: "testFile2Renamed",
        leafName: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceURL: "https://www.provider-A.org",
      },
    ],
    `Expected values in uploads array after renaming the files`
  );

  let [, , Urls2] = wait_for_attachment_urls(cw, kFiles.length, uploads);
  Assert.notEqual(Urls1, Urls2, "The original URL should have been replaced");

  close_compose_window(cw);
}

/**
 * Test that if we convert a Filelink to a normal attachment that the
 * Filelink is removed from the message body.
 */
add_task(function test_converting_filelink_to_normal_removes_url() {
  try_with_plaintext_and_html_mail(
    subtest_converting_filelink_to_normal_removes_url
  );
});

/**
 * Subtest for test_converting_filelink_to_normal_removes_url that adds
 * some Filelinks to an email, and then converts those Filelinks back into
 * normal attachments, checking to ensure that the links are removed from
 * the body of the email.
 */
function subtest_converting_filelink_to_normal_removes_url() {
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("providerC", {
    serviceName: "MochiTest C",
    serviceURL: "https://www.provider-C.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerC/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest C",
        serviceURL: "https://www.provider-C.org",
      },
      {
        url: "http://www.example.com/providerC/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest C",
        serviceURL: "https://www.provider-C.org",
      },
    ],
    `Expected values in uploads array #7`
  );
  let [root, list] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  for (let i = 0; i < kFiles.length; ++i) {
    let [selectedItem] = select_attachments(cw, i);
    cw.window.convertSelectedToRegularAttachment();

    // Check that the cloud icon has been removed.
    Assert.equal(
      selectedItem.querySelector("img.attachmentcell-icon").src,
      `moz-icon://${selectedItem.attachment.name}?size=16`,
      `CloudIcon should be correctly removed for ${selectedItem.attachment.name}`
    );

    let urls = list.querySelectorAll(".cloudAttachmentItem");
    Assert.equal(urls.length, kFiles.length - (i + 1));
  }

  // At this point, the root should also have been removed.
  let mailBody = get_compose_body(cw);
  root = mailBody.querySelector("#cloudAttachmentListRoot");
  if (root) {
    throw new Error("Should not have found the cloudAttachmentListRoot");
  }

  close_compose_window(cw);
}

/**
 * Tests that if the user manually removes the Filelinks from the message body
 * that it doesn't break future Filelink insertions. Tests both HTML and
 * plaintext composers.
 */
add_task(function test_filelinks_work_after_manual_removal() {
  try_with_plaintext_and_html_mail(subtest_filelinks_work_after_manual_removal);
});

/**
 * Subtest that first adds some Filelinks to the message body, removes them,
 * and then adds another Filelink ensuring that the new URL is successfully
 * inserted.
 */
function subtest_filelinks_work_after_manual_removal() {
  // Insert some Filelinks...
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("providerD", {
    serviceName: "MochiTest D",
    serviceURL: "https://www.provider-D.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });

  let cw = open_compose_new_mail();
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerD/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest D",
        serviceURL: "https://www.provider-D.org",
      },
      {
        url: "http://www.example.com/providerD/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest D",
        serviceURL: "https://www.provider-D.org",
      },
    ],
    `Expected values in uploads array #8`
  );
  let [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  // Now remove the root node from the document body
  root.remove();

  gMockFilePicker.returnFiles = collectFiles(["./data/testFile3"]);
  uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerD/testFile3",
        name: "testFile3",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest D",
        serviceURL: "https://www.provider-D.org",
      },
    ],
    `Expected values in uploads array #9`
  );
  [root] = wait_for_attachment_urls(cw, 1, uploads);

  close_compose_window(cw);
}

/**
 * Test that if the users selection caret is on a newline when the URL
 * insertion occurs, that the caret does not move when the insertion is
 * complete. Tests both HTML and plaintext composers.
 */
add_task(function test_insertion_restores_caret_point() {
  try_with_plaintext_and_html_mail(subtest_insertion_restores_caret_point);
});

/**
 * Subtest that types some things into the composer, finishes on two
 * linebreaks, inserts some Filelink URLs, and then types some more,
 * ensuring that the selection is where we expect it to be.
 */
function subtest_insertion_restores_caret_point() {
  // Insert some Filelinks...
  gMockFilePicker.returnFiles = collectFiles(kFiles);
  let provider = new MockCloudfileAccount();
  provider.init("providerE", {
    serviceName: "MochiTest E",
    serviceURL: "https://www.provider-E.org",
  });

  let cw = open_compose_new_mail();

  // Put the selection at the beginning of the document...
  let editor = cw.window.GetCurrentEditor();
  editor.beginningOfDocument();

  // Do any necessary typing, ending with two linebreaks.
  type_in_composer(cw, ["Line 1", "Line 2", "", ""]);

  // Attach some Filelinks.
  let uploads = add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "http://www.example.com/providerE/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest E",
        serviceURL: "https://www.provider-E.org",
      },
      {
        url: "http://www.example.com/providerE/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest E",
        serviceURL: "https://www.provider-E.org",
      },
    ],
    `Expected values in uploads array #10`
  );
  let [root] = wait_for_attachment_urls(cw, kFiles.length, uploads);

  // Type some text.
  const kTypedIn = "Test";
  type_in_composer(cw, [kTypedIn]);

  // That text should be inserted just above the root attachment URL node.
  let br = assert_previous_nodes("br", root, 1);
  assert_previous_text(br.previousSibling, [kTypedIn]);

  close_compose_window(cw);
}
