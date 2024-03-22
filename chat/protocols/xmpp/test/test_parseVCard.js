/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { XMPPAccountPrototype } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-base.sys.mjs"
);
var { XMPPParser } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-xml.sys.mjs"
);

/*
 * Open an input stream, instantiate an XMPP parser, and feed the input string
 * into it. Then assert that the resulting vCard matches the expected result.
 */
function _test_vcard(aInput, aExpectedResult) {
  const listener = {
    onXMLError(aError, aException) {
      // Ensure that no errors happen.
      ok(false, aError + " - " + aException);
    },
    LOG() {},
    onXmppStanza(aStanza) {
      // This is a simplified stanza parser that assumes inputs are vCards.
      const vCard = aStanza.getElement(["vCard"]);
      deepEqual(XMPPAccountPrototype.parseVCard(vCard), aExpectedResult);
    },
  };
  const parser = new XMPPParser(listener);
  parser.onDataAvailable(aInput);
  parser.destroy();
}

/*
 * Test parsing of the example vCard from XEP-0054 section 3.1, example 2.
 */
function test_standard_vcard() {
  const standard_vcard =
    "<iq xmlns='jabber:client'\
    id='v1'\
    to='stpeter@jabber.org/roundabout'\
    type='result'>\
  <vCard xmlns='vcard-temp'>\
    <FN>Peter Saint-Andre</FN>\
    <N>\
      <FAMILY>Saint-Andre</FAMILY>\
      <GIVEN>Peter</GIVEN>\
      <MIDDLE/>\
    </N>\
    <NICKNAME>stpeter</NICKNAME>\
    <URL>http://www.xmpp.org/xsf/people/stpeter.shtml</URL>\
    <BDAY>1966-08-06</BDAY>\
    <ORG>\
      <ORGNAME>XMPP Standards Foundation</ORGNAME>\
      <ORGUNIT/>\
    </ORG>\
    <TITLE>Executive Director</TITLE>\
    <ROLE>Patron Saint</ROLE>\
    <TEL><WORK/><VOICE/><NUMBER>303-308-3282</NUMBER></TEL>\
    <TEL><WORK/><FAX/><NUMBER/></TEL>\
    <TEL><WORK/><MSG/><NUMBER/></TEL>\
    <ADR>\
      <WORK/>\
      <EXTADD>Suite 600</EXTADD>\
      <STREET>1899 Wynkoop Street</STREET>\
      <LOCALITY>Denver</LOCALITY>\
      <REGION>CO</REGION>\
      <PCODE>80202</PCODE>\
      <CTRY>USA</CTRY>\
    </ADR>\
    <TEL><HOME/><VOICE/><NUMBER>303-555-1212</NUMBER></TEL>\
    <TEL><HOME/><FAX/><NUMBER/></TEL>\
    <TEL><HOME/><MSG/><NUMBER/></TEL>\
    <ADR>\
      <HOME/>\
      <EXTADD/>\
      <STREET/>\
      <LOCALITY>Denver</LOCALITY>\
      <REGION>CO</REGION>\
      <PCODE>80209</PCODE>\
      <CTRY>USA</CTRY>\
    </ADR>\
    <EMAIL><INTERNET/><PREF/><USERID>stpeter@jabber.org</USERID></EMAIL>\
    <JABBERID>stpeter@jabber.org</JABBERID>\
    <DESC>\
      More information about me is located on my\
      personal website: http://www.saint-andre.com/\
    </DESC>\
  </vCard>\
</iq>";

  const expectedResult = {
    fullName: "Peter Saint-Andre",
    // Name is not parsed.
    nickname: "stpeter",
    // URL is not parsed.
    birthday: "1966-08-06",
    organization: "XMPP Standards Foundation",
    title: "Executive Director",
    // Role is not parsed.
    // This only pulls the *last* telephone number.
    telephone: "303-555-1212",
    // Part of the address is parsed.
    locality: "Denver",
    country: "USA",
    email: "stpeter@jabber.org",
    userName: "stpeter@jabber.org", // Jabber ID.
    // Description is not parsed.
  };

  _test_vcard(standard_vcard, expectedResult);

  run_next_test();
}

/*
 * Test parsing of the example empty vCard from XEP-0054 section 3.1, example
 * 4. This can be used instead of returning an error stanza.
 */
function test_empty_vcard() {
  const empty_vcard =
    "<iq xmlns='jabber:client'\
    id='v1'\
    to='stpeter@jabber.org/roundabout'\
    type='result'>\
  <vCard xmlns='vcard-temp'/>\
</iq>";

  // There should be no properties.
  _test_vcard(empty_vcard, {});

  run_next_test();
}

function run_test() {
  add_test(test_standard_vcard);
  add_test(test_empty_vcard);

  run_next_test();
}
