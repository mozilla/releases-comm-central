/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
function makeHeader({ subject = "Subject", flags = 0 } = {}) {
  const date = new Date(2026, 0, 2, 3, 4, 59, 999);
  return {
    date: date.getTime() * 1000,
    flags,
    mime2DecodedAuthor: "Sender <sender@example.invalid>",
    mime2DecodedSubject: subject,
  };
}

add_task(function test_getEmlFilenameBase() {
  Assert.equal(MailUtils.getEmlFilenameBase(makeHeader()), "Subject");
  Assert.equal(
    MailUtils.getEmlFilenameBase(
      makeHeader({ flags: Ci.nsMsgMessageFlags.HasRe })
    ),
    "Re: Subject"
  );
  Assert.equal(
    MailUtils.getEmlFilenameBase(
      makeHeader({ subject: "", flags: Ci.nsMsgMessageFlags.HasRe }),
      { fallbackName: "No Subject" }
    ),
    "Re: No Subject"
  );
  Assert.equal(
    MailUtils.getEmlFilenameBase(makeHeader(), {
      includeAuthorAndDate: true,
    }),
    "Subject - Sender <sender@example.invalid> - 2026-01-02 0304"
  );
  Assert.equal(
    MailUtils.getEmlFilenameBase(makeHeader({ subject: "" }), {
      includeAuthorAndDate: true,
    }),
    " - Sender <sender@example.invalid> - 2026-01-02 0304",
    "the extended form should keep an empty subject"
  );
  Assert.equal(
    MailUtils.getEmlFilenameBase(makeHeader({ subject: "" }), {
      fallbackName: "",
    }),
    "",
    "an explicit empty fallback should override the default"
  );
});

add_task(function test_defaultEmlFilenameBase() {
  const l10n = new Localization(["messenger/messenger.ftl"], true);
  const expectedFilename = l10n.formatValueSync(
    "messenger-default-save-message-file-name"
  );
  const nameBase = MailUtils.getEmlFilenameBase(makeHeader({ subject: "" }));
  Assert.equal(
    MailUtils.generateUniqueFilenames([nameBase + ".eml"])[0],
    expectedFilename,
    "the compact form should use the localized default filename"
  );
  Assert.equal(
    MailUtils.getEmlFilenameBase(
      makeHeader({ subject: "", flags: Ci.nsMsgMessageFlags.HasRe })
    ),
    `Re: ${nameBase}`,
    "the reply prefix should precede the localized fallback"
  );
});

add_task(function test_sanitizeFileName() {
  for (const [input, expected] of [
    ["Re: 100% done <***Wheee!***>", "Re_ 100_ done (___Wheee!___)"],
    ['"quoted"/file\\name?', "'quoted'_file_name_"],
    ["a\u0000b\u001fc", "a_b_c"],
    ["CON", "_CON"],
    ["CONIN$", "_CONIN$"],
    ["conin$.eml", "_conin$.eml"],
    ["CONOUT$", "_CONOUT$"],
    ["conout$.EML", "_conout$.EML"],
    ["con.txt", "_con.txt"],
    ["CON .txt", "_CON .txt"],
    ["NUL.tar.gz", "_NUL.tar.gz"],
    ["COM\u00b9.eml", "_COM\u00b9.eml"],
    ["console.txt", "console.txt"],
    [" .hidden ", ".hidden"],
    ["\u00a0name\u00a0", "name"],
    [" file. . ", "file"],
    ["", ""],
  ]) {
    Assert.equal(
      MailUtils.sanitizeFileName(input),
      expected,
      `${JSON.stringify(input)} should be sanitized to ${JSON.stringify(expected)}`
    );
  }
  const pref = "mail.save_msg_filename_underscores_for_space";
  Services.prefs.setBoolPref(pref, true);
  registerCleanupFunction(() => Services.prefs.clearUserPref(pref));
  Assert.equal(
    MailUtils.sanitizeFileName("100% done"),
    "100__done",
    "the sanitizer should read the underscores preference"
  );
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames(["a b.txt", "a_b.txt"]),
    ["a_b.txt", "a_b-2.txt"],
    "the generator should resolve collisions after applying the preference"
  );
  Services.prefs.clearUserPref(pref);
});

add_task(function test_generateUniqueFilenames() {
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames([
      "Subject.eml",
      "subject.eml",
      "Subject-2.eml",
      "Re: Subject.eml",
      "CON.eml",
      "",
    ]),
    [
      "Subject.eml",
      "subject-2.eml",
      "Subject-2-2.eml",
      "Re_ Subject.eml",
      "_CON.eml",
      "_",
    ],
    "generated filenames should be sanitized and unique within the batch"
  );
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames([
      "CONIN$.eml",
      "conin$.eml",
      "CONOUT$.eml",
      "conout$.eml",
    ]),
    ["_CONIN$.eml", "_conin$-2.eml", "_CONOUT$.eml", "_conout$-2.eml"],
    "console device names should be sanitized and resolved case-insensitively"
  );
});

add_task(function test_generateUniqueFilenamesWithExtensions() {
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames([
      "message.eml",
      "message.txt",
      "MESSAGE.EML",
      "archive.tar.gz",
      "archive.tar.gz",
      "README",
      "readme",
      ".hidden",
      ".hidden",
      ".config.json",
      ".config.json",
      "",
      " ",
    ]),
    [
      "message.eml",
      "message.txt",
      "MESSAGE-2.EML",
      "archive.tar.gz",
      "archive.tar-2.gz",
      "README",
      "readme-2",
      ".hidden",
      ".hidden-2",
      ".config.json",
      ".config-2.json",
      "_",
      "_-2",
    ],
    "counters should precede the final extension and preserve extensionless names and dotfiles"
  );
});

add_task(function test_generateUniqueFilenamesWithNativeSanitization() {
  const names = MailUtils.generateUniqueFilenames(["100%.eml", "100_.eml"]);
  const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  const sanitizedNames = names.map(name =>
    mimeService.validateFileNameForSaving(
      name,
      "",
      Ci.nsIMIMEService.VALIDATE_SANITIZE_ONLY
    )
  );
  Assert.equal(
    new Set(sanitizedNames).size,
    names.length,
    "generated filenames should remain unique after native drag sanitization"
  );
  Assert.deepEqual(
    names,
    ["100_.eml", "100_-2.eml"],
    "percent signs should be replaced before resolving collisions"
  );
  Assert.deepEqual(
    sanitizedNames,
    names,
    "native drag sanitization should preserve the generated filenames"
  );
});

add_task(function test_repeatedFilenameBases() {
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames([
      "Subject.eml",
      "Subject-2.eml",
      "Subject.eml",
      "subject.eml",
      "Subject.eml",
      "Subject-6.eml",
      "Subject.eml",
      "Subject.eml",
    ]),
    [
      "Subject.eml",
      "Subject-2.eml",
      "Subject-3.eml",
      "subject-4.eml",
      "Subject-5.eml",
      "Subject-6.eml",
      "Subject-7.eml",
      "Subject-8.eml",
    ],
    "reused counters should still check occupied names across different bases"
  );
  const names = MailUtils.generateUniqueFilenames(
    Array(100).fill("a".repeat(300) + ".eml")
  );
  Assert.equal(
    new Set(names).size,
    100,
    "every repeated base should produce a unique name"
  );
  const prefix = "a".repeat(60);
  for (const [index, tail, counter] of [
    [0, 18, ""],
    [1, 16, "-2"],
    [9, 15, "-10"],
    [99, 14, "-100"],
  ]) {
    Assert.equal(
      names[index],
      `${prefix}...${"a".repeat(tail)}${counter}.eml`,
      "shortened names should preserve their ending and collision counter"
    );
  }
});

add_task(function test_distinctShortenedBases() {
  const prefix = "a".repeat(60);
  Assert.deepEqual(
    MailUtils.generateUniqueFilenames([
      prefix + "first middle123456789012345678.eml",
      prefix + "other middle123456789012345678.eml",
    ]),
    [
      `${prefix}...123456789012345678.eml`,
      `${prefix}...3456789012345678-2.eml`,
    ],
    "distinct bases that shorten to the same name should receive collision counters"
  );
});

add_task(function test_counterWidthCollisions() {
  const prefix = "a".repeat(60);
  const tail = "z".repeat(15);
  const names = MailUtils.generateUniqueFilenames(
    ["x", "y"].flatMap(letter =>
      Array(10).fill(prefix + "m".repeat(30) + letter + tail + ".eml")
    )
  );
  Assert.equal(
    names[8],
    `${prefix}...x${tail}-9.eml`,
    "a one-digit counter should retain the distinct ending"
  );
  Assert.equal(
    names[9],
    `${prefix}...${tail}-10.eml`,
    "a two-digit counter should shorten the ending further"
  );
  Assert.equal(
    names[18],
    `${prefix}...y${tail}-9.eml`,
    "distinct endings should keep their first available one-digit counters"
  );
  Assert.equal(
    names[19],
    `${prefix}...${tail}-11.eml`,
    "endings that merge at two digits should share the next counter"
  );
});

add_task(function test_shortenFilenames() {
  const character = "\u{1f600}";
  const names = MailUtils.generateUniqueFilenames([
    character.repeat(100) + ".eml",
    character.repeat(100) + ".eml",
  ]);
  Assert.deepEqual(
    names,
    [
      `${character.repeat(60)}...${character.repeat(18)}.eml`,
      `${character.repeat(60)}...${character.repeat(16)}-2.eml`,
    ],
    "shortening should preserve whole code points and collision counters"
  );
  const extension = "." + character.repeat(30);
  const [filename] = MailUtils.generateUniqueFilenames([
    "subject".repeat(100) + extension,
  ]);
  Assert.ok(
    filename.endsWith(extension),
    "shortening should preserve a long Unicode extension"
  );
  const [deviceName] = MailUtils.generateUniqueFilenames([
    "CON" + " ".repeat(57) + "subject".repeat(10) + ".eml",
  ]);
  Assert.equal(
    MailUtils.sanitizeFileName(deviceName),
    deviceName,
    "shortening should not introduce a reserved device name"
  );

  const ending = " - 2000-02-01 0700.eml";
  const [saveAsFilename] = MailUtils.generateUniqueFilenames([
    "subject".repeat(100) + ending,
  ]);
  Assert.ok(
    saveAsFilename.endsWith(ending),
    "shortening should preserve the date ending"
  );
});

add_task(function test_exactFilenameLimits() {
  const extensionlessName = "\u{1f600}".repeat(85);
  Assert.equal(
    MailUtils.generateUniqueFilenames([extensionlessName])[0],
    extensionlessName,
    "an extensionless filename of 85 code points should remain intact"
  );
  for (const base of [
    "a".repeat(30),
    "a".repeat(81),
    "郵".repeat(81),
    "\u{1f600}".repeat(79) + "ab",
  ]) {
    Assert.equal(
      MailUtils.generateUniqueFilenames([base + ".eml"])[0],
      base + ".eml",
      "a name of at most 85 code points should remain intact"
    );
  }
  for (const base of [
    "a".repeat(82),
    "郵".repeat(82),
    "\u{1f600}".repeat(82),
  ]) {
    const names = MailUtils.generateUniqueFilenames([
      base + ".eml",
      base + ".eml",
    ]);
    for (const filename of names) {
      Assert.lessOrEqual(
        [...filename].length,
        85,
        "the complete filename should fit the code point limit"
      );
      Assert.ok(filename.includes("..."), "an over-budget name should shorten");
      Assert.ok(filename.endsWith(".eml"), "the extension should survive");
      Assert.ok(
        filename.isWellFormed(),
        "shortening should preserve code points"
      );
    }
    Assert.ok(
      names[1].endsWith("-2.eml"),
      "a collision should keep its counter"
    );
  }
  Assert.ok(
    MailUtils.generateUniqueFilenames([
      "a".repeat(81) + ".eml",
      "a".repeat(81) + ".eml",
    ])[1].includes("..."),
    "a counter should shorten a name that initially fits exactly"
  );
});

add_task(function test_lineTerminatorFilenameLimits() {
  for (const separator of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    const base = ("\u{1f600}" + separator + "a").repeat(100);
    const filename = MailUtils.generateUniqueFilenames([base + ".eml"])[0];
    Assert.lessOrEqual(
      [...filename].length,
      85,
      "line terminators should not bypass the code point limit"
    );
    Assert.ok(!/[\r\n]/.test(filename), "ASCII controls should be sanitized");
    Assert.ok(filename.includes("..."), "the long input should be shortened");
    Assert.ok(
      filename.endsWith(".eml"),
      "the intended extension should survive"
    );
    Assert.ok(
      filename.isWellFormed(),
      "shortening should preserve code points"
    );
  }
});
