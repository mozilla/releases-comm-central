/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsMsgUtils.h"

// Invocation:
// $ ./mach gtest "TestMsgUtils.*"

// Test PercentEncode().
TEST(TestMsgUtils, PercentEncode)
{
  nsCString got;
  // Encode nothing.
  got = PercentEncode("foo%%%"_ns, [](char c) -> bool { return false; });
  ASSERT_EQ(got, "foo%%%"_ns);
  // Make sure non-latin characters can pass through OK.
  got = PercentEncode("グレープフルーツ"_ns,
                      [](char c) -> bool { return false; });
  ASSERT_EQ(got, "グレープフルーツ"_ns);

  // Encode everything.
  got = PercentEncode("foo"_ns, [](char c) -> bool { return true; });
  ASSERT_EQ(got, "%66%6F%6F"_ns);

  // Multi-byte codepoints encode correctly?
  got = PercentEncode("foo"_ns, [](char c) -> bool { return true; });
  ASSERT_EQ(got, "%66%6F%6F"_ns);

  // Just encode '%'.
  got =
      PercentEncode("100% Agree!"_ns, [](char c) -> bool { return c == '%'; });
  ASSERT_EQ(got, "100%25 Agree!"_ns);
}

// Test EncodeFilename() and DecodeFilename().
TEST(TestMsgUtils, EncodeFilename)
{
  struct {
    nsLiteralCString input;   // UTF-8 string.
    nsLiteralString encoded;  // Filename-safe version (UTF-16).
  } encodingTests[] = {
      // No escaping required:
      {"Inbox"_ns, u"Inbox"_ns},
      {"wibble_"_ns, u"wibble_"_ns},
      {"wibble-"_ns, u"wibble-"_ns},
      {"Peas & Carrots"_ns, u"Peas & Carrots"_ns},
      {"グレープフルーツ"_ns, u"グレープフルーツ"_ns},
      {"Ì̷͚̫͌̿̎̆̀̈̕ͅn̶̡̛̖͓͓̩̠͕͍͈̝̦̪͒̉̈̃̿̅̍ͅb̷̨̡̧͇̮̈́̽̒͌́̈͒̇̾́̏̃͝͝ǫ̵̛̩̥̮͙͔̜̬̮̤̠́́̒̑̐͋̏̓̃͒̐x̷̧̛͉̳̭͓͔̭̾͐̄͒̆͐͊͒̍̕"_ns, u"Ì̷͚̫͌̿̎̆̀̈̕ͅn̶̡̛̖͓͓̩̠͕͍͈̝̦̪͒̉̈̃̿̅̍ͅb̷̨̡̧͇̮̈́̽̒͌́̈͒̇̾́̏̃͝͝ǫ̵̛̩̥̮͙͔̜̬̮̤̠́́̒̑̐͋̏̓̃͒̐x̷̧̛͉̳̭͓͔̭̾͐̄͒̆͐͊͒̍̕"_ns},  // Zalgo text (about 200 bytes long).
      // Escape special chars:
      {"C:\\AUTOEXEC.BAT"_ns, u"C%3A%5CAUTOEXEC.BAT"_ns},
      {"foo/bar"_ns, u"foo%2Fbar"_ns},
      {"75% Proof"_ns, u"75%25 Proof"_ns},
      {"Wibble\\Pibble"_ns, u"Wibble%5CPibble"_ns},
      {">*:|:*<"_ns, u"%3E%2A%3A%7C%3A%2A%3C"_ns},
      {"Some \"quoted\" text"_ns, u"Some %22quoted%22 text"_ns},
      {"Any questions?"_ns, u"Any questions%3F"_ns},
      // Handle forbidden filenames:
      {"CON"_ns, u"%43%4F%4E"_ns},
      {"COM1.txt"_ns, u"%43%4F%4D%31.txt"_ns},
      {"LPT\u00B3"_ns, u"%4C%50%54%C2%B3"_ns},  // LPT^3
      // Things that might be mistaken for forbidden filenames but actually
      // don't require any change:
      {"CONTACTS"_ns, u"CONTACTS"_ns},
      {"foo.COM1"_ns, u"foo.COM1"_ns},

      // Windows shell doesn't like leading/trailing ' ' or '.' chars, but
      // filesystem should be fine with them.
      // We _might_ want a rule to encode such cases for cosmetic reasons,
      // so these are a reminder to add some tests if we do so.
      {".wibble "_ns, u".wibble "_ns},
      {" wibble."_ns, u" wibble."_ns},
  };

  for (auto const& t : encodingTests) {
    auto safeName = EncodeFilename(t.input);
    ASSERT_EQ(safeName, t.encoded);
    // Make sure the reverse trip works too.
    ASSERT_EQ(DecodeFilename(safeName), t.input);
  }
}

// Illustrate that multiple file encodings can decode to the same string.
TEST(TestMsgUtils, FilenameEncodingIsNotUnique)
{
  // This is what EncodeFilename() likely would have done...
  ASSERT_EQ(DecodeFilename(u"foo%2Fbar"_ns), "foo/bar"_ns);
  // ...but other inputs will also give the same output:
  ASSERT_EQ(DecodeFilename(u"foo/bar"_ns), "foo/bar"_ns);
  ASSERT_EQ(DecodeFilename(u"%66%6f%6f%2fbar"_ns), "foo/bar"_ns);
}
