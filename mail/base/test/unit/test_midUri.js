/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

add_task(function test_midUriRoundTrip() {
  Assert.equal(
    MailUtils.constructMidUriSpec(""),
    "",
    "An empty Message-ID should produce an empty URI spec"
  );
  Assert.equal(
    MailUtils.constructMidUriSpec(undefined),
    "",
    "An undefined Message-ID should produce an empty URI spec"
  );
  const originalOpen = MailUtils.openMessageForMessageId;
  const openedIds = [];
  MailUtils.openMessageForMessageId = id => {
    openedIds.push(id);
    return true;
  };
  try {
    for (const [messageId, encoded] of [
      ["ordinary@example.invalid", "ordinary@example.invalid"],
      ["test%test@example.invalid", "test%25test@example.invalid"],
      ["test%25test@example.invalid", "test%2525test@example.invalid"],
      ["test#?/test@example.invalid", "test%23%3F%2Ftest@example.invalid"],
    ]) {
      const uri = MailUtils.constructMidUriSpec(messageId);
      Assert.equal(
        uri,
        `mid:${encoded}`,
        "The URI should escape the Message-ID"
      );
      MailUtils.openMidUri(uri);
      Assert.equal(
        openedIds.at(-1),
        messageId,
        "The mid URI should open the original Message-ID after decoding once"
      );
    }
  } finally {
    MailUtils.openMessageForMessageId = originalOpen;
  }
});

add_task(function test_openMidUriRejectsOtherSchemes() {
  Assert.throws(
    () => MailUtils.openMidUri("news:ordinary@example.invalid"),
    /Expected a mid: URI/,
    "A URI with another scheme should be rejected"
  );
});

add_task(function test_midUriLookupOrder() {
  const originalOpen = MailUtils.openMessageForMessageId;
  const lookups = [];
  let foundIds;
  MailUtils.openMessageForMessageId = (id, server, window, silent = false) => {
    lookups.push([id, silent]);
    return foundIds.includes(id);
  };
  try {
    for (const [description, uri, availableIds, expectedLookups] of [
      [
        "An ordinary ID should need one lookup",
        "mid:ordinary@example.invalid",
        ["ordinary@example.invalid"],
        [["ordinary@example.invalid", false]],
      ],
      [
        "An uppercase scheme should be accepted",
        "MID:ordinary@example.invalid",
        ["ordinary@example.invalid"],
        [["ordinary@example.invalid", false]],
      ],
      [
        "Leading whitespace before an uppercase scheme should be accepted",
        " \tMID:ordinary@example.invalid",
        ["ordinary@example.invalid"],
        [["ordinary@example.invalid", false]],
      ],
      [
        "An unchanged decoded ID should need one lookup",
        "mid:test+?#/test@example.invalid",
        ["test+?#/test@example.invalid"],
        [["test+?#/test@example.invalid", false]],
      ],
      [
        "A found decoded ID should stop the lookup",
        "mid:test%25@example.invalid",
        ["test%@example.invalid"],
        [["test%@example.invalid", true]],
      ],
      [
        "A legacy raw ID should be tried after a silent decoded lookup",
        "mid:test%25@example.invalid",
        ["test%25@example.invalid"],
        [
          ["test%@example.invalid", true],
          ["test%25@example.invalid", false],
        ],
      ],
      [
        "A legacy raw ID should keep its Unicode suffix",
        "mid:ü%25@example.invalid",
        ["ü%25@example.invalid"],
        [
          ["ü%@example.invalid", true],
          ["ü%25@example.invalid", false],
        ],
      ],
      [
        "The decoded ID should take precedence when both messages exist",
        "mid:abc%2B@example.invalid",
        ["abc+@example.invalid", "abc%2B@example.invalid"],
        [["abc+@example.invalid", true]],
      ],
      [
        "Two missing IDs should leave only the raw lookup non-silent",
        "mid:test%25@example.invalid",
        [],
        [
          ["test%@example.invalid", true],
          ["test%25@example.invalid", false],
        ],
      ],
      [
        "The URI should be decoded exactly once",
        "mid:test%2525@example.invalid",
        ["test%25@example.invalid", "test%@example.invalid"],
        [["test%25@example.invalid", true]],
      ],
      [
        "Fallback should use the original suffix without decoding again",
        "mid:test%2525@example.invalid",
        ["test%2525@example.invalid", "test%@example.invalid"],
        [
          ["test%25@example.invalid", true],
          ["test%2525@example.invalid", false],
        ],
      ],
    ]) {
      foundIds = availableIds;
      lookups.length = 0;
      MailUtils.openMidUri(uri);
      Assert.equal(lookups.length, expectedLookups.length, description);
      Assert.deepEqual(lookups, expectedLookups, description);
    }
  } finally {
    MailUtils.openMessageForMessageId = originalOpen;
  }
});

add_task(function test_midUriOpeningAndAlerts() {
  const originalGet = MailUtils.getMsgHdrForMsgId;
  const originalDisplay = MailUtils.displayMessage;
  const originalPrompt = Services.prompt;
  const lookups = [];
  const opened = [];
  const alerts = [];
  let foundIds;
  MailUtils.getMsgHdrForMsgId = id => {
    lookups.push(id);
    return foundIds.includes(id) ? { messageId: id } : null;
  };
  MailUtils.displayMessage = header => opened.push(header.messageId);
  Services.prompt = { alert: (...args) => alerts.push(args) };
  try {
    for (const [uri, availableIds, expectedLookups, expectedOpened] of [
      [
        "mid:test%25@example.invalid",
        ["test%@example.invalid"],
        ["test%@example.invalid"],
        ["test%@example.invalid"],
      ],
      [
        "mid:test%25@example.invalid",
        ["test%25@example.invalid"],
        ["test%@example.invalid", "test%25@example.invalid"],
        ["test%25@example.invalid"],
      ],
      [
        "mid:test%25@example.invalid",
        [],
        ["test%@example.invalid", "test%25@example.invalid"],
        [],
      ],
    ]) {
      info(`Opening ${uri} with messages ${availableIds}`);
      foundIds = availableIds;
      lookups.length = opened.length = alerts.length = 0;
      MailUtils.openMidUri(uri);
      Assert.deepEqual(lookups, expectedLookups, "Lookup order should match");
      Assert.deepEqual(opened, expectedOpened, "Only the found ID should open");
      Assert.equal(
        alerts.length,
        expectedOpened.length ? 0 : 1,
        "An alert should appear only when both IDs are missing"
      );
    }

    for (const rawId of [
      "test%ZZ@example.invalid",
      "test%test@example.invalid",
      "test%E0%A4@example.invalid",
    ]) {
      for (const found of [true, false]) {
        info(`Opening malformed URI mid:${rawId}, found: ${found}`);
        foundIds = found ? [rawId] : [];
        lookups.length = opened.length = alerts.length = 0;
        MailUtils.openMidUri(`mid:${rawId}`);
        Assert.equal(lookups.length, 1, "The raw ID should be looked up once");
        Assert.deepEqual(lookups, [rawId], "Lookup should receive the raw ID");
        Assert.deepEqual(
          opened,
          foundIds,
          "Only an existing message should open"
        );
        Assert.equal(
          alerts.length,
          found ? 0 : 1,
          "A missing raw ID should show one not-found alert"
        );
      }
    }
  } finally {
    MailUtils.getMsgHdrForMsgId = originalGet;
    MailUtils.displayMessage = originalDisplay;
    Services.prompt = originalPrompt;
  }
});

add_task(function test_openMessageForMessageId() {
  const messageId = "test%25#?/test@example.invalid";
  const msgHdr = {};
  let found = true;
  const opened = [];
  const alerts = [];
  const originalGet = MailUtils.getMsgHdrForMsgId;
  const originalDisplay = MailUtils.displayMessage;
  const originalPrompt = Services.prompt;
  MailUtils.getMsgHdrForMsgId = id => {
    Assert.equal(id, messageId, "Lookup should receive the plain Message-ID");
    return found ? msgHdr : null;
  };
  MailUtils.displayMessage = header => opened.push(header);
  Services.prompt = { alert: (...args) => alerts.push(args) };
  try {
    Assert.strictEqual(
      MailUtils.openMessageForMessageId(messageId),
      true,
      "Opening a found message should return true"
    );
    Assert.deepEqual(opened, [msgHdr], "The found message should be opened");
    Assert.equal(alerts.length, 0, "A found message should not show an alert");

    found = false;
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    const expectedAlert = [
      null,
      bundle.GetStringFromName("errorOpenMessageForMessageIdTitle"),
      bundle.formatStringFromName("errorOpenMessageForMessageIdMessage", [
        `<${messageId}>`,
      ]),
    ];
    for (const silent of [undefined, false, true]) {
      alerts.length = 0;
      Assert.strictEqual(
        MailUtils.openMessageForMessageId(messageId, null, null, silent),
        false,
        "A missing message should return false"
      );
      Assert.deepEqual(
        alerts,
        silent ? [] : [expectedAlert],
        "A missing message should show the existing alert unless silent"
      );
    }
    Assert.deepEqual(opened, [msgHdr], "Missing messages should not be opened");
  } finally {
    MailUtils.getMsgHdrForMsgId = originalGet;
    MailUtils.displayMessage = originalDisplay;
    Services.prompt = originalPrompt;
  }
});

add_task(function test_openMidUriWithDecodedNul() {
  localAccountUtils.loadLocalMailAccount();
  registerCleanupFunction(() => localAccountUtils.clearAll());

  const originalDisplay = MailUtils.displayMessage;
  const originalPrompt = Services.prompt;
  registerCleanupFunction(() => {
    MailUtils.displayMessage = originalDisplay;
    Services.prompt = originalPrompt;
  });
  const opened = [];
  const alerts = [];
  MailUtils.displayMessage = header => opened.push(header.messageId);
  Services.prompt = { alert: (...args) => alerts.push(args) };

  const messageId = "test@example.invalid";
  const rawId = `${messageId}%00suffix`;
  const db = localAccountUtils.inboxFolder.msgDatabase;
  for (const id of [messageId, rawId]) {
    const header = db.createNewHdr();
    header.messageId = id;
    db.attachHdr(header, false);
  }
  Assert.equal(
    db.getMsgHdrForMessageID(rawId).messageId,
    rawId,
    "The exact legacy ID should exist in the real database"
  );

  MailUtils.openMidUri(`mid:${rawId}`);
  Assert.deepEqual(
    opened,
    [rawId],
    "A decoded NUL should not prevent opening the exact legacy ID"
  );
  Assert.equal(
    alerts.length,
    0,
    "An existing legacy ID should not show an alert"
  );

  opened.length = 0;
  MailUtils.openMidUri(`mid:${messageId}%00missing`);
  Assert.deepEqual(
    opened,
    [],
    "A missing ID with a decoded NUL should not open the prefix message"
  );
  Assert.equal(alerts.length, 1, "A missing legacy ID should show one alert");
});
