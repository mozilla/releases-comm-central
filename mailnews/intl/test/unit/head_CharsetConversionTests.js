var CC = Components.Constructor;

function CreateScriptableConverter() {
  var ScriptableUnicodeConverter = CC(
    "@mozilla.org/intl/scriptableunicodeconverter",
    "nsIScriptableUnicodeConverter"
  );

  return new ScriptableUnicodeConverter();
}

function checkDecode(converter, charset, inText, expectedText) {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );

  try {
    converter.charset = manager.getCharsetAlias(charset);
  } catch (e) {
    converter.charset = "iso-8859-1";
  }

  dump("testing decoding from " + charset + " to Unicode.\n");
  try {
    var outText = converter.ConvertToUnicode(inText) + converter.Finish();
  } catch (e) {
    outText = "\ufffd";
  }
  Assert.equal(outText, expectedText);
}

function checkEncode(converter, charset, inText, expectedText) {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
    Ci.nsICharsetConverterManager
  );

  try {
    converter.charset = manager.getCharsetAlias(charset);
  } catch (e) {
    converter.charset = "iso-8859-1";
  }

  dump("testing encoding from Unicode to " + charset + "\n");
  var outText = converter.ConvertFromUnicode(inText) + converter.Finish();
  Assert.equal(outText, expectedText);
}
