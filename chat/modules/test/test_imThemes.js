/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  initHTMLDocument,
  insertHTMLForMessage,
  getHTMLForMessage,
} = ChromeUtils.import("resource:///modules/imThemes.jsm");
const { MockDocument } = ChromeUtils.import(
  "resource://testing-common/MockDocument.jsm"
);

add_task(function test_initHTMLDocument() {
  const window = {};
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    "<head></head><body></body>"
  );
  Object.defineProperty(document, "defaultView", {
    value: window,
  });
  const conversation = {
    title: "test",
  };
  const theme = {
    baseURI: "chrome://messenger-messagestyles/skin/test/",
    variant: "default",
    metadata: {},
    html: {
      footer: "",
      script: 'console.log("hi");',
    },
  };
  initHTMLDocument(conversation, theme, document);
  equal(typeof document.defaultView.convertTimeUnits, "function");
  equal(document.querySelector("base").href, theme.baseURI);
  ok(
    document.querySelector(
      'link[rel="stylesheet"][href="chrome://chat/skin/conv.css"]'
    )
  );
  ok(document.querySelector('link[rel="stylesheet"][href="main.css"]'));

  equal(document.body.id, "ibcontent");
  ok(document.getElementById("Chat"));
  equal(document.querySelector("script").src, theme.baseURI + "inline.js");
});

add_task(function test_insertHTMLForMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    '<body><div id="Chat"></div></body>'
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {};
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
});

add_task(function test_getHTMLForMessage() {
  const message = {
    incoming: true,
    system: false,
    message: "foo bar",
    who: "userId",
    alias: "display name",
    color: "#ffbbff",
  };
  const theme = {
    html: {
      incomingContent:
        '<span style="color: %senderColor%;">%sender%</span>%message%',
    },
  };
  const html = getHTMLForMessage(message, theme, false, false);
  equal(
    html,
    '<span style="color: #ffbbff;"><span class="ib-sender">display name</span></span><span class="ib-msg-txt">foo bar</span>'
  );
});
