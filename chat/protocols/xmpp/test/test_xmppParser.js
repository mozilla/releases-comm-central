/* Any copyright is dedicated to the Public Domain.
* http://creativecommons.org/publicdomain/zero/1.0/ */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var xmppXml = {};
Services.scriptloader.loadSubScript("resource:///modules/xmpp-xml.jsm", xmppXml);

var TEST_DATA = [
  {
    input: '<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</body>\
</message>',
    output: '<message xmlns="jabber:client" \
from="juliet@capulet.example/balcony" to="romeo@montague.example/garden" \
type="chat"><body xmlns="jabber:client">What man art thou that, thus \
bescreen"d in night, so stumblest on my counsel?</body>\
</message>',
    isError: false,
    description: "Message stanza with body element"
  },
  {
    input: '<message xmlns="jabber:client" from="romeo@montague.example" \
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
    output: '<message xmlns="jabber:client" from="romeo@montague.example" \
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
    description: "Forwarded copy of message carbons"
  },
  {
    input: '<message xmlns="jabber:client" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?\
</message>',
    output: '',
    isError: true,
    description: "No closing of body tag"
  },
  {
    input: '<message xmlns="http://etherx.jabber.org/streams" from="juliet@capulet.example/balcony" \
to="romeo@montague.example/garden" type="chat">\
<body>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</body>\
</message>',
    output: '',
    isError: true,
    description: "Invalid namespace of top-level element"
  },
  {
    input: '<field xmlns="jabber:x:data" type="fixed">\
<value>What man art thou that, thus bescreen"d in night, so stumblest on my \
counsel?</value>\
</field>',
    output: '',
    isError: true,
    description: "Invalid top-level element"
  }
];

function testXMPPParser() {
  for (let current of TEST_DATA) {
    let listener = {
      output: current.output,
      description: current.description,
      isError: current.isError,
      onXMLError: function(aString) {
        ok(this.isError, aString + " - " + this.description);
      },
      LOG: function(aString) {},
      startLegacyAuth: function() {},
      onXmppStanza: function(aStanza) {
        equal(this.output, aStanza.getXML(), this.description);
        ok(!this.isError, this.description);
      }
    };
    let parser = new xmppXml.XMPPParser(listener);
    let istream = Cc["@mozilla.org/io/string-input-stream;1"]
                    .createInstance(Ci.nsIStringInputStream);
    istream.setData(current.input, current.input.length);
    parser.onDataAvailable(istream, 0, current.input.length);
    parser.destroy();
  }

  run_next_test();
}

function run_test() {
  add_test(testXMPPParser);

  run_next_test();
}
