/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test diacritics handling in search terms, controlled by mail.matchdiacritics.
 */

const Contains = Ci.nsMsgSearchOp.Contains;
const DoesntContain = Ci.nsMsgSearchOp.DoesntContain;
const Is = Ci.nsMsgSearchOp.Is;
const Isnt = Ci.nsMsgSearchOp.Isnt;
const BeginsWith = Ci.nsMsgSearchOp.BeginsWith;
const EndsWith = Ci.nsMsgSearchOp.EndsWith;
const Subject = Ci.nsMsgSearchAttrib.Subject;

const NEVER = 0;
const ALWAYS = 1;
const AUTO = 2;

const searchSession = Cc[
  "@mozilla.org/messenger/searchSession;1"
].createInstance(Ci.nsIMsgSearchSession);

function encodeWord(str) {
  const bytes = new TextEncoder().encode(str);
  return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`;
}

/**
 * Match `headerValue` against a subject search term for `needle`.
 *
 * @param {nsMsgSearchOpValue} op
 * @param {string} needle - The string the user searched for.
 * @param {string} headerValue - The decoded header value to match against.
 * @returns {boolean}
 */
function match(op, needle, headerValue) {
  const term = searchSession.createTerm();
  const value = term.value;
  value.attrib = Subject;
  value.str = needle;
  term.attrib = Subject;
  term.value = value;
  term.op = op;
  // matchRfc2047String() takes a raw ACString, which XPConnect would mangle
  // for non-ASCII input, so hand it an encoded word instead.
  return term.matchRfc2047String(encodeWord(headerValue), "UTF-8", false);
}

add_task(function testAuto() {
  Services.prefs.setIntPref("mail.matchdiacritics", AUTO);

  // The bug 506064 case: an unaccented search term finds accented text.
  Assert.ok(
    match(Contains, "paris", "Vacaciones en París"),
    "'paris' should find 'París' in auto mode"
  );
  Assert.ok(
    match(Contains, "PARIS", "Vacaciones en París"),
    "matching should still be case insensitive when folding diacritics"
  );
  Assert.ok(
    match(Contains, "parís", "Vacaciones en París"),
    "'parís' should find 'París' in auto mode"
  );

  // ...but an accented search term stays exact, so languages where these are
  // distinct letters don't lose precision. See bug 506064 comment 11.
  Assert.ok(
    !match(Contains, "parís", "hoteles paris"),
    "'parís' should not find 'paris' in auto mode"
  );
  Assert.ok(
    !match(Contains, "för", "for now"),
    "'för' should not find 'for' in auto mode"
  );
  Assert.ok(
    match(Contains, "för", "för nu"),
    "'för' should find 'för' in auto mode"
  );
});

add_task(function testNever() {
  Services.prefs.setIntPref("mail.matchdiacritics", NEVER);

  Assert.ok(
    match(Contains, "paris", "Vacaciones en París"),
    "'paris' should find 'París' when never matching diacritics"
  );
  Assert.ok(
    match(Contains, "parís", "hoteles paris"),
    "'parís' should find 'paris' when never matching diacritics"
  );
  Assert.ok(
    match(Contains, "för", "for now"),
    "'för' should find 'for' when never matching diacritics"
  );
});

add_task(function testAlways() {
  Services.prefs.setIntPref("mail.matchdiacritics", ALWAYS);

  Assert.ok(
    !match(Contains, "paris", "Vacaciones en París"),
    "'paris' should not find 'París' when always matching diacritics"
  );
  Assert.ok(
    !match(Contains, "parís", "hoteles paris"),
    "'parís' should not find 'paris' when always matching diacritics"
  );
  Assert.ok(
    match(Contains, "parís", "Vacaciones en París"),
    "'parís' should find 'París' when always matching diacritics"
  );
});

add_task(function testOperators() {
  Services.prefs.setIntPref("mail.matchdiacritics", AUTO);

  Assert.ok(match(Is, "paris", "París"), "Is should ignore diacritics");
  Assert.ok(!match(Isnt, "paris", "París"), "Isnt should ignore diacritics");
  Assert.ok(
    match(BeginsWith, "paris", "París en mayo"),
    "BeginsWith should ignore diacritics"
  );
  Assert.ok(
    match(EndsWith, "paris", "Vacaciones en París"),
    "EndsWith should ignore diacritics"
  );
  Assert.ok(
    !match(DoesntContain, "paris", "Vacaciones en París"),
    "DoesntContain should ignore diacritics"
  );

  Assert.ok(!match(Is, "parís", "Paris"), "Is should honour a typed diacritic");
  Assert.ok(
    match(Isnt, "parís", "Paris"),
    "Isnt should honour a typed diacritic"
  );
});

add_task(function testCombiningMarks() {
  Services.prefs.setIntPref("mail.matchdiacritics", AUTO);

  // Decomposed (NFD) text must fold the same way as precomposed (NFC) text.
  Assert.ok(
    match(Contains, "paris", "Vacaciones en Pari\u0301s"),
    "'paris' should find decomposed 'Par\u00eds'"
  );
  Assert.ok(
    match(Contains, "paris", "Vacaciones en Par\u00eds"),
    "'paris' should find precomposed 'Par\u00eds'"
  );
});

add_task(function testNeedleThatFoldsToNothing() {
  // A term of only combining marks folds to the empty string, so once
  // diacritics are ignored the empty-needle guards in MatchString decide the
  // result. In auto mode such a term counts as accented and stays exact.
  Services.prefs.setIntPref("mail.matchdiacritics", NEVER);

  Assert.ok(
    !match(Contains, "\u0301", "Vacaciones en Par\u00eds"),
    "a term of only combining marks should not match everything"
  );
  Assert.ok(
    match(DoesntContain, "\u0301", "Vacaciones en Par\u00eds"),
    "DoesntContain with a term of only combining marks should always match"
  );
});

add_task(function testAsciiFallbacks() {
  Services.prefs.setIntPref("mail.matchdiacritics", AUTO);

  // Letters with a single-character ASCII fallback fold to it.
  Assert.ok(match(Contains, "sorensen", "Sørensen"), "'o' should find 'ø'");
  Assert.ok(match(Contains, "lodz", "Łódź"), "'l' should find 'Ł'");
  Assert.ok(
    !match(Contains, "Sørensen", "Sorensen"),
    "'ø' should not find 'o' in auto mode"
  );

  // Letters whose fallback is longer than one character are left alone,
  // because folding them would change the length of the string.
  Assert.ok(!match(Contains, "aegir", "Ægir"), "'ae' should not find 'Æ'");
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mail.matchdiacritics");
});
