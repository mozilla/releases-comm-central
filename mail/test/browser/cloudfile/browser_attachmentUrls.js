/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Filelink URL insertion behaviours in compose windows.
 */

"use strict";

var { select_attachments } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AttachmentHelpers.sys.mjs"
);
var { gMockCloudfileManager, MockCloudfileAccount } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/CloudfileHelpers.sys.mjs"
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
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var { assert_next_nodes, assert_previous_nodes, promise_element } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/DOMHelpers.sys.mjs"
  );
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,

  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var kHtmlPrefKey = "mail.identity.default.compose_html";
var kReplyOnTopKey = "mail.identity.default.reply_on_top";
var kReplyOnTop = 1;
var kReplyOnBottom = 0;
var kTextNodeType = 3;
var kSigPrefKey = "mail.identity.id1.htmlSigText";
var kSigOnReplyKey = "mail.identity.default.sig_on_reply";
var kSigOnForwardKey = "mail.identity.default.sig_on_fwd";
var kDefaultSigKey = "mail.identity.id1.htmlSigText";
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
    for (const item of Object.keys(expected[i])) {
      Assert.deepEqual(
        actual[i][item],
        expected[i][item],
        `${description}: ${item} should exist and be correct`
      );
    }
  }
}

add_setup(async function () {
  requestLongerTimeout(4);

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
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gInbox = await get_special_folder(Ci.nsMsgFolderFlags.Inbox, false, server);
  await add_message_to_folder([gInbox], create_message());

  MockFilePicker.init(window.browsingContext);
  gMockCloudfileManager.register();

  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  // Don't create paragraphs in the test.
  // The test fails if it encounters paragraphs <p> instead of breaks <br>.
  Services.prefs.setBoolPref("mail.compose.default_to_paragraph", false);
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister();
  MockFilePicker.cleanup();
  Services.prefs.clearUserPref(kDefaultSigKey);
  Services.prefs.clearUserPref(kHtmlPrefKey);
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
});

/**
 * Given some compose window, wait for some Filelink URLs to be inserted.
 *
 * Note: This function also validates, if the correct items have been added to
 *       the template (serviceUrl, downloadLimit, downloadExpiryDate,
 *       downloadPasswordProtected). There is no dedicated test for the different
 *       conditions, but the tests in this file are using different setups.
 *       See the values in the used provider.init() calls.
 *
 * @param {Window} aWin - The compose window.
 * @param {integer} aNumUrls - The number of Filelink URLs that are expected.
 * @param {object[]} aUploads - An array containing the objects returned by
 *   cloudFileAccounts.uploadFile() for all uploads.
 * @returns {object[]} An array containing the root containment node, the list
 *   node, and an array of the link URL nodes.
 */
async function promise_attachment_urls(aWin, aNumUrls, aUploads = []) {
  const mailBody = get_compose_body(aWin);

  // Wait until we can find the root attachment URL node...
  const root = await promise_element(
    mailBody.parentNode,
    "body > #cloudAttachmentListRoot"
  );

  const list = await promise_element(
    mailBody,
    "#cloudAttachmentListRoot > #cloudAttachmentList"
  );

  const header = await promise_element(
    mailBody,
    "#cloudAttachmentListRoot > #cloudAttachmentListHeader"
  );

  const footer = await promise_element(
    mailBody,
    "#cloudAttachmentListRoot > #cloudAttachmentListFooter"
  );

  let urls = null;
  await TestUtils.waitForCondition(function () {
    urls = mailBody.querySelectorAll(
      "#cloudAttachmentList > .cloudAttachmentItem"
    );
    return urls != null && urls.length == aNumUrls;
  });

  Assert.equal(
    aUploads.length,
    aNumUrls,
    "Number of links should match number of linked files."
  );

  Assert.equal(
    header.textContent,
    aNumUrls == 1
      ? `I’ve linked 1 file to this email:`
      : `I’ve linked ${aNumUrls} files to this email:`,
    "Number of links mentioned in header should matches number of linked files."
  );

  let footerExpected = false;
  for (const entry of aUploads) {
    if (!entry.serviceUrl) {
      continue;
    }

    footerExpected = true;
    Assert.ok(
      footer.innerHTML.includes(entry.serviceUrl),
      `Footer "${footer.innerHTML}" should include serviceUrl "${entry.serviceUrl}".`
    );
    Assert.ok(
      footer.innerHTML.includes(entry.serviceName),
      `Footer "${footer.innerHTML}" should include serviceName "${entry.serviceName}".`
    );
  }
  if (footerExpected) {
    Assert.ok(
      footer.innerHTML.startsWith("Learn more about"),
      `Footer "${footer.innerHTML}" should start with "Learn more about "`
    );
  } else {
    Assert.ok(
      footer.innerHTML == "",
      `Footer should be empty if no serviceUrl is specified.`
    );
  }

  const bucket = aWin.document.getElementById("attachmentBucket");

  // Check the actual content of the generated cloudAttachmentItems.
  for (let i = 0; i < urls.length; i++) {
    if (aWin.gMsgCompose.composeHTML) {
      // Test HTML message.

      const paperClipIcon = urls[i].querySelector(".paperClipIcon");
      Assert.equal(
        aUploads[i].downloadPasswordProtected
          ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIfSURBVFhH7ZfLK0RRHMfvNd6PMV4Lj5UkO5bslJIdf4ClRw2TlY2yt2EhsZO9DYoFoiSvJBZkI6SsNMyIiLnH93vmXDF5HNe9pHzqM797fufMPb+Zc4Z7jC+QBnvgJryD93AddkH2eUop3IPiHXdgCfSEdLgLOdE+bIFFSl4zZxeRAl2HXzsn2IIZTCTAHPs4hsvhOlxz3rxRtt6GfRyzJlsucw1582zZehv2cUxEtlyGN6afkThuFa7EL7+H0wK03pek4q/xJwtYVv4YumurO+4V/3vgvwAvC5iHTfHL9zFV/Ah7J9tjE9s2r/K3YwWlD8IaREP+ExPCWBDJVl+gM3LEto0nBURHCiuNpBiflvLjqWcufDFfdVbo4ly1PVoC0xrAaz4qnLdiVjk1hVhArvDRFxuSYxQeFSAaGHzCbAuEIsf0URjtsithX3i1Cf18yewKn8kWyOu+OlWXuSpKnBRwpWKxioTXi7BCtr6Ak004BZvhJAwyAUZhb3Q0bwKxXmY+xVzyB8MNOgXwE/NrC0A+clXBDZV7iYkC7GK18AcvTZ0lOFGRE5NDWAtn4A28hdPQEToFcG1Jq4qERXAZ+DCaBXk+cIROAePQgh2whgk30SngAA7CVDgLq6Fr6P4M++Ec5PmPp6BhWAdzIA+m3BOO0C2AJ2GuMyfme0KQp6Ao5EmZf/fLDGFuI2oi+EEcUQm5JDywhpWc2MFGNIwn/WmcKhqF50UAAAAASUVORK5CYII="
          : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAVFJREFUWIXtl8FKw0AQhj8EbQ/p0Ut8AVEPgYLUB+i5L6J9E0Wtr1HPgl48WU8K1Tfw4LktxUAhHvZfiMXUbdhVhB0Yms78M/NldwkJuFsD6AMjYCYfASfKBbUd4BkoKvxJmiDWKA1/AXrAtrynmIUIshJ9DXgEmt/km8oVwHEIANu8u0LTleYhBMBUzZMVmkSaSQgAe9DW1d3L/wzAqW6jJpQ3+5cA3vbW1Vz3Np6BCBABIkAE+DWAmX7TUixdynm15Wf6jf5fa3Cq60K5qrraNuHrK1kbmJcGWJ8rB9DC4yvaq5odlmK7wBB4lw8Vs9ZRzdgHwLmaXa5RM1DNmQ+AA2ABfACZgz4DctXs+QAAuMLc0dsPEJk0BXDhazjAFnCnxjlmiTuYg5kAR4rl0twCmz4BLMQAs7RVH6kLzJ17H162fczhGmO+mqa6PqXGnn8CxMN0PcC9DrQAAAAASUVORK5CYII=",
        paperClipIcon.src,
        "The paperClipIcon should be correct."
      );

      Assert.equal(
        urls[i].querySelector(".cloudfile-name").href,
        aUploads[i].url,
        "The link attached to the cloudfile name should be correct."
      );

      const providerIcon = urls[i].querySelector(".cloudfile-service-icon");
      if (providerIcon) {
        Assert.equal(
          DATA_URLS[aUploads[i].serviceIcon] || aUploads[i].serviceIcon,
          providerIcon.src,
          "The cloufile service icon should be correct."
        );
      }

      const expected = {
        url: aUploads[i].downloadPasswordProtected
          ? ".cloudfile-password-protected-link"
          : ".cloudfile-link",
        name: ".cloudfile-name",
        serviceName: ".cloudfile-service-name",
        downloadLimit: ".cloudfile-download-limit",
        downloadExpiryDateString: ".cloudfile-expiry-date",
      };

      for (const [fieldName, id] of Object.entries(expected)) {
        const element = urls[i].querySelector(id);
        Assert.ok(
          !!element == !!aUploads[i][fieldName],
          `The ${fieldName} should have been correctly added.`
        );
        if (aUploads[i][fieldName]) {
          Assert.equal(
            element.textContent,
            `${aUploads[i][fieldName]}`,
            `The cloudfile ${fieldName} should be correct.`
          );
        } else {
          Assert.equal(
            element,
            null,
            `The cloudfile ${fieldName} should not be present.`
          );
        }
      }
    } else {
      // Test plain text message.

      const lines = urls[i].textContent.split("\n");
      const expected = {
        url: aUploads[i].downloadPasswordProtected
          ? `    Password Protected Link: `
          : `    Link: `,
        name: `  * `,
        downloadLimit: `    Download Limit: `,
        downloadExpiryDateString: `    Expiry Date: `,
      };

      if (urls[i].serviceUrl) {
        expected.serviceName = `    CloudFile Service: `;
      }

      for (const [fieldName, prefix] of Object.entries(expected)) {
        if (aUploads[i][fieldName]) {
          const line = `${prefix}${aUploads[i][fieldName]}`;
          Assert.ok(
            lines.includes(line),
            `Line "${line}" should be part of "${lines}".`
          );
        } else {
          !lines.find(
            line => line.startsWith(prefix),
            `There should be no line starting with "${prefix}" part of "${lines}".`
          );
        }
      }
    }

    // Find the bucket entry for this upload.
    const items = Array.from(
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
async function prepare_some_attachments_and_reply(aText, aFiles) {
  MockFilePicker.setFiles(collectFiles(aFiles));

  const provider = new MockCloudfileAccount();
  provider.init("providerF", {
    serviceName: "MochiTest F",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    serviceUrl: "https://www.provider-F.org",
    downloadLimit: 2,
  });

  await be_in_folder(gInbox);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const cw = await open_compose_with_reply();

  // If we have any typing to do, let's do it.
  type_in_composer(cw, aText);
  const uploads = await add_cloud_attachments(cw, provider);

  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerF/testFile1",
        name: "testFile1",
        serviceName: "MochiTest F",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-F.org",
        downloadLimit: 2,
      },
      {
        url: "https://www.example.com/providerF/testFile2",
        name: "testFile2",
        serviceName: "MochiTest F",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-F.org",
        downloadLimit: 2,
      },
    ],
    `Expected values in uploads array #11`
  );
  const [root] = await promise_attachment_urls(cw, aFiles.length, uploads);

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
async function prepare_some_attachments_and_forward(aText, aFiles) {
  MockFilePicker.setFiles(collectFiles(aFiles));

  const provider = new MockCloudfileAccount();
  provider.init("providerG", {
    serviceName: "MochiTest G",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    serviceUrl: "https://www.provider-G.org",
    downloadExpiryDate: { timestamp: 1639827408073 },
  });

  await be_in_folder(gInbox);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const cw = await open_compose_with_forward();

  // Put the selection at the beginning of the document...
  const editor = cw.GetCurrentEditor();
  editor.beginningOfDocument();

  // Do any necessary typing...
  type_in_composer(cw, aText);
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerG/testFile1",
        name: "testFile1",
        serviceName: "MochiTest G",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-G.org",
        downloadExpiryDate: { timestamp: 1639827408073 },
      },
      {
        url: "https://www.example.com/providerG/testFile2",
        name: "testFile2",
        serviceName: "MochiTest G",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-G.org",
        downloadExpiryDate: { timestamp: 1639827408073 },
      },
    ],
    `Expected values in uploads array #12`
  );

  // Add the expected time string.
  const timeString = new Date(1639827408073).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  uploads[0].downloadExpiryDateString = timeString;
  uploads[1].downloadExpiryDateString = timeString;
  const [root] = await promise_attachment_urls(cw, aFiles.length, uploads);

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
async function try_with_and_without_signature_in_reply_or_fwd(
  aSpecialTest,
  aText
) {
  // By default, we have a signature included in replies, so we'll start
  // with that.
  Services.prefs.setBoolPref(kSigOnReplyKey, true);
  Services.prefs.setBoolPref(kSigOnForwardKey, true);
  await aSpecialTest(aText, true);

  Services.prefs.setBoolPref(kSigOnReplyKey, false);
  Services.prefs.setBoolPref(kSigOnForwardKey, false);
  await aSpecialTest(aText, false);
}

/**
 * Helper function that runs a test function without a signature, once
 * in HTML mode, and again in plaintext mode.
 *
 * @param aTest a test that takes no arguments.
 */
async function try_without_signature(aTest) {
  const oldSig = Services.prefs.getCharPref(kSigPrefKey);
  Services.prefs.setCharPref(kSigPrefKey, "");

  await try_with_plaintext_and_html_mail(aTest);
  Services.prefs.setCharPref(kSigPrefKey, oldSig);
}

/**
 * Helper function that runs a test function for HTML mail composition, and
 * then again in plaintext mail composition.
 *
 * @param aTest a test that takes no arguments.
 */
async function try_with_plaintext_and_html_mail(aTest) {
  await aTest();
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await aTest();
  Services.prefs.setBoolPref(kHtmlPrefKey, true);
}

/**
 * Test that if we open up a composer and immediately attach a Filelink,
 * a linebreak is inserted before the containment node in order to allow
 * the user to write before the attachment URLs.  This assumes the user
 * does not have a signature already inserted into the message body.
 */
add_task(async function test_inserts_linebreak_on_empty_compose() {
  await try_without_signature(subtest_inserts_linebreak_on_empty_compose);
});

/**
 * Subtest for test_inserts_linebreak_on_empty_compose - can be executed
 * on both plaintext and HTML compose windows.
 */
async function subtest_inserts_linebreak_on_empty_compose() {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("someKey", {
    downloadPasswordProtected: false,
  });
  const cw = await open_compose_new_mail();
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceName: "default",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "",
        downloadPasswordProtected: false,
      },
      {
        url: "https://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceName: "default",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "",
        downloadPasswordProtected: false,
      },
    ],
    `Expected values in uploads array #1`
  );
  const [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

  const br = root.previousSibling;
  Assert.equal(
    br.localName,
    "br",
    "The attachment URL containment node should be preceded by a linebreak"
  );

  const mailBody = get_compose_body(cw);

  Assert.equal(
    mailBody.firstChild,
    br,
    "The linebreak should be the first child of the compose body"
  );

  await close_compose_window(cw);
}

/**
 * Test that if we open up a composer and immediately attach a Filelink,
 * a linebreak is inserted before the containment node. This test also
 * ensures that, with a signature already in the compose window, we don't
 * accidentally insert the attachment URL containment within the signature
 * node.
 */
add_task(
  async function test_inserts_linebreak_on_empty_compose_with_signature() {
    MockFilePicker.setFiles(collectFiles(kFiles));
    const provider = new MockCloudfileAccount();
    provider.init("someKey", {
      downloadPasswordProtected: true,
    });

    let cw = await open_compose_new_mail();
    let uploads = await add_cloud_attachments(cw, provider);
    test_expected_included(
      uploads,
      [
        {
          url: "https://www.example.com/someKey/testFile1",
          name: "testFile1",
          serviceName: "default",
          serviceIcon: "chrome://messenger/content/extension.svg",
          serviceUrl: "",
          downloadPasswordProtected: true,
        },
        {
          url: "https://www.example.com/someKey/testFile2",
          name: "testFile2",
          serviceName: "default",
          serviceIcon: "chrome://messenger/content/extension.svg",
          serviceUrl: "",
          downloadPasswordProtected: true,
        },
      ],
      `Expected values in uploads array #2`
    );
    // promise_attachment_urls ensures that the attachment URL containment
    // node is an immediate child of the body of the message, so if this
    // succeeds, then we were not in the signature node.
    let [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

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

    const pre = br.nextSibling;
    Assert.equal(
      pre.localName,
      "pre",
      "The linebreak should be followed by the signature pre"
    );
    Assert.ok(
      pre.classList.contains("moz-signature"),
      "The pre should have the moz-signature class"
    );

    await close_compose_window(cw);

    Services.prefs.setBoolPref(kHtmlPrefKey, false);

    // Now let's try with plaintext mail.
    cw = await open_compose_new_mail();
    uploads = await add_cloud_attachments(cw, provider);
    test_expected_included(
      uploads,
      [
        {
          url: "https://www.example.com/someKey/testFile1",
          name: "testFile1",
          serviceIcon: "chrome://messenger/content/extension.svg",
          serviceName: "default",
          serviceUrl: "",
          downloadPasswordProtected: true,
        },
        {
          url: "https://www.example.com/someKey/testFile2",
          name: "testFile2",
          serviceIcon: "chrome://messenger/content/extension.svg",
          serviceName: "default",
          serviceUrl: "",
          downloadPasswordProtected: true,
        },
      ],
      `Expected values in uploads array #3`
    );
    [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

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

    const div = br.nextSibling;
    Assert.equal(
      div.localName,
      "div",
      "The linebreak should be followed by the signature div"
    );
    Assert.ok(
      div.classList.contains("moz-signature"),
      "The div should have the moz-signature class"
    );

    await close_compose_window(cw);

    Services.prefs.setBoolPref(kHtmlPrefKey, true);
  }
);

/**
 * Tests that removing all Filelinks causes the root node to be removed.
 */
add_task(async function test_removing_filelinks_removes_root_node() {
  await try_with_plaintext_and_html_mail(
    subtest_removing_filelinks_removes_root_node
  );
});

/**
 * Test for test_removing_filelinks_removes_root_node - can be executed
 * on both plaintext and HTML compose windows.
 */
async function subtest_removing_filelinks_removes_root_node() {
  const [cw, root] = await prepare_some_attachments_and_reply([], kFiles);

  // Now select the attachments in the attachment bucket, and remove them.
  select_attachments(cw, 0, 1);
  cw.goDoCommand("cmd_delete");

  // Wait for the root to be removed.
  const mailBody = get_compose_body(cw);
  await TestUtils.waitForCondition(function () {
    const result = mailBody.querySelector(root.id);
    return result == null;
  }, "Timed out waiting for attachment container to be removed");

  await close_compose_window(cw);
}

/**
 * Test that if we write some text in an empty message (no signature),
 * and the selection is at the end of a line of text, attaching some Filelinks
 * causes the attachment URL container to be separated from the text by
 * two br tags.
 */
add_task(async function test_adding_filelinks_to_written_message() {
  await try_without_signature(subtest_adding_filelinks_to_written_message);
});

/**
 * Subtest for test_adding_filelinks_to_written_message - generalized for both
 * HTML and plaintext mail.
 */
async function subtest_adding_filelinks_to_written_message() {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("someKey");
  const cw = await open_compose_new_mail();

  type_in_composer(cw, kLines);
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/someKey/testFile1",
        name: "testFile1",
        serviceName: "default",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "",
      },
      {
        url: "https://www.example.com/someKey/testFile2",
        name: "testFile2",
        serviceName: "default",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "",
      },
    ],
    `Expected values in uploads array #4`
  );
  const [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

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
  await close_compose_window(cw);
}

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply above the quote.
 */
add_task(async function test_adding_filelinks_to_empty_reply_above() {
  const oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);

  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_above,
    []
  );
  // Now with HTML mail...
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await try_with_and_without_signature_in_reply_or_fwd(
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
add_task(async function test_adding_filelinks_to_nonempty_reply_above() {
  const oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);

  await subtest_adding_filelinks_to_reply_above(kLines);

  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await subtest_adding_filelinks_to_reply_above_plaintext(kLines);
  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Subtest for test_adding_filelinks_to_reply_above for the plaintext composer.
 * Does some special casing for the weird br insertions that happens in
 * various cases.
 */
async function subtest_adding_filelinks_to_reply_above_plaintext(aText) {
  const [cw, root] = await prepare_some_attachments_and_reply(aText, kFiles);

  let br;
  if (aText.length) {
    br = assert_next_nodes("br", root, 2);
  } else {
    br = assert_next_nodes("br", root, 1);
  }

  const div = br.nextSibling;
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
    const msgBody = get_compose_body(cw);
    Assert.equal(
      msgBody.firstChild,
      br,
      "The linebreak should have been the first element in the " +
        "message body"
    );
  } else {
    const targetText = aText[aText.length - 1];
    const textNode = br.previousSibling;
    Assert.equal(textNode.nodeType, kTextNodeType);
    Assert.equal(textNode.nodeValue, targetText);
  }

  await close_compose_window(cw);
}

/**
 * Subtest for test_adding_filelinks_to_reply_above for the HTML composer.
 */
async function subtest_adding_filelinks_to_reply_above(aText) {
  const [cw, root] = await prepare_some_attachments_and_reply(aText, kFiles);

  // If there's any text written, then there's only a single break between the
  // end of the text and the reply. Otherwise, there are two breaks.
  const br =
    aText.length > 1
      ? assert_next_nodes("br", root, 2)
      : assert_next_nodes("br", root, 1);

  // ... which is followed by a div with a class of "moz-cite-prefix".
  const div = br.nextSibling;
  Assert.equal(
    div.localName,
    "div",
    "The linebreak should be followed by a div"
  );

  Assert.ok(div.classList.contains("moz-cite-prefix"));

  await close_compose_window(cw);
}

/**
 * Tests for inserting Filelinks into a reply, when we're configured to
 * reply below the quote.
 */
add_task(async function test_adding_filelinks_to_empty_reply_below() {
  const oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnBottom);

  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_below,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await try_with_and_without_signature_in_reply_or_fwd(
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
add_task(async function test_adding_filelinks_to_nonempty_reply_below() {
  const oldReplyOnTop = Services.prefs.getIntPref(kReplyOnTopKey);
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnBottom);

  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_reply_below,
    kLines
  );

  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_plaintext_reply_below,
    kLines
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  Services.prefs.setIntPref(kReplyOnTopKey, oldReplyOnTop);
});

/**
 * Subtest for test_adding_filelinks_to_reply_below for the HTML composer.
 */
async function subtest_adding_filelinks_to_reply_below(aText) {
  const [cw, root] = await prepare_some_attachments_and_reply(aText, kFiles);

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
    const textNode = assert_previous_text(br.previousSibling, aText);
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

  const prefix = blockquote.previousSibling;
  Assert.equal(
    prefix.localName,
    "div",
    "The blockquote should be preceded by the prefix div"
  );
  Assert.ok(
    prefix.classList.contains("moz-cite-prefix"),
    "The prefix should have the moz-cite-prefix class"
  );

  await close_compose_window(cw);
}

/**
 * Subtest for test_adding_filelinks_to_reply_below for the plaintext composer.
 */
async function subtest_adding_filelinks_to_plaintext_reply_below(aText) {
  const [cw, root] = await prepare_some_attachments_and_reply(aText, kFiles);
  let br, span;

  assert_next_nodes("br", root, 1);

  if (aText.length) {
    br = assert_previous_nodes("br", root, 2);
    // If text was entered, make sure it matches what we expect...
    const textNode = assert_previous_text(br.previousSibling, aText);
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

  const prefix = span.previousSibling;
  Assert.equal(
    prefix.localName,
    "div",
    "The blockquote should be preceded by the prefix div"
  );
  Assert.ok(
    prefix.classList.contains("moz-cite-prefix"),
    "The prefix should have the moz-cite-prefix class"
  );

  await close_compose_window(cw);
}

/**
 * Tests Filelink insertion on an inline-forward compose window with nothing
 * typed into it.
 */
add_task(async function test_adding_filelinks_to_empty_forward() {
  Services.prefs.setIntPref(kReplyOnTopKey, kReplyOnTop);
  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    []
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, true);
});

/**
 * Tests Filelink insertion on an inline-forward compose window with some
 * text typed into it.
 */
add_task(async function test_adding_filelinks_to_forward() {
  await try_with_and_without_signature_in_reply_or_fwd(
    subtest_adding_filelinks_to_forward,
    kLines
  );
  Services.prefs.setBoolPref(kHtmlPrefKey, false);
  await try_with_and_without_signature_in_reply_or_fwd(
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
async function subtest_adding_filelinks_to_forward(aText) {
  const [cw, root] = await prepare_some_attachments_and_forward(aText, kFiles);

  const br = assert_next_nodes("br", root, 1);
  const forwardDiv = br.nextSibling;
  Assert.equal(forwardDiv.localName, "div");
  Assert.ok(forwardDiv.classList.contains("moz-forward-container"));

  if (aText.length) {
    // If there was text typed in, it should be separated from the root by two
    // br's
    const br = assert_previous_nodes("br", root, 2);
    assert_previous_text(br.previousSibling, aText);
  } else {
    // Otherwise, there's only 1 br, and that br should be the first element
    // of the message body.
    const br = assert_previous_nodes("br", root, 1);
    const mailBody = get_compose_body(cw);
    Assert.equal(br, mailBody.firstChild);
  }

  await close_compose_window(cw);
}

/**
 * Test that if we convert a Filelink from one provider to another, that the
 * old Filelink is removed, and a new Filelink is added for the new provider.
 * We test this on both HTML and plaintext mail.
 */
add_task(async function test_converting_filelink_updates_urls() {
  await try_with_plaintext_and_html_mail(
    subtest_converting_filelink_updates_urls
  );
});

/**
 * Subtest for test_converting_filelink_updates_urls that creates two
 * storage provider accounts, uploads files to one, converts them to the
 * other, and ensures that the attachment links in the message body get
 * get updated.
 */
async function subtest_converting_filelink_updates_urls() {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const providerA = new MockCloudfileAccount();
  const providerB = new MockCloudfileAccount();
  providerA.init("providerA", {
    serviceName: "MochiTest A",
    serviceUrl: "https://www.provider-A.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  });
  providerB.init("providerB", {
    serviceName: "MochiTest B",
    serviceUrl: "https://www.provider-B.org",
  });

  const cw = await open_compose_new_mail();
  let uploads = await add_cloud_attachments(cw, providerA);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerA/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
      },
      {
        url: "https://www.example.com/providerA/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
      },
    ],
    `Expected values in uploads array #5`
  );
  const [, , UrlsA] = await promise_attachment_urls(cw, kFiles.length, uploads);

  // Convert each Filelink to providerB, ensuring that the URLs are replaced.
  uploads = [];
  for (let i = 0; i < kFiles.length; ++i) {
    select_attachments(cw, i);
    uploads.push(
      ...(await convert_selected_to_cloud_attachment(cw, providerB))
    );
  }
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerB/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest B",
        serviceUrl: "https://www.provider-B.org",
      },
      {
        url: "https://www.example.com/providerB/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceName: "MochiTest B",
        serviceUrl: "https://www.provider-B.org",
      },
    ],
    `Expected values in uploads array #6`
  );
  const [, , UrlsB] = await promise_attachment_urls(cw, kFiles.length, uploads);
  Assert.notEqual(UrlsA, UrlsB, "The original URL should have been replaced");

  await close_compose_window(cw);
}

/**
 * Test that if we rename a Filelink, that the old Filelink is removed, and a
 * new Filelink is added. We test this on both HTML and plaintext mail.
 */
add_task(async function test_renaming_filelink_updates_urls() {
  await try_with_plaintext_and_html_mail(
    subtest_renaming_filelink_updates_urls
  );
});

/**
 * Subtest for test_renaming_filelink_updates_urls that uploads a file to a
 * storage provider account, renames the upload, and ensures that the attachment
 * links in the message body get get updated.
 */
async function subtest_renaming_filelink_updates_urls() {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("providerA", {
    serviceName: "MochiTest A",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    serviceUrl: "https://www.provider-A.org",
    downloadExpiryDate: {
      timestamp: 1639827408073,
      format: { dateStyle: "short" },
    },
  });

  const cw = await open_compose_new_mail();
  let uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerA/testFile1",
        name: "testFile1",
        serviceName: "MochiTest A",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-A.org",
        downloadExpiryDate: {
          timestamp: 1639827408073,
          format: { dateStyle: "short" },
        },
      },
      {
        url: "https://www.example.com/providerA/testFile2",
        name: "testFile2",
        serviceName: "MochiTest A",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-A.org",
        downloadExpiryDate: {
          timestamp: 1639827408073,
          format: { dateStyle: "short" },
        },
      },
    ],
    `Expected values in uploads array before renaming the files`
  );

  // Add the expected time string.
  const timeString = new Date(1639827408073).toLocaleString(undefined, {
    dateStyle: "short",
  });
  uploads[0].downloadExpiryDateString = timeString;
  uploads[1].downloadExpiryDateString = timeString;
  const [, , Urls1] = await promise_attachment_urls(cw, kFiles.length, uploads);

  // Rename each Filelink, ensuring that the URLs are replaced.
  const newNames = ["testFile1Renamed", "testFile2Renamed"];
  uploads = [];
  for (let i = 0; i < kFiles.length; ++i) {
    select_attachments(cw, i);
    uploads.push(await rename_selected_cloud_attachment(cw, newNames[i]));
  }

  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerA/testFile1Renamed",
        name: "testFile1Renamed",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
        downloadExpiryDate: {
          timestamp: 1639827408073,
          format: { dateStyle: "short" },
        },
      },
      {
        url: "https://www.example.com/providerA/testFile2Renamed",
        name: "testFile2Renamed",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
        downloadExpiryDate: {
          timestamp: 1639827408073,
          format: { dateStyle: "short" },
        },
      },
    ],
    `Expected values in uploads array after renaming the files`
  );

  // Add the expected time string.
  uploads[0].downloadExpiryDateString = timeString;
  uploads[1].downloadExpiryDateString = timeString;
  const [, , Urls2] = await promise_attachment_urls(cw, kFiles.length, uploads);
  Assert.notEqual(Urls1, Urls2, "The original URL should have been replaced");

  await close_compose_window(cw);
}

/**
 * Test that if we convert a Filelink to a normal attachment that the
 * Filelink is removed from the message body.
 */
add_task(async function test_converting_filelink_to_normal_removes_url() {
  await try_with_plaintext_and_html_mail(
    subtest_converting_filelink_to_normal_removes_url
  );
});

/**
 * Subtest for test_converting_filelink_to_normal_removes_url that adds
 * some Filelinks to an email, and then converts those Filelinks back into
 * normal attachments, checking to ensure that the links are removed from
 * the body of the email.
 */
async function subtest_converting_filelink_to_normal_removes_url() {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("providerC", {
    serviceName: "MochiTest C",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    serviceUrl: "https://www.provider-C.org",
  });

  const cw = await open_compose_new_mail();
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerC/testFile1",
        name: "testFile1",
        serviceName: "MochiTest C",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-C.org",
      },
      {
        url: "https://www.example.com/providerC/testFile2",
        name: "testFile2",
        serviceName: "MochiTest C",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-C.org",
      },
    ],
    `Expected values in uploads array #7`
  );
  let [root, list] = await promise_attachment_urls(cw, kFiles.length, uploads);

  for (let i = 0; i < kFiles.length; ++i) {
    const [selectedItem] = select_attachments(cw, i);
    cw.convertSelectedToRegularAttachment();

    // Wait until the cloud file entry has been removed.
    await TestUtils.waitForCondition(function () {
      const urls = list.querySelectorAll(".cloudAttachmentItem");
      return urls.length == kFiles.length - (i + 1);
    });

    // Check that the cloud icon has been removed.
    Assert.equal(
      selectedItem.querySelector("img.attachmentcell-icon").src,
      `moz-icon://${selectedItem.attachment.name}?size=16`,
      `CloudIcon should be correctly removed for ${selectedItem.attachment.name}`
    );
  }

  // At this point, the root should also have been removed.
  await new Promise(resolve => setTimeout(resolve));
  const mailBody = get_compose_body(cw);
  root = mailBody.querySelector("#cloudAttachmentListRoot");
  if (root) {
    throw new Error("Should not have found the cloudAttachmentListRoot");
  }

  await close_compose_window(cw);
}

/**
 * Tests that if the user manually removes the Filelinks from the message body
 * that it doesn't break future Filelink insertions. Tests both HTML and
 * plaintext composers.
 */
add_task(async function test_filelinks_work_after_manual_removal() {
  await try_with_plaintext_and_html_mail(
    subtest_filelinks_work_after_manual_removal
  );
});

/**
 * Subtest that first adds some Filelinks to the message body, removes them,
 * and then adds another Filelink ensuring that the new URL is successfully
 * inserted.
 */
async function subtest_filelinks_work_after_manual_removal() {
  // Insert some Filelinks...
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("providerD", {
    serviceName: "MochiTest D",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    serviceUrl: "https://www.provider-D.org",
  });

  const cw = await open_compose_new_mail();
  let uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerD/testFile1",
        name: "testFile1",
        serviceName: "MochiTest D",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-D.org",
      },
      {
        url: "https://www.example.com/providerD/testFile2",
        name: "testFile2",
        serviceName: "MochiTest D",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceUrl: "https://www.provider-D.org",
      },
    ],
    `Expected values in uploads array #8`
  );
  let [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

  // Now remove the root node from the document body
  root.remove();

  MockFilePicker.setFiles(collectFiles(["./data/testFile3"]));
  uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerD/testFile3",
        name: "testFile3",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest D",
        serviceUrl: "https://www.provider-D.org",
      },
    ],
    `Expected values in uploads array #9`
  );
  [root] = await promise_attachment_urls(cw, 1, uploads);

  await close_compose_window(cw);
}

/**
 * Test that if the users selection caret is on a newline when the URL
 * insertion occurs, that the caret does not move when the insertion is
 * complete. Tests both HTML and plaintext composers.
 */
add_task(async function test_insertion_restores_caret_point() {
  await try_with_plaintext_and_html_mail(
    subtest_insertion_restores_caret_point
  );
});

/**
 * Subtest that types some things into the composer, finishes on two
 * linebreaks, inserts some Filelink URLs, and then types some more,
 * ensuring that the selection is where we expect it to be.
 */
async function subtest_insertion_restores_caret_point() {
  // Insert some Filelinks...
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("providerE", {
    serviceName: "MochiTest E",
    serviceUrl: "https://www.provider-E.org",
  });

  const cw = await open_compose_new_mail();

  // Put the selection at the beginning of the document...
  const editor = cw.GetCurrentEditor();
  editor.beginningOfDocument();

  // Do any necessary typing, ending with two linebreaks.
  type_in_composer(cw, ["Line 1", "Line 2", "", ""]);

  // Attach some Filelinks.
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerE/testFile1",
        name: "testFile1",
        serviceName: "MochiTest E",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "https://www.provider-E.org",
      },
      {
        url: "https://www.example.com/providerE/testFile2",
        name: "testFile2",
        serviceName: "MochiTest E",
        serviceIcon: "chrome://messenger/content/extension.svg",
        serviceUrl: "https://www.provider-E.org",
      },
    ],
    `Expected values in uploads array #10`
  );
  const [root] = await promise_attachment_urls(cw, kFiles.length, uploads);

  // Type some text.
  const kTypedIn = "Test";
  type_in_composer(cw, [kTypedIn]);

  // That text should be inserted just above the root attachment URL node.
  const br = assert_previous_nodes("br", root, 1);
  assert_previous_text(br.previousSibling, [kTypedIn]);

  await close_compose_window(cw);
}
