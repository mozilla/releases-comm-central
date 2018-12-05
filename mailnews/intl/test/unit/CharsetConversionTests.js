var CC = Components.Constructor;

function CreateScriptableConverter()
{
  var ScriptableUnicodeConverter =
    CC("@mozilla.org/intl/scriptableunicodeconverter",
       "nsIScriptableUnicodeConverter");

  return new ScriptableUnicodeConverter();
}

function checkDecode(converter, charset, inText, expectedText)
{
  let manager = Cc['@mozilla.org/charset-converter-manager;1']
                  .getService(Ci.nsICharsetConverterManager);

  try {
    converter.charset = manager.getCharsetAlias(charset);
  } catch(e) {
    converter.charset = "iso-8859-1";
  }

  dump("testing decoding from " + charset + " to Unicode.\n");
  try {
    var outText = converter.ConvertToUnicode(inText) + converter.Finish();
  } catch(e) {
    outText = "\ufffd";
  }
  Assert.equal(outText, expectedText);
}

function checkEncode(converter, charset, inText, expectedText)
{
  let manager = Cc['@mozilla.org/charset-converter-manager;1']
                  .getService(Ci.nsICharsetConverterManager);

  try {
    converter.charset = manager.getCharsetAlias(charset);
  } catch(e) {
    converter.charset = "iso-8859-1";
  }

  dump("testing encoding from Unicode to " + charset + "\n");
  var outText = converter.ConvertFromUnicode(inText) + converter.Finish();
  Assert.equal(outText, expectedText);
}

function testDecodeAliases()
{
  var converter = CreateScriptableConverter();
  for (var i = 0; i < aliases.length; ++i) {
    checkDecode(converter, aliases[i], inString, expectedString);
  }
}

function testEncodeAliases()
{
  var converter = CreateScriptableConverter();
  for (var i = 0; i < aliases.length; ++i) {
    checkEncode(converter, aliases[i], inString, expectedString);
  }
}

function testDecodeAliasesInternal()
{
  let manager = Cc['@mozilla.org/charset-converter-manager;1']
                  .getService(Ci.nsICharsetConverterManager);
  let converter = CreateScriptableConverter();
  converter.isInternal = true;
  for (let i = 0; i < aliases.length; ++i) {
    if (manager.getCharsetAlias(aliases[i]).toLowerCase() == "utf-7") {
      Assert.equal(manager.utf7ToUnicode(inString), expectedString);
    } else {
      checkDecode(converter, aliases[i], inString, expectedString);
    }
  }
}

function testEncodeAliasesInternal()
{
  var converter = CreateScriptableConverter();
  converter.isInternal = true;
  for (var i = 0; i < aliases.length; ++i) {
    checkEncode(converter, aliases[i], inString, expectedString);
  }
}
