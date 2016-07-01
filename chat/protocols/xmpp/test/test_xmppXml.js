/* Any copyright is dedicated to the Public Domain.
* http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");

var xmppXml = {};
Services.scriptloader.loadSubScript("resource:///modules/xmpp-xml.jsm", xmppXml);

var TEST_DATA = [
  {
    input: {
      name: "message",
      namespace: xmppXml.NS.client,
      attributes: {
        jid: "user@domain",
        type: null
      },
      data: []
    },
    XmlOutput: '<message xmlns="jabber:client" jid="user@domain"/>',
    stringOutput: '<message xmlns="jabber:client" jid="user@domain"/>\n',
    isError: false,
    description: "Ignore attribute with null value"
  },
  {
    input: {
      name: "message",
      namespace: xmppXml.NS.client,
      attributes: {
        jid: "user@domain",
        type: undefined
      },
      data: []
    },
    XmlOutput: '<message xmlns="jabber:client" jid="user@domain"/>',
    stringOutput: '<message xmlns="jabber:client" jid="user@domain"/>\n',
    isError: false,
    description: "Ignore attribute with undefined value"
  },
  {
    input: {
      name: "message",
      namespace: undefined,
      attributes: {},
      data: []
    },
    XmlOutput: '<message/>',
    stringOutput: '<message/>\n',
    isError: false,
    description: "Ignore namespace with undefined value"
  },
  {
    input: {
      name: undefined,
      attributes: {},
      data: []
    },
    XmlOutput: '',
    stringOutput: '',
    isError: true,
    description: "Node must have a name"
  },
  {
    input: {
      name: "message",
      attributes: {},
      data: "test message"
    },
    XmlOutput: '<message>test message</message>',
    stringOutput: '<message>\n test message\n</message>\n',
    isError: false,
    description: "Node with text content"
  }
];

function testXMLNode() {
  for (let current of TEST_DATA) {
    try {
      let result =
        xmppXml.Stanza.node(current.input.name, current.input.namespace,
                            current.input.attributes, current.input.data);
      equal(result.getXML(), current.XmlOutput, current.description);
      equal(result.convertToString(), current.stringOutput, current.description);
      equal(current.isError, false);
    } catch (e) {
      equal(current.isError, true, current.description);
    }
  }

  run_next_test();
}


function run_test() {
  add_test(testXMLNode);

  run_next_test();
}
