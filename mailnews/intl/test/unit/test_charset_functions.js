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
  const aliases = new Map([
    ["5601", "EUC-KR"],
    ["646", "windows-1252"],
    ["ansi-1251", "windows-1251"],
    ["big5_hkscs", "Big5"],
    ["cp-866", "IBM866"],
    ["cp874", "windows-874"],
    ["cp932", "Shift_JIS"],
    ["cp936", "GBK"],
    ["cp949", "EUC-KR"],
    ["cp950", "Big5"],
    ["csiso2022jp2", "ISO-2022-JP"],
    ["csunicode", "UTF-16LE"],
    ["csunicode11", "UTF-16BE"],
    ["csunicode11utf7", "UTF-7"],
    ["csunicodeascii", "UTF-16BE"],
    ["csunicodelatin1", "UTF-16BE"],
    ["euc_cn", "GBK"],
    ["euc_jp", "EUC-JP"],
    ["euc_kr", "EUC-KR"],
    ["iso-10646", "UTF-16BE"],
    ["iso-10646-j-1", "UTF-16BE"],
    ["iso-10646-ucs-2", "UTF-16LE"],
    ["iso-10646-ucs-basic", "UTF-16BE"],
    ["iso-10646-unicode-latin1", "UTF-16BE"],
    ["iso-2022-jp-2", "ISO-2022-JP"],
    ["iso-8859-8i", "ISO-8859-8-I"],
    ["iso2022jp", "ISO-2022-JP"],
    ["iso8859_1", "windows-1252"],
    ["iso8859_13", "ISO-8859-13"],
    ["iso8859_15", "ISO-8859-15"],
    ["iso8859_2", "ISO-8859-2"],
    ["iso8859_3", "ISO-8859-3"],
    ["iso8859_4", "ISO-8859-4"],
    ["iso8859_5", "ISO-8859-5"],
    ["iso8859_6", "ISO-8859-6"],
    ["iso8859_7", "ISO-8859-7"],
    ["iso8859_9", "windows-1254"],
    ["koi8r", "KOI8-R"],
    ["ms874", "windows-874"],
    ["ms936", "GBK"],
    ["ms949", "EUC-KR"],
    ["ms950", "Big5"],
    ["ms950_hkscs", "Big5"],
    ["tis620", "windows-874"],
    ["unicode-1-1-utf-7", "UTF-7"],
    ["unicode-2-0-utf-7", "UTF-7"],
    ["utf-7", "UTF-7"],
    ["windows-936", "GBK"],
    ["x-iso-10646-ucs-2-be", "UTF-16BE"],
    ["x-iso-10646-ucs-2-le", "UTF-16LE"],
    ["x-unicode-2-0-utf-7", "UTF-7"],
    ["x-windows-949", "EUC-KR"],
    ["zh_tw-big5", "Big5"],
  ]);
  for (const [label, name] of aliases) {
    for (const input of [label, label.toUpperCase()]) {
      Assert.equal(
        manager.getCharsetAlias(input),
        name,
        `${input} should resolve to ${name}`
      );
    }
  }
  for (const [label, name] of [
    ["utF-8", "UTF-8"],
    ["iso-8859-1", "windows-1252"],
    ["X-User-Defined", "x-user-defined"],
    [" \tUtF-8\r\n", "UTF-8"],
  ]) {
    Assert.equal(
      manager.getCharsetAlias(label),
      name,
      `${JSON.stringify(label)} should resolve to ${name}`
    );
  }
  for (const label of [
    "replacement",
    "ISO-2022-CN",
    "ISO-2022-KR",
    "HZ-GB-2312",
  ]) {
    Assert.throws(
      () => manager.getCharsetAlias(label),
      /Component returned failure code: 0x80500001/,
      `${label} should throw NS_ERROR_UCONV_NOCONV`
    );
  }
  for (const label of ["this-shouldnt-exist", " ", " utf-7 ", " cp936 "]) {
    Assert.throws(
      () => manager.getCharsetAlias(label),
      /Component returned failure code: 0x80040111/,
      `${JSON.stringify(label)} should throw NS_ERROR_NOT_AVAILABLE`
    );
  }
  Assert.throws(
    () => manager.getCharsetAlias(""),
    /Component returned failure code: 0x80070057/,
    "An empty label should throw NS_ERROR_ILLEGAL_VALUE"
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
