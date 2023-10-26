/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for more complicated nsIAbCard functions.
 *
 * XXX At the moment these just check the functions basically work i.e. can set
 * up all the parameters correctly. We'll have to extend them as we develop
 * the address book more, especially looking towards standards etc.
 */

// Main function for the this test so we can check both personal and
// collected books work correctly in an easy manner.

function run_test() {
  loadABFile("data/cardForEmail", kPABData.fileName);

  // Test - Get the directory
  const AB = MailServices.ab.getDirectory(kPABData.URI);
  var fullCard = null;

  for (const tempCard of AB.childCards) {
    // We want the one with the right email...
    if (tempCard.primaryEmail == "PrimaryEmail1@test.invalid") {
      fullCard = tempCard;
    }
  }

  Assert.ok(fullCard != null);

  // Test - VCard.

  const actual = fullCard.translateTo("vcard");
  Assert.ok(actual.startsWith("BEGIN%3AVCARD%0D%0A"));
  Assert.ok(actual.endsWith("%0D%0AEND%3AVCARD%0D%0A"));

  const lines = decodeURIComponent(actual).split("\r\n");
  // The theory, the lines of the vCard are valid in any order, so just check
  // that they exist. In practice they are in this order.
  Assert.ok(lines.includes("EMAIL;PREF=1:PrimaryEmail1@test.invalid"), "EMAIL");
  Assert.ok(lines.includes("FN:DisplayName1"), "FN");
  Assert.ok(lines.includes("NICKNAME:NickName1"), "NICKNAME");
  Assert.ok(lines.includes("NOTE:Notes1"), "NOTE");
  Assert.ok(lines.includes("ORG:Organization1;Department1"), "ORG");
  Assert.ok(lines.includes("TITLE:JobTitle1"), "TITLE");
  Assert.ok(lines.includes("N:LastName1;FirstName1;;;"), "N");
  // These two lines wrap. If the wrapping width changes, this test will break.
  Assert.ok(
    lines.includes(
      "ADR;TYPE=home:;HomeAddress21;HomeAddress11;HomeCity1;HomeState1;HomeZipCode"
    ),
    "ADR;TYPE=home"
  );
  Assert.ok(
    lines.includes(
      "ADR;TYPE=work:;WorkAddress21;WorkAddress1;WorkCity1;WorkState1;WorkZipCode1"
    ),
    "ADR;TYPE=work"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=home;VALUE=TEXT:HomePhone1"),
    "TEL;TYPE=home"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=work;VALUE=TEXT:WorkPhone1"),
    "TEL;TYPE=work"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=fax;VALUE=TEXT:FaxNumber1"),
    "TEL;TYPE=fax"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=pager;VALUE=TEXT:PagerNumber1"),
    "TEL;TYPE=pager"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=cell;VALUE=TEXT:CellularNumber1"),
    "TEL;TYPE=cell"
  );
  Assert.ok(lines.includes("URL;TYPE=work;VALUE=URL:http://WebPage21"), "URL");
  Assert.ok(lines.includes("URL;TYPE=home;VALUE=URL:http://WebPage11"), "URL");
  Assert.ok(lines.includes("UID:fdcb9131-38ec-4daf-a4a7-2ef115f562a7"), "UID");

  // Test - XML

  // Bug 761304: Starting in TB 15, Thunderbird and SeaMonkey differ in how
  // they handle Chat / IM usernames. Unfortunately, it's not easy to multiplex
  // by appname here in XPCShell tests, so for now, we're going to make sure
  // the XML output matches what we expect from Thunderbird OR SeaMonkey. This
  // is obviously less than ideal, and we should fix this in a follow-up patch
  // in bug 761304

  const tbXml =
    "<GeneratedName>\nDisplayName1</GeneratedName>\n<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\u00D0@test.invalid</SecondEmail></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section><section><sectiontitle>Chat</sectiontitle><labelrow><label>AIM: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table>";

  const smXml =
    "<GeneratedName>\nDisplayName1</GeneratedName>\n<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\u00D0@test.invalid</SecondEmail><labelrow><label>Screen Name: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table>";

  const XmlTrans = fullCard.translateTo("xml");
  Assert.ok(XmlTrans == tbXml || XmlTrans == smXml);

  // Test - base 64

  // Bug 761304: The situation here is the same as for XML with respect to the
  // difference between Thunderbird and SeaMonkey. We'll deal with this in a
  // follow-up to bug 761304.

  const tbXmlBase64 = btoa(`<?xml version="1.0"?>
<?xml-stylesheet type="text/css" href="chrome://messagebody/skin/abPrint.css"?>
<directory>
<title xmlns="http://www.w3.org/1999/xhtml">Address Book</title>
<GeneratedName>
DisplayName1</GeneratedName>
<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\xC3\x90@test.invalid</SecondEmail></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section><section><sectiontitle>Chat</sectiontitle><labelrow><label>AIM: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table></directory>
`);

  const smXmlBase64 = btoa(`<?xml version="1.0"?>
<?xml-stylesheet type="text/css" href="chrome://messagebody/skin/abPrint.css"?>
<directory>
<title xmlns="http://www.w3.org/1999/xhtml">Address Book</title>
<GeneratedName>
DisplayName1</GeneratedName>
<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\xC3\x90@test.invalid</SecondEmail><labelrow><label>Screen Name: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table></directory>
`);

  const XmlBase64Trans = fullCard.translateTo("base64xml");

  Assert.ok(XmlBase64Trans == tbXmlBase64 || XmlBase64Trans == smXmlBase64);
}
