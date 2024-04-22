/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { XMPPParser } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-xml.sys.mjs"
);

const expectedResult =
  '<presence xmlns="jabber:client" from="chat@example.com/Étienne" to="user@example.com/Thunderbird" \
xml:lang="en" id="5ed0ae8b7051fa6169037da4e2a1ded6"><c xmlns="http://jabber.org/protocol/caps" \
ver="ZyB1liM9c9GvKOnvl61+5ScWcqw=" node="https://example.com" hash="sha-1"/><x \
xmlns="vcard-temp:x:update"><photo xmlns="vcard-temp:x:update"/></x><idle xmlns="urn:xmpp:idle:1" \
since="2021-04-13T11:52:16.538713+00:00"/><occupant-id xmlns="urn:xmpp:occupant-id:0" \
id="wNZPCZIVQ51D/heZQpOHi0ZgHXAEQonNPaLdyzLxHWs="/><x xmlns="http://jabber.org/protocol/muc#user"><item \
xmlns="http://jabber.org/protocol/muc#user" jid="example@example.com/client" affiliation="member" \
role="participant"/></x></presence>';
const byteVersion = new TextEncoder().encode(expectedResult);
const utf8Input = Array.from(byteVersion, byte =>
  String.fromCharCode(byte)
).join("");

var TEST_DATA = [
  {
    input:
      '<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</body>\
</message>',
    output:
      '<message xmlns="jabber:client" \
from="juliet@capulet.example/balcony" to="romeo@montague.example/garden" \
type="chat"><body xmlns="jabber:client">What man art thou that, thus \
bescreen"d in night, so stumblest on my counsel?</body>\
</message>',
    isError: false,
    description: "Message stanza with body element",
  },
  {
    input:
      '<message xmlns="jabber:client" from="romeo@montague.example" \
to="romeo@montague.example/home" type="chat">\
<received xmlns="urn:xmpp:carbons:2">\
<forwarded xmlns="urn:xmpp:forward:0">\
<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</body>\
<thread>0e3141cd80894871a68e6fe6b1ec56fa</thread>\
</message>\
</forwarded>\
</received>\
</message>',
    output:
      '<message xmlns="jabber:client" from="romeo@montague.example" \
to="romeo@montague.example/home" type="chat">\
<received xmlns="urn:xmpp:carbons:2"><forwarded xmlns="urn:xmpp:forward:0">\
<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body xmlns="jabber:client">What man art thou that, thus bescreen"d in night, \
so stumblest on my counsel?</body>\
<thread xmlns="jabber:client">0e3141cd80894871a68e6fe6b1ec56fa</thread>\
</message>\
</forwarded>\
</received>\
</message>',
    isError: false,
    description: "Forwarded copy of message carbons",
  },
  {
    input:
      '<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?\
</message>',
    output: "",
    isError: true,
    description: "No closing of body tag",
  },
  {
    input:
      '<message xmlns="http://etherx.jabber.org/streams" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</body>\
</message>',
    output: "",
    isError: true,
    description: "Invalid namespace of top-level element",
  },
  {
    input:
      '<field xmlns="jabber:x:data" type="fixed">\
<value>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</value>\
</field>',
    output: "",
    isError: true,
    description: "Invalid top-level element",
  },
  {
    input: utf8Input,
    output: expectedResult,
    isError: false,
    description: "UTF-8 encoded content from socket",
  },
];

add_task(function testXMPPParser() {
  for (const current of TEST_DATA) {
    const listener = {
      onXMLError(aString) {
        ok(current.isError, aString + " - " + current.description);
      },
      LOG() {},
      startLegacyAuth() {},
      onXmppStanza(aStanza) {
        equal(current.output, aStanza.getXML(), current.description);
        ok(!current.isError, current.description);
      },
    };
    const parser = new XMPPParser(listener);
    parser.onDataAvailable(current.input);
    parser.destroy();
  }
});

add_task(async function testXMPPParser_async() {
  for (const current of TEST_DATA.filter(test => !test.isError)) {
    const { resolve, promise } = Promise.withResolvers();
    const listener = {
      onXMLError(error) {
        ok(false, `${error} - ${current.description}}`);
      },
      LOG() {},
      startLegacyAuth() {},
      onXmppStanza(stanza) {
        equal(current.output, stanza.getXML(), current.description);
        ok(!current.isError, current.description);
        resolve();
        return promise;
      },
    };
    const parser = new XMPPParser(listener);
    parser.onDataAvailable(current.input);
    await promise;
    parser.destroy();
  }
});

add_task(async function testXMPPParser_asyncRejection() {
  const { reject, promise } = Promise.withResolvers();
  const testError = new Error("Stanza handling test error");
  const [testData] = TEST_DATA;
  const listener = {
    onXMLError(error) {
      ok(false, `${error} in rejection test`);
    },
    LOG() {},
    startLegacyAuth() {},
    onXmppStanza(stanza) {
      equal(
        testData.output,
        stanza.getXML(),
        "Stanza should have parsed as expected"
      );
      reject(testError);
      return promise;
    },
  };
  ok(!testData.isError, "Selected test data should be for a valid stanza");
  const parser = new XMPPParser(listener);
  parser.onDataAvailable(testData.input);
  // We can't await the promise itself, since that would handle the rejection,
  // and we want to ensure it's not unhandled.
  await Promise.resolve();
  parser.destroy();
});
