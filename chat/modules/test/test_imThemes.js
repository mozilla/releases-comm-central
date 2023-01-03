/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  initHTMLDocument,
  insertHTMLForMessage,
  getHTMLForMessage,
  replaceHTMLForMessage,
  wasNextMessage,
  removeMessage,
  isNextMessage,
} = ChromeUtils.importESModule("resource:///modules/imThemes.sys.mjs");
const { MockDocument } = ChromeUtils.importESModule(
  "resource://testing-common/MockDocument.sys.mjs"
);

const BASIC_CONV_DOCUMENT_HTML =
  '<!DOCTYPE html><html><body><div id="Chat"></div></body></html>';

add_task(function test_initHTMLDocument() {
  const window = {};
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    "<!DOCTYPE html><html><head></head><body></body></html>"
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
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {};
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  ok(!messageElement.dataset.isNext);
});

add_task(function test_insertHTMLForMessage_next() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {};
  insertHTMLForMessage(message, html, document, true);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  ok(messageElement.dataset.isNext);
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

add_task(function test_replaceHTMLForMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  const updatedHtml =
    '<div style="background: green;">lorem ipsum</div><div id="insert"></div>';
  const updatedMessage = {
    remoteId: "foo",
  };
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, true);
  const updatedMessageElement = document.querySelector("#Chat > div");
  strictEqual(updatedMessageElement._originalMsg, updatedMessage);
  equal(updatedMessageElement.style.backgroundColor, "green");
  equal(updatedMessageElement.textContent, "lorem ipsum");
  equal(updatedMessageElement.dataset.remoteId, "foo");
  ok(updatedMessageElement.dataset.isNext);
  ok(
    !document.querySelector("#insert"),
    "Insert anchor in template is ignored when replacing"
  );
});

add_task(function test_replaceHTMLForMessageWithoutExistingMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const updatedHtml = '<div style="background: green;">lorem ipsum</div>';
  const updatedMessage = {
    remoteId: "foo",
  };
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, false);
  const updatedMessageElement = document.querySelector("#Chat > div");
  ok(!updatedMessageElement);
});

add_task(function test_replaceHTMLForMessageWithoutRemoteId() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  const updatedHtml = '<div style="background: green;">lorem ipsum</div>';
  const updatedMessage = {};
  replaceHTMLForMessage(updatedMessage, updatedHtml, document, false);
  const updatedMessageElement = document.querySelector("#Chat > div");
  strictEqual(updatedMessageElement._originalMsg, message);
  equal(updatedMessageElement.style.backgroundColor, "blue");
  equal(updatedMessageElement.textContent, "foo bar");
  equal(updatedMessageElement.dataset.remoteId, "foo");
  ok(!updatedMessageElement.dataset.isNext);
});

add_task(function test_wasNextMessage_isNext() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = "<div>foo bar</div>";
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, true);
  ok(wasNextMessage(message, document));
});

add_task(function test_wasNextMessage_isNotNext() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = "<div>foo bar</div>";
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  ok(!wasNextMessage(message, document));
});

add_task(function test_wasNextMessage_noPreviousVersion() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const message = {
    remoteId: "foo",
  };
  ok(!wasNextMessage(message, document));
});

add_task(function test_removeMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  removeMessage("foo", document);
  const messageElements = document.querySelectorAll("#Chat > div");
  equal(messageElements.length, 0);
});

add_task(function test_removeMessage_noMatchingMessage() {
  const document = MockDocument.createTestDocument(
    "chrome://chat/content/conv.html",
    BASIC_CONV_DOCUMENT_HTML
  );
  const html = '<div style="background: blue;">foo bar</div>';
  const message = {
    remoteId: "foo",
  };
  insertHTMLForMessage(message, html, document, false);
  const messageElement = document.querySelector("#Chat > div");
  strictEqual(messageElement._originalMsg, message);
  equal(messageElement.style.backgroundColor, "blue");
  equal(messageElement.textContent, "foo bar");
  equal(messageElement.dataset.remoteId, "foo");
  ok(!messageElement.dataset.isNext);
  removeMessage("bar", document);
  const messageElements = document.querySelectorAll("#Chat > div");
  notEqual(messageElements.length, 0);
});

add_task(function test_isNextMessage() {
  const theme = {
    combineConsecutive: true,
    metadata: {},
    combineConsecutiveInterval: 300,
  };
  const messagePairs = [
    {
      message: {},
      previousMessage: null,
      isNext: false,
    },
    {
      message: {
        system: true,
      },
      previousMessage: {
        system: true,
      },
      isNext: true,
    },
    {
      message: {
        who: "foo",
      },
      previousMessage: {
        who: "bar",
      },
      isNext: false,
    },
    {
      message: {
        outgoing: true,
      },
      isNext: false,
    },
    {
      message: {
        incoming: true,
      },
      isNext: false,
    },
    {
      message: {
        system: true,
      },
      isNext: false,
    },
    {
      message: {
        time: 100,
      },
      previousMessage: {
        time: 100,
      },
      isNext: true,
    },
    {
      message: {
        time: 300,
      },
      previousMessage: {
        time: 100,
      },
      isNext: true,
    },
    {
      message: {
        time: 500,
      },
      previousMessage: {
        time: 100,
      },
      isNext: false,
    },
  ];
  for (const { message, previousMessage = {}, isNext } of messagePairs) {
    equal(isNextMessage(theme, message, previousMessage), isNext);
  }
});
