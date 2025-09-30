/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * For current reference, see
 * [Encoding Living Standard](https://encoding.spec.whatwg.org)
 */

add_task(async function test_getCharsetAlias() {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );
  Assert.throws(
    () => manager.getCharsetAlias("this-shouldnt-exist"),
    /Component returned failure code: 0x80040111/,
    `non-existent label should throw NS_ERROR_NOT_AVAILABLE`
  );
});

add_task(async function test_getCharsetLangGroup() {
  // This data comes from the now-removed charsetData.properties file. The
  // commented-out charsets did not work before either. Only "big5-hkscs" now
  // returns "zh-tw" instead of failing.
  const langGroups = new Map([
    ["BIG5", "zh-tw"],
    //    ["big5-hkscs", "zh-hk"],
    ["EUC-JP", "ja"],
    ["euc-kr", "ko"],
    ["GB2312", "zh-cn"],
    ["gb18030", "zh-cn"],
    //    ["GB18030.2000-0", "zh-cn"],
    //    ["gb18030.2000-1", "zh-cn"],
    //    ["HKSCS-1", "zh-hk"],
    ["ibm866", "x-cyrillic"],
    //    ["IBM1125", "x-cyrillic"],
    //    ["ibm1131", "x-cyrillic"],
    ["ISO-2022-JP", "ja"],
    ["iso-8859-1", "x-western"],
    ["ISO-8859-10", "x-western"],
    ["iso-8859-14", "x-western"],
    ["ISO-8859-15", "x-western"],
    ["iso-8859-2", "x-western"],
    ["ISO-8859-16", "x-western"],
    ["iso-8859-3", "x-western"],
    ["ISO-8859-4", "x-western"],
    ["iso-8859-13", "x-western"],
    ["ISO-8859-5", "x-cyrillic"],
    ["iso-8859-6", "ar"],
    ["ISO-8859-7", "el"],
    ["iso-8859-8", "he"],
    ["ISO-8859-8-I", "he"],
    //    ["jis_0208-1983", "ja"],
    ["KOI8-R", "x-cyrillic"],
    ["koi8-u", "x-cyrillic"],
    ["SHIFT_JIS", "ja"],
    ["windows-874", "th"],
    ["UTF-8", "x-unicode"],
    ["utf-16", "x-unicode"],
    ["UTF-16BE", "x-unicode"],
    ["utf-16le", "x-unicode"],
    ["UTF-7", "x-unicode"],
    //    ["replacement", "x-unicode"],
    ["WINDOWS-1250", "x-western"],
    ["windows-1251", "x-cyrillic"],
    ["WINDOWS-1252", "x-western"],
    ["windows-1253", "el"],
    ["WINDOWS-1254", "x-western"],
    ["windows-1255", "he"],
    ["WINDOWS-1256", "ar"],
    ["windows-1257", "x-western"],
    ["WINDOWS-1258", "x-western"],
    ["gbk", "zh-cn"],
    ["X-MAC-CYRILLIC", "x-cyrillic"],
    ["macintosh", "x-western"],
    ["X-USER-DEFINED", "x-unicode"],
  ]);

  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );

  for (const [charset, langGroup] of langGroups) {
    Assert.equal(
      manager.getCharsetLangGroup(charset),
      langGroup,
      `Language group for ${charset} should match`
    );
  }
});

add_task(async function test_isMultiByteCharset() {
  // This data comes from the now-removed charsetData.properties file.
  const multiByteCharsets = [
    "ISO-2022-JP",
    "shift_jis",
    "EUC-JP",
    "big5",
    "BIG5-HKSCS",
    "gb2312",
    "EUC-KR",
    "utf-7",
    "UTF-8",
    "replacement",
    // These charsets were not recognized as multi-byte charsets before,
    // but are now.
    "gbk",
    "gb18030",
    "UTF-16BE",
    "UTF-16LE",
  ];

  // Some single-byte charsets to test.
  const singleByteCharsets = [
    "WINDOWS-1252",
    "windows-874",
    "ISO-8859-2",
    "koi8-r",
    "MACINTOSH",
    "ibm866",
    "X-MAC-CYRILLIC",
    "x-user-defined",
  ];

  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );
  for (const charset of multiByteCharsets) {
    Assert.ok(
      manager.isMultiByteCharset(charset),
      `${charset} is a multi-byte charset`
    );
  }
  for (const charset of singleByteCharsets) {
    Assert.ok(
      !manager.isMultiByteCharset(charset),
      `${charset} is a single-byte charset`
    );
  }
});
