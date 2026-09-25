/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(function () {
  Services.prefs.setStringPref("mailnews.localizedRe", "AW,ÆØÅ,R.,[");
  localAccountUtils.loadLocalMailAccount();
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.localizedRe");
    localAccountUtils.clearAll();
  });
});

add_task(function test_subject_utilities() {
  const cases = [
    ["Re: topic", "topic", true],
    ["Re:topic", "topic", true],
    ["Re:", "", true],
    ["Re", "Re", false],
    ["Re[", "Re[", false],
    ["Re[2]", "Re[2]", false],
    ["Re[2]:", "", true],
    [" \tRe:\t RE:  re: rE:topic  ", "topic  ", true],
    ["\vRe:\vtopic", "topic", true],
    ["Re[2]: Re(123): topic", "topic", true],
    ["Re[]: Re[2): topic", "topic", true],
    ["Re[2: topic", "Re[2: topic", false],
    ["Re: \u00a0topic", "\u00a0topic", true],
    ["AW: ÆØÅ: topic", "topic", true],
    ["aw: topic", "aw: topic", false],
    ["R.: [: topic", "topic", true],
    ["Rx: topic", "Rx: topic", false],
    ["  topic  ", "  topic  ", false],
    ["", "", false],
    ["=?UTF-8?Q?Re=3A_topic?=", "topic", true],
    ["=?UTF-8?Q?topic?=", "topic", false, false, "=?UTF-8?Q?topic?="],
    [
      "Re: =?ISO-8859-1?Q?=C6blegr=F8d?=",
      "Æblegrød",
      true,
      false,
      "=?UTF-8?B?w4ZibGVncsO4ZA==?=",
    ],
    ["Re: 日本語", "日本語", true, true, null],
    ["日本語", "日本語", false, true, null],
    ["=?UTF-8?Q?Re=3A_topic?=", "=?UTF-8?Q?Re=3A_topic?=", false, true, null],
    [
      "=?UTF-8?Q?literal?=" + "日本語".repeat(30),
      "=?UTF-8?Q?literal?=" + "日本語".repeat(30),
      false,
      true,
      null,
    ],
    [
      "Re: =?UTF-8?Q?Re=3A_topic?=",
      "=?UTF-8?Q?Re=3A_topic?=",
      true,
      true,
      null,
    ],
  ];
  for (const [
    subject,
    expected,
    hasRe,
    alreadyDecoded = false,
    legacyExpected = expected,
  ] of cases) {
    info(
      `Parsing subject ${JSON.stringify(subject)}, decoded=${alreadyDecoded}`
    );
    const decodedSubject =
      alreadyDecoded || !subject.includes("=?")
        ? subject
        : MailServices.mimeConverter.decodeMimeHeader(
            subject,
            null,
            false,
            true
          );
    const strippedSubject =
      MailServices.subjects.stripReplyPrefixes(decodedSubject);
    const hadReplyPrefix = strippedSubject != decodedSubject;
    Assert.equal(strippedSubject, expected);
    Assert.equal(hadReplyPrefix, hasRe);

    let storedSubject;
    if (alreadyDecoded || (hasRe && subject.includes("=?"))) {
      storedSubject =
        MailServices.subjects.encodeForLegacyStorage(strippedSubject);
    } else if (hasRe) {
      storedSubject = strippedSubject;
    } else {
      storedSubject = subject;
    }
    if (legacyExpected === null) {
      Assert.ok(/^=\?UTF-8\?B\?/.test(storedSubject), storedSubject);
    } else {
      Assert.equal(storedSubject, legacyExpected);
    }
    if (legacyExpected !== expected || legacyExpected === null) {
      Assert.equal(
        MailServices.mimeConverter.decodeMimeHeader(
          storedSubject,
          null,
          false,
          true
        ),
        expected
      );
    }
  }
});

add_task(function test_database_subject_is_plain_storage() {
  const db = localAccountUtils.inboxFolder.msgDatabase;
  const detached = db.createNewHdr();
  detached.flags = Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.HasRe;
  detached.subject = "copied subject";
  Assert.equal(detached.subject, "copied subject");
  Assert.equal(
    detached.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.HasRe
  );

  const live = db.attachHdr(detached, false);
  live.subject = "replacement";
  Assert.equal(live.subject, "replacement");
  Assert.equal(
    live.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.HasRe
  );
});

add_task(function test_parsed_subjects() {
  const inbox = localAccountUtils.inboxFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const decodedStorage = Services.prefs.getBoolPref(
    "mail.panorama.enabled",
    false
  );
  for (const [subject, status, expected, hasRe, legacyExpected = expected] of [
    ["=?UTF-8?Q?Re=3A_topic?=", "0000", "topic", true],
    ["=?UTF-8?Q?topic?=", "0000", "topic", false, "=?UTF-8?Q?topic?="],
    [
      "Re: =?ISO-8859-1?Q?=C6blegr=F8d?=",
      "0000",
      "Æblegrød",
      true,
      "=?UTF-8?B?w4ZibGVncsO4ZA==?=",
    ],
    ["replacement", "0010", "replacement", false],
    ["", "0010", "", false],
  ]) {
    const hdr = inbox.addMessage(
      `From: sender@example.invalid\r\n` +
        `X-Mozilla-Status: ${status}\r\n` +
        `Subject: ${subject}\r\n\r\nBody\r\n`
    );
    Assert.equal(hdr.subject, decodedStorage ? expected : legacyExpected);
    Assert.equal(hdr.mime2DecodedSubject, expected);
    Assert.equal(Boolean(hdr.flags & Ci.nsMsgMessageFlags.HasRe), hasRe);
  }
});

add_task(
  {
    skip_if: () => Services.prefs.getBoolPref("mail.panorama.enabled", false),
  },
  function test_nntp_subjects() {
    const { NntpNewsGroup } = ChromeUtils.importESModule(
      "resource:///modules/NntpNewsGroup.sys.mjs"
    );
    const group = new NntpNewsGroup(null, localAccountUtils.inboxFolder);
    group.processXOverLine(
      "10001\t=?UTF-8?Q?Re=3A_topic?=\tfrom@example.invalid\t11 Sep 2026 12:00:00 +0000\t<subject@example.invalid>\t\t100\t2"
    );
    const overviewHdr = group._msgHdrs[0];
    Assert.equal(overviewHdr.subject, "topic");
    Assert.ok(overviewHdr.flags & Ci.nsMsgMessageFlags.HasRe);
    Assert.ok(overviewHdr.flags & Ci.nsMsgMessageFlags.New);

    group.initHdr(10002);
    group.processHeadLine("Subject: Re[2]:topic");
    Assert.equal(group._msgHdr.subject, "topic");
    Assert.ok(group._msgHdr.flags & Ci.nsMsgMessageFlags.HasRe);
    group.processHeadLine("Subject: replacement");
    Assert.equal(group._msgHdr.subject, "replacement");
    Assert.ok(!(group._msgHdr.flags & Ci.nsMsgMessageFlags.HasRe));
  }
);
