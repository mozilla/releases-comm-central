/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for the formatFileSize method.
 */

var gStringBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

function isDigit(c) {
  return "0123456789".includes(c);
}

function test_formatFileSize(aArgs) {
  const strings = {
    b: "byteAbbreviation2",
    kb: "kiloByteAbbreviation2",
    mb: "megaByteAbbreviation2",
    gb: "gigaByteAbbreviation2",
    tb: "teraByteAbbreviation2",
    pb: "petaByteAbbreviation2",
  };

  let actual = gMessenger.formatFileSize(aArgs.bytes, aArgs.useKB);
  let expected = gStringBundle
    .GetStringFromName(strings[aArgs.units])
    .replace("%.*f", aArgs.mantissa);

  // If the actual string contains a non-numeric character at the position
  // where we'd expect a decimal separator, assume it is a localized separator
  // and just convert it to a dot for easy comparing.
  let separatorPos = aArgs.mantissa.indexOf(".");
  if (!isDigit(actual.charAt(separatorPos))) {
    actual =
      actual.substring(0, separatorPos) + "." + actual.substr(separatorPos + 1);
  }

  Assert.equal(actual, expected);
}

var test_data = [
  { bytes: 0, useKB: false, mantissa: "0", units: "b" },
  { bytes: 1, useKB: false, mantissa: "1", units: "b" },
  { bytes: 10, useKB: false, mantissa: "10", units: "b" },
  { bytes: 999, useKB: false, mantissa: "999", units: "b" },
  { bytes: 1000, useKB: false, mantissa: "1.0", units: "kb" },
  { bytes: 1024, useKB: false, mantissa: "1.0", units: "kb" },
  { bytes: 10 * 1024, useKB: false, mantissa: "10.0", units: "kb" },
  { bytes: 999 * 1024, useKB: false, mantissa: "999", units: "kb" },
  { bytes: 1000 * 1024, useKB: false, mantissa: "1.0", units: "mb" },
  { bytes: 1024 * 1024, useKB: false, mantissa: "1.0", units: "mb" },
  { bytes: 10 * 1024 * 1024, useKB: false, mantissa: "10.0", units: "mb" },
  { bytes: 999 * 1024 * 1024, useKB: false, mantissa: "999", units: "mb" },
  { bytes: 1000 * 1024 * 1024, useKB: false, mantissa: "1.0", units: "gb" },
  { bytes: 1024 * 1024 * 1024, useKB: false, mantissa: "1.0", units: "gb" },
  {
    bytes: 10 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "10.0",
    units: "gb",
  },
  {
    bytes: 999 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "999",
    units: "gb",
  },
  {
    bytes: 1000 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1.0",
    units: "tb",
  },
  {
    bytes: 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1.0",
    units: "tb",
  },
  {
    bytes: 10 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "10.0",
    units: "tb",
  },
  {
    bytes: 999 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "999",
    units: "tb",
  },
  {
    bytes: 1000 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1.0",
    units: "pb",
  },
  {
    bytes: 1000 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1.0",
    units: "pb",
  },
  {
    bytes: 1024 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1.0",
    units: "pb",
  },
  {
    bytes: 10 * 1024 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "10.0",
    units: "pb",
  },
  {
    bytes: 999 * 1024 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "999",
    units: "pb",
  },
  {
    bytes: 1000 * 1024 * 1024 * 1024 * 1024 * 1024,
    useKB: false,
    mantissa: "1000",
    units: "pb",
  },

  { bytes: 0, useKB: true, mantissa: "0", units: "kb" },
  { bytes: 1, useKB: true, mantissa: "0.1", units: "kb" },
  { bytes: 500, useKB: true, mantissa: "0.5", units: "kb" },
  { bytes: 999, useKB: true, mantissa: "1.0", units: "kb" },
];

add_task(function test_format_file_size() {
  test_data.map(entry => {
    test_formatFileSize(entry);
  });
});
