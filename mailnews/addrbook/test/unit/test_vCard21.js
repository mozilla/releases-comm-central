/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_task(async () => {
  function check(vCardLines, expectedProps) {
    checkWithCase(vCardLines, expectedProps.slice(), false);
    checkWithCase(
      vCardLines,
      expectedProps.map(p => {
        if (p.params?.type) {
          p.params.type = p.params.type.toLowerCase();
        }
        return p;
      }),
      true
    );
  }

  function checkWithCase(vCardLines, expectedProps, lowerCase) {
    let vCard = `BEGIN:VCARD\r\nVERSION:2.1\r\n${vCardLines}\r\nEND:VCARD\r\n`;
    if (lowerCase) {
      vCard = vCard.toLowerCase();
    }
    info(vCard);
    const abCard = VCardUtils.vCardToAbCard(vCard);
    for (const propertyEntry of abCard.vCardProperties.entries) {
      const index = expectedProps.findIndex(
        p =>
          p.name == propertyEntry.name &&
          p.value.toString() == propertyEntry.value.toString()
      );
      Assert.greater(index, -1);
      const [prop] = expectedProps.splice(index, 1);
      Assert.deepEqual(propertyEntry.params, prop.params ?? {});
    }

    for (const { name, value } of expectedProps) {
      ok(false, `expected ${name}=${value} not found`);
    }
  }

  // Different types of phone number.
  check("TEL:1234567", [{ name: "tel", value: "1234567" }]);
  check("TEL;PREF:1234567", [
    { name: "tel", value: "1234567", params: { pref: 1 } },
  ]);
  check("TEL;CELL:1234567", [
    { name: "tel", value: "1234567", params: { type: "CELL" } },
  ]);
  check("TEL;CELL;PREF:1234567", [
    { name: "tel", value: "1234567", params: { type: "CELL", pref: 1 } },
  ]);
  check("TEL;HOME:1234567", [
    { name: "tel", value: "1234567", params: { type: "HOME" } },
  ]);
  check("TEL;HOME;PREF:1234567", [
    { name: "tel", value: "1234567", params: { type: "HOME", pref: 1 } },
  ]);
  check("TEL;VOICE:1234567", [{ name: "tel", value: "1234567" }]);
  check("TEL;VOICE;PREF:1234567", [
    { name: "tel", value: "1234567", params: { pref: 1 } },
  ]);
  check("TEL;WORK:1234567", [
    { name: "tel", value: "1234567", params: { type: "WORK" } },
  ]);
  check("TEL;WORK;PREF:1234567", [
    { name: "tel", value: "1234567", params: { type: "WORK", pref: 1 } },
  ]);

  // Combinations of phone number types.
  check("TEL;CELL:1234567\r\nTEL;HOME:9876543", [
    { name: "tel", value: "1234567", params: { type: "CELL" } },
    { name: "tel", value: "9876543", params: { type: "HOME" } },
  ]);
  check("TEL;CELL;PREF:1234567\r\nTEL;HOME:9876543", [
    { name: "tel", value: "1234567", params: { type: "CELL", pref: 1 } },
    { name: "tel", value: "9876543", params: { type: "HOME" } },
  ]);

  // Phone number preference.
  check("TEL;CELL;PREF:1234567\r\nTEL;CELL:9876543", [
    { name: "tel", value: "1234567", params: { type: "CELL", pref: 1 } },
    { name: "tel", value: "9876543", params: { type: "CELL" } },
  ]);
  check("TEL;CELL:1234567\r\nTEL;CELL;PREF:9876543", [
    { name: "tel", value: "9876543", params: { type: "CELL", pref: 1 } },
    { name: "tel", value: "1234567", params: { type: "CELL" } },
  ]);

  // Different types of email.
  check("EMAIL:pref@invalid", [{ name: "email", value: "pref@invalid" }]);
  check("EMAIL;PREF:pref@invalid", [
    { name: "email", value: "pref@invalid", params: { pref: 1 } },
  ]);
  check("EMAIL;WORK:work@invalid", [
    { name: "email", value: "work@invalid", params: { type: "WORK" } },
  ]);
  check("EMAIL;WORK;PREF:work@invalid", [
    { name: "email", value: "work@invalid", params: { type: "WORK", pref: 1 } },
  ]);
  check("EMAIL;HOME:home@invalid", [
    { name: "email", value: "home@invalid", params: { type: "HOME" } },
  ]);
  check("EMAIL;HOME;PREF:home@invalid", [
    { name: "email", value: "home@invalid", params: { type: "HOME", pref: 1 } },
  ]);
  check("EMAIL;INTERNET:mail@invalid", [
    { name: "email", value: "mail@invalid" },
  ]);

  // Email preference.
  check("EMAIL;PREF:pref@invalid\r\nEMAIL:other@invalid", [
    { name: "email", value: "pref@invalid", params: { pref: 1 } },
    { name: "email", value: "other@invalid" },
  ]);
  check("EMAIL:other@invalid\r\nEMAIL;PREF:pref@invalid", [
    { name: "email", value: "pref@invalid", params: { pref: 1 } },
    { name: "email", value: "other@invalid" },
  ]);

  // Address types. Multiple types are allowed, some we don't care about.
  check("ADR:;;street;town;state", [
    { name: "adr", value: ["", "", "street", "town", "state"] },
  ]);
  check("ADR;WORK:;;street;town;state", [
    {
      name: "adr",
      value: ["", "", "street", "town", "state"],
      params: { type: "WORK" },
    },
  ]);
  check("ADR;HOME:;;street;town;state", [
    {
      name: "adr",
      value: ["", "", "street", "town", "state"],
      params: { type: "HOME" },
    },
  ]);
  check("ADR;DOM:;;street;town;state", [
    { name: "adr", value: ["", "", "street", "town", "state"] },
  ]);
  check("ADR;POSTAL;WORK:;;street;town;state", [
    {
      name: "adr",
      value: ["", "", "street", "town", "state"],
      params: { type: "WORK" },
    },
  ]);
  check("ADR;PARCEL;HOME:;;street;town;state", [
    {
      name: "adr",
      value: ["", "", "street", "town", "state"],
      params: { type: "HOME" },
    },
  ]);

  // Quoted-printable handling.
  check("FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=74=C3=A9=24=74=20=23=31", [
    { name: "fn", value: "té$t #1" },
  ]);
  check(
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=74=65=73=74=20=F0=9F=92=A9",
    [{ name: "fn", value: "test 💩" }]
  );
  check("ORG;QUOTED-PRINTABLE:=74=65=73=74 #3", [
    { name: "org", value: "test #3" },
  ]);
  check("N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C5=82ast;=C6=92irst", [
    { name: "n", value: ["łast", "ƒirst"] },
  ]);
  check(
    "NOTE;QUOTED-PRINTABLE:line 1=0D=0A=\nline 2=0D=0A=\nline 3\r\nNICKNAME:foo=\r\nTITLE:bar=",
    [
      { name: "note", value: "line 1\r\nline 2\r\nline 3" },
      { name: "nickname", value: "foo=" },
      { name: "title", value: "bar=" },
    ]
  );
  check(
    "NOTE;QUOTED-PRINTABLE:line 1=0D=0A=\r\nline 2=0D=0A=\r\nline 3\r\nNICKNAME:foo=\r\nTITLE:bar=",
    [
      { name: "note", value: "line 1\r\nline 2\r\nline 3" },
      { name: "nickname", value: "foo=" },
      { name: "title", value: "bar=" },
    ]
  );
});
