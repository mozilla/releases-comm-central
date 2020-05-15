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
  let AB = MailServices.ab.getDirectory(kPABData.URI);
  var fullCard = null;

  for (let tempCard of AB.childCards) {
    // We want the one with the right email...
    if (tempCard.primaryEmail == "PrimaryEmail1@test.invalid") {
      fullCard = tempCard;
    }
  }

  Assert.ok(fullCard != null);

  // Test - VCard.

  let actual = fullCard.translateTo("vcard");
  Assert.ok(actual.startsWith("BEGIN%3AVCARD%0D%0A"));
  Assert.ok(actual.endsWith("%0D%0AEND%3AVCARD%0D%0A"));

  let lines = decodeURIComponent(actual).split("\r\n");
  // The theory, the lines of the vCard are valid in any order, so just check
  // that they exist. In practice they are in this order.
  Assert.ok(lines.includes("EMAIL:PrimaryEmail1@test.invalid"), "EMAIL");
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
  Assert.ok(lines.includes("URL;VALUE=URL:http://WebPage21"), "URL");
  Assert.ok(lines.includes("UID:fdcb9131-38ec-4daf-a4a7-2ef115f562a7"), "UID");

  // Test - XML

  // Bug 761304: Starting in TB 15, Thunderbird and SeaMonkey differ in how
  // they handle Chat / IM usernames. Unfortunately, it's not easy to multiplex
  // by appname here in XPCShell tests, so for now, we're going to make sure
  // the XML output matches what we expect from Thunderbird OR SeaMonkey. This
  // is obviously less than ideal, and we should fix this in a follow-up patch
  // in bug 761304

  let tbXml =
    "<GeneratedName>\nDisplayName1</GeneratedName>\n<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\u00D0@test.invalid</SecondEmail></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section><section><sectiontitle>Chat</sectiontitle><labelrow><label>AIM: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table>";

  let smXml =
    "<GeneratedName>\nDisplayName1</GeneratedName>\n<table><tr><td><section><labelrow><label>Display Name: </label><DisplayName>DisplayName1</DisplayName></labelrow><labelrow><label>Nickname: </label><NickName>NickName1</NickName></labelrow><PrimaryEmail>PrimaryEmail1@test.invalid</PrimaryEmail><SecondEmail>SecondEmail1\u00D0@test.invalid</SecondEmail><labelrow><label>Screen Name: </label><_AimScreenName>ScreenName1</_AimScreenName></labelrow></section></td></tr><tr><td><section><sectiontitle>Phone</sectiontitle><labelrow><label>Work: </label><WorkPhone>WorkPhone1</WorkPhone></labelrow><labelrow><label>Home: </label><HomePhone>HomePhone1</HomePhone></labelrow><labelrow><label>Fax: </label><FaxNumber>FaxNumber1</FaxNumber></labelrow><labelrow><label>Pager: </label><PagerNumber>PagerNumber1</PagerNumber></labelrow><labelrow><label>Mobile: </label><CellularNumber>CellularNumber1</CellularNumber></labelrow></section><section><sectiontitle>Other</sectiontitle><labelrow><label>Custom 1: </label><Custom1>Custom11</Custom1></labelrow><labelrow><label>Custom 2: </label><Custom2>Custom21</Custom2></labelrow><labelrow><label>Custom 3: </label><Custom3>Custom31</Custom3></labelrow><labelrow><label>Custom 4: </label><Custom4>Custom41</Custom4></labelrow><Notes>Notes1</Notes></section></td><td><section><sectiontitle>Home</sectiontitle><HomeAddress>HomeAddress11</HomeAddress><HomeAddress2>HomeAddress21</HomeAddress2><HomeCity>HomeCity1</HomeCity>, <HomeState>HomeState1</HomeState> <HomeZipCode>HomeZipCode1</HomeZipCode><HomeCountry>HomeCountry1</HomeCountry><WebPage2>http://WebPage11</WebPage2></section><section><sectiontitle>Work</sectiontitle><JobTitle>JobTitle1</JobTitle><Department>Department1</Department><Company>Organization1</Company><WorkAddress>WorkAddress1</WorkAddress><WorkAddress2>WorkAddress21</WorkAddress2><WorkCity>WorkCity1</WorkCity>, <WorkState>WorkState1</WorkState> <WorkZipCode>WorkZipCode1</WorkZipCode><WorkCountry>WorkCountry1</WorkCountry><WebPage1>http://WebPage21</WebPage1></section></td></tr></table>";

  let XmlTrans = fullCard.translateTo("xml");
  Assert.ok(XmlTrans == tbXml || XmlTrans == smXml);

  // Test - base 64

  // Bug 761304: The situation here is the same as for XML with respect to the
  // difference between Thunderbird and SeaMonkey. We'll deal with this in a
  // follow-up to bug 761304.

  // btoa is only available for xpcom components or via window.btoa, so we
  // can't use it here.

  let tbXmlBase64 =
    "PD94bWwgdmVyc2lvbj0iMS4wIj8+Cjw/eG1sLXN0eWxlc2hlZXQgdHlwZT0idGV4dC9jc3MiIGhyZWY9ImNocm9tZTovL21lc3NhZ2Vib2R5L2NvbnRlbnQvYWRkcmVzc2Jvb2svcHJpbnQuY3NzIj8+CjxkaXJlY3Rvcnk+Cjx0aXRsZSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCI+QWRkcmVzcyBCb29rPC90aXRsZT4KPEdlbmVyYXRlZE5hbWU+CkRpc3BsYXlOYW1lMTwvR2VuZXJhdGVkTmFtZT4KPHRhYmxlPjx0cj48dGQ+PHNlY3Rpb24+PGxhYmVscm93PjxsYWJlbD5EaXNwbGF5IE5hbWU6IDwvbGFiZWw+PERpc3BsYXlOYW1lPkRpc3BsYXlOYW1lMTwvRGlzcGxheU5hbWU+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPk5pY2tuYW1lOiA8L2xhYmVsPjxOaWNrTmFtZT5OaWNrTmFtZTE8L05pY2tOYW1lPjwvbGFiZWxyb3c+PFByaW1hcnlFbWFpbD5QcmltYXJ5RW1haWwxQHRlc3QuaW52YWxpZDwvUHJpbWFyeUVtYWlsPjxTZWNvbmRFbWFpbD5TZWNvbmRFbWFpbDHDkEB0ZXN0LmludmFsaWQ8L1NlY29uZEVtYWlsPjwvc2VjdGlvbj48L3RkPjwvdHI+PHRyPjx0ZD48c2VjdGlvbj48c2VjdGlvbnRpdGxlPlBob25lPC9zZWN0aW9udGl0bGU+PGxhYmVscm93PjxsYWJlbD5Xb3JrOiA8L2xhYmVsPjxXb3JrUGhvbmU+V29ya1Bob25lMTwvV29ya1Bob25lPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5Ib21lOiA8L2xhYmVsPjxIb21lUGhvbmU+SG9tZVBob25lMTwvSG9tZVBob25lPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5GYXg6IDwvbGFiZWw+PEZheE51bWJlcj5GYXhOdW1iZXIxPC9GYXhOdW1iZXI+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPlBhZ2VyOiA8L2xhYmVsPjxQYWdlck51bWJlcj5QYWdlck51bWJlcjE8L1BhZ2VyTnVtYmVyPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5Nb2JpbGU6IDwvbGFiZWw+PENlbGx1bGFyTnVtYmVyPkNlbGx1bGFyTnVtYmVyMTwvQ2VsbHVsYXJOdW1iZXI+PC9sYWJlbHJvdz48L3NlY3Rpb24+PHNlY3Rpb24+PHNlY3Rpb250aXRsZT5PdGhlcjwvc2VjdGlvbnRpdGxlPjxsYWJlbHJvdz48bGFiZWw+Q3VzdG9tIDE6IDwvbGFiZWw+PEN1c3RvbTE+Q3VzdG9tMTE8L0N1c3RvbTE+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPkN1c3RvbSAyOiA8L2xhYmVsPjxDdXN0b20yPkN1c3RvbTIxPC9DdXN0b20yPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5DdXN0b20gMzogPC9sYWJlbD48Q3VzdG9tMz5DdXN0b20zMTwvQ3VzdG9tMz48L2xhYmVscm93PjxsYWJlbHJvdz48bGFiZWw+Q3VzdG9tIDQ6IDwvbGFiZWw+PEN1c3RvbTQ+Q3VzdG9tNDE8L0N1c3RvbTQ+PC9sYWJlbHJvdz48Tm90ZXM+Tm90ZXMxPC9Ob3Rlcz48L3NlY3Rpb24+PHNlY3Rpb24+PHNlY3Rpb250aXRsZT5DaGF0PC9zZWN0aW9udGl0bGU+PGxhYmVscm93PjxsYWJlbD5BSU06IDwvbGFiZWw+PF9BaW1TY3JlZW5OYW1lPlNjcmVlbk5hbWUxPC9fQWltU2NyZWVuTmFtZT48L2xhYmVscm93Pjwvc2VjdGlvbj48L3RkPjx0ZD48c2VjdGlvbj48c2VjdGlvbnRpdGxlPkhvbWU8L3NlY3Rpb250aXRsZT48SG9tZUFkZHJlc3M+SG9tZUFkZHJlc3MxMTwvSG9tZUFkZHJlc3M+PEhvbWVBZGRyZXNzMj5Ib21lQWRkcmVzczIxPC9Ib21lQWRkcmVzczI+PEhvbWVDaXR5PkhvbWVDaXR5MTwvSG9tZUNpdHk+LCA8SG9tZVN0YXRlPkhvbWVTdGF0ZTE8L0hvbWVTdGF0ZT4gPEhvbWVaaXBDb2RlPkhvbWVaaXBDb2RlMTwvSG9tZVppcENvZGU+PEhvbWVDb3VudHJ5PkhvbWVDb3VudHJ5MTwvSG9tZUNvdW50cnk+PFdlYlBhZ2UyPmh0dHA6Ly9XZWJQYWdlMTE8L1dlYlBhZ2UyPjwvc2VjdGlvbj48c2VjdGlvbj48c2VjdGlvbnRpdGxlPldvcms8L3NlY3Rpb250aXRsZT48Sm9iVGl0bGU+Sm9iVGl0bGUxPC9Kb2JUaXRsZT48RGVwYXJ0bWVudD5EZXBhcnRtZW50MTwvRGVwYXJ0bWVudD48Q29tcGFueT5Pcmdhbml6YXRpb24xPC9Db21wYW55PjxXb3JrQWRkcmVzcz5Xb3JrQWRkcmVzczE8L1dvcmtBZGRyZXNzPjxXb3JrQWRkcmVzczI+V29ya0FkZHJlc3MyMTwvV29ya0FkZHJlc3MyPjxXb3JrQ2l0eT5Xb3JrQ2l0eTE8L1dvcmtDaXR5PiwgPFdvcmtTdGF0ZT5Xb3JrU3RhdGUxPC9Xb3JrU3RhdGU+IDxXb3JrWmlwQ29kZT5Xb3JrWmlwQ29kZTE8L1dvcmtaaXBDb2RlPjxXb3JrQ291bnRyeT5Xb3JrQ291bnRyeTE8L1dvcmtDb3VudHJ5PjxXZWJQYWdlMT5odHRwOi8vV2ViUGFnZTIxPC9XZWJQYWdlMT48L3NlY3Rpb24+PC90ZD48L3RyPjwvdGFibGU+PC9kaXJlY3Rvcnk+Cg==";

  let smXmlBase64 =
    "PD94bWwgdmVyc2lvbj0iMS4wIj8+Cjw/eG1sLXN0eWxlc2hlZXQgdHlwZT0idGV4dC9jc3MiIGhyZWY9ImNocm9tZTovL21lc3NhZ2Vib2R5L2NvbnRlbnQvYWRkcmVzc2Jvb2svcHJpbnQuY3NzIj8+CjxkaXJlY3Rvcnk+Cjx0aXRsZSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCI+QWRkcmVzcyBCb29rPC90aXRsZT4KPEdlbmVyYXRlZE5hbWU+CkRpc3BsYXlOYW1lMTwvR2VuZXJhdGVkTmFtZT4KPHRhYmxlPjx0cj48dGQ+PHNlY3Rpb24+PGxhYmVscm93PjxsYWJlbD5EaXNwbGF5IE5hbWU6IDwvbGFiZWw+PERpc3BsYXlOYW1lPkRpc3BsYXlOYW1lMTwvRGlzcGxheU5hbWU+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPk5pY2tuYW1lOiA8L2xhYmVsPjxOaWNrTmFtZT5OaWNrTmFtZTE8L05pY2tOYW1lPjwvbGFiZWxyb3c+PFByaW1hcnlFbWFpbD5QcmltYXJ5RW1haWwxQHRlc3QuaW52YWxpZDwvUHJpbWFyeUVtYWlsPjxTZWNvbmRFbWFpbD5TZWNvbmRFbWFpbDHDkEB0ZXN0LmludmFsaWQ8L1NlY29uZEVtYWlsPjxsYWJlbHJvdz48bGFiZWw+U2NyZWVuIE5hbWU6IDwvbGFiZWw+PF9BaW1TY3JlZW5OYW1lPlNjcmVlbk5hbWUxPC9fQWltU2NyZWVuTmFtZT48L2xhYmVscm93Pjwvc2VjdGlvbj48L3RkPjwvdHI+PHRyPjx0ZD48c2VjdGlvbj48c2VjdGlvbnRpdGxlPlBob25lPC9zZWN0aW9udGl0bGU+PGxhYmVscm93PjxsYWJlbD5Xb3JrOiA8L2xhYmVsPjxXb3JrUGhvbmU+V29ya1Bob25lMTwvV29ya1Bob25lPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5Ib21lOiA8L2xhYmVsPjxIb21lUGhvbmU+SG9tZVBob25lMTwvSG9tZVBob25lPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5GYXg6IDwvbGFiZWw+PEZheE51bWJlcj5GYXhOdW1iZXIxPC9GYXhOdW1iZXI+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPlBhZ2VyOiA8L2xhYmVsPjxQYWdlck51bWJlcj5QYWdlck51bWJlcjE8L1BhZ2VyTnVtYmVyPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5Nb2JpbGU6IDwvbGFiZWw+PENlbGx1bGFyTnVtYmVyPkNlbGx1bGFyTnVtYmVyMTwvQ2VsbHVsYXJOdW1iZXI+PC9sYWJlbHJvdz48L3NlY3Rpb24+PHNlY3Rpb24+PHNlY3Rpb250aXRsZT5PdGhlcjwvc2VjdGlvbnRpdGxlPjxsYWJlbHJvdz48bGFiZWw+Q3VzdG9tIDE6IDwvbGFiZWw+PEN1c3RvbTE+Q3VzdG9tMTE8L0N1c3RvbTE+PC9sYWJlbHJvdz48bGFiZWxyb3c+PGxhYmVsPkN1c3RvbSAyOiA8L2xhYmVsPjxDdXN0b20yPkN1c3RvbTIxPC9DdXN0b20yPjwvbGFiZWxyb3c+PGxhYmVscm93PjxsYWJlbD5DdXN0b20gMzogPC9sYWJlbD48Q3VzdG9tMz5DdXN0b20zMTwvQ3VzdG9tMz48L2xhYmVscm93PjxsYWJlbHJvdz48bGFiZWw+Q3VzdG9tIDQ6IDwvbGFiZWw+PEN1c3RvbTQ+Q3VzdG9tNDE8L0N1c3RvbTQ+PC9sYWJlbHJvdz48Tm90ZXM+Tm90ZXMxPC9Ob3Rlcz48L3NlY3Rpb24+PC90ZD48dGQ+PHNlY3Rpb24+PHNlY3Rpb250aXRsZT5Ib21lPC9zZWN0aW9udGl0bGU+PEhvbWVBZGRyZXNzPkhvbWVBZGRyZXNzMTE8L0hvbWVBZGRyZXNzPjxIb21lQWRkcmVzczI+SG9tZUFkZHJlc3MyMTwvSG9tZUFkZHJlc3MyPjxIb21lQ2l0eT5Ib21lQ2l0eTE8L0hvbWVDaXR5PiwgPEhvbWVTdGF0ZT5Ib21lU3RhdGUxPC9Ib21lU3RhdGU+IDxIb21lWmlwQ29kZT5Ib21lWmlwQ29kZTE8L0hvbWVaaXBDb2RlPjxIb21lQ291bnRyeT5Ib21lQ291bnRyeTE8L0hvbWVDb3VudHJ5PjxXZWJQYWdlMj5odHRwOi8vV2ViUGFnZTExPC9XZWJQYWdlMj48L3NlY3Rpb24+PHNlY3Rpb24+PHNlY3Rpb250aXRsZT5Xb3JrPC9zZWN0aW9udGl0bGU+PEpvYlRpdGxlPkpvYlRpdGxlMTwvSm9iVGl0bGU+PERlcGFydG1lbnQ+RGVwYXJ0bWVudDE8L0RlcGFydG1lbnQ+PENvbXBhbnk+T3JnYW5pemF0aW9uMTwvQ29tcGFueT48V29ya0FkZHJlc3M+V29ya0FkZHJlc3MxPC9Xb3JrQWRkcmVzcz48V29ya0FkZHJlc3MyPldvcmtBZGRyZXNzMjE8L1dvcmtBZGRyZXNzMj48V29ya0NpdHk+V29ya0NpdHkxPC9Xb3JrQ2l0eT4sIDxXb3JrU3RhdGU+V29ya1N0YXRlMTwvV29ya1N0YXRlPiA8V29ya1ppcENvZGU+V29ya1ppcENvZGUxPC9Xb3JrWmlwQ29kZT48V29ya0NvdW50cnk+V29ya0NvdW50cnkxPC9Xb3JrQ291bnRyeT48V2ViUGFnZTE+aHR0cDovL1dlYlBhZ2UyMTwvV2ViUGFnZTE+PC9zZWN0aW9uPjwvdGQ+PC90cj48L3RhYmxlPjwvZGlyZWN0b3J5Pgo=";

  let XmlBase64Trans = fullCard.translateTo("base64xml");

  Assert.ok(XmlBase64Trans == tbXmlBase64 || XmlBase64Trans == smXmlBase64);
}
