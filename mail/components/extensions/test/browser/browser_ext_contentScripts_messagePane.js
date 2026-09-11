/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that manifest content scripts are injected into web pages loaded into
 * the message pane browser, which happens when a feed message is displayed as
 * "Full Web Page".
 */

const { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);

const CONTENT_PAGE =
  "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html";

let messagePaneBrowser;

add_setup(async () => {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  await TestUtils.waitForCondition(
    () => about3Pane.messageBrowser.contentWindow?.getMessagePaneBrowser,
    "waiting for about:message to load"
  );
  messagePaneBrowser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

  registerCleanupFunction(() => {
    MailE10SUtils.loadAboutBlank(messagePaneBrowser);
  });
});

add_task(async function testContentScriptInMessagePane() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "content_script.js": () => {
        document.body.setAttribute("foo", "bar");
      },
      "content_style.css": "body { background-color: rgb(0, 255, 0); }",
    },
    manifest: {
      manifest_version: 2,
      permissions: ["http://mochi.test/*"],
      content_scripts: [
        {
          matches: ["http://mochi.test/*"],
          js: ["content_script.js"],
          css: ["content_style.css"],
          run_at: "document_idle",
        },
      ],
    },
  });
  await extension.startup();

  // This is what FeedMessageHandler.loadWebPage() does for "Full Web Page".
  MailE10SUtils.loadAboutBlank(messagePaneBrowser);
  MailE10SUtils.loadURI(messagePaneBrowser, CONTENT_PAGE);
  await awaitBrowserLoaded(messagePaneBrowser, CONTENT_PAGE);

  await checkContent(messagePaneBrowser, {
    backgroundColor: "rgb(0, 255, 0)",
    foo: "bar",
  });

  await extension.unload();
});
