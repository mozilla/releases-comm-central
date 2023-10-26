// Tests conversion from UTF-7 to Unicode.

var inString =
  "+LGI--+ITIipSIp- +AocCeQ-oddns +Ad0CjQ- s+ATECZQKH- p+AlAB3QJ5- u+AlACVA- no+Ao4- +Al8-I";

var expectedString =
  "\u2C62-\u2132\u22A5\u2229 \u0287\u0279oddns \u01DD\u028D s\u0131\u0265\u0287 p\u0250\u01DD\u0279 u\u0250\u0254 no\u028E \u025FI";

var aliases = [
  "UTF-7",
  "utf-7",
  "x-unicode-2-0-utf-7",
  "unicode-2-0-utf-7",
  "unicode-1-1-utf-7",
  "csunicode11utf7",
];
function run_test() {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );
  const converter = CreateScriptableConverter();
  converter.isInternal = true;
  for (let i = 0; i < aliases.length; ++i) {
    if (manager.getCharsetAlias(aliases[i]).toLowerCase() == "utf-7") {
      Assert.equal(manager.utf7ToUnicode(inString), expectedString);
    } else {
      checkDecode(converter, aliases[i], inString, expectedString);
    }
  }
}
