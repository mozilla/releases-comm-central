/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var cap = {};
Services.scriptloader.loadSubScript("resource:///modules/ircCAP.jsm", cap);

var testData = [
  // A normal LS from the server.
  [
    ["*", "LS", "multi-prefix sasl userhost-in-names"],
    [{
      subcommand: 'LS',
      parameter: 'multi-prefix',
    },
    {
      subcommand: 'LS',
      parameter: 'sasl',
    },
    {
      subcommand: 'LS',
      parameter: 'userhost-in-names',
    }]
  ],

  // LS with both valid and invalid vendor specific capabilities.
  [
    ["*","LS","sasl server-time znc.in/server-time-iso znc.in/playback palaverapp.com"],
    [{
      subcommand: 'LS',
      parameter: 'sasl',
    },
    {
      subcommand: 'LS',
      parameter: 'server-time',
    },
    // Valid vendor prefixes (of the form <domain name>/<capability>).
    {
      subcommand: 'LS',
      parameter: 'znc.in/server-time-iso',
    },
    {
      subcommand: 'LS',
      parameter: 'znc.in/playback',
    },
    // Invalid vendor prefix, but we should treat it as an opaque identifier.
    {
      subcommand: 'LS',
      parameter: 'palaverapp.com',
    }]
  ],

  // Some implementations include one less parameter.
  [
    ["LS", "sasl"],
    [{
      subcommand: 'LS',
      parameter: 'sasl',
    }],
  ],

  // Modifier tests, ensure the modified is stripped from the capaibility and is
  // parsed correctly.
  [
    ["LS", "-disable =sticky ~ack"],
    [{
      subcommand: 'LS',
      parameter: 'disable',
      modifier: '-',
      disable: true,
    },
    {
      subcommand: 'LS',
      parameter: 'sticky',
      modifier: '=',
      sticky: true,
    },
    {
      subcommand: 'LS',
      parameter: 'ack',
      modifier: '~',
      ack: true,
    }],
  ]
];

function run_test() {
  add_test(testCapMessages);

  run_next_test();
}

/*
 * Test round tripping parsing and then rebuilding the messages from RFC 2812.
 */
function testCapMessages() {
  for (let data of testData) {
    // Generate an ircMessage to send into capMessage.
    let message = {
      params: data[0]
    };

    // Create the CAP message.
    let outputs = cap.capMessage(message);

    // The original message should get a cap object added with the subcommand
    // set.
    ok(message.cap);
    equal(message.cap.subcommand, data[1][0].subcommand);

    // We only care about the "cap" part of each return message.
    outputs = outputs.map((o) => o.cap);

    // Ensure the expected output is an array.
    let expectedCaps = data[1];
    if (!Array.isArray(expectedCaps))
      expectedCaps = [expectedCaps];

    // Add defaults to the expected output.
    for (let expectedCap of expectedCaps) {
      // By default there's no modifier.
      if (!('modifier' in expectedCap))
        expectedCap.modifier = undefined;
      for (let param of ['disable', 'sticky', 'ack']) {
        if (!(param in expectedCap))
          expectedCap[param] = false;
      }
    }

    // Ensure each item in the arrays are equal.
    deepEqual(outputs, expectedCaps);
  }

  run_next_test();
}
