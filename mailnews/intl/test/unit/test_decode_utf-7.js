// Tests conversion from UTF-7 to Unicode. The conversion should fail!

var inString =
  "+LGI--+ITIipSIp- +AocCeQ-oddns +Ad0CjQ- s+ATECZQKH- p+AlAB3QJ5- u+AlACVA- no+Ao4- +Al8-I";

var expectedString =
  "+LGI--+ITIipSIp- +AocCeQ-oddns +Ad0CjQ- s+ATECZQKH- p+AlAB3QJ5- u+AlACVA- no+Ao4- +Al8-I";

var aliases = [
  "UTF-7",
  "utf-7",
  "x-unicode-2-0-utf-7",
  "unicode-2-0-utf-7",
  "unicode-1-1-utf-7",
  "csunicode11utf7",
];

function run_test() {
  const converter = CreateScriptableConverter();
  for (let i = 0; i < aliases.length; ++i) {
    checkDecode(converter, aliases[i], inString, expectedString);
  }
}
