/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { capMessage } = ChromeUtils.importESModule(
  "resource:///modules/ircCAP.sys.mjs"
);

var testData = [
  // A normal LS from the server.
  [
    ["*", "LS", "multi-prefix sasl userhost-in-names"],
    [
      {
        subcommand: "LS",
        parameter: "multi-prefix",
      },
      {
        subcommand: "LS",
        parameter: "sasl",
      },
      {
        subcommand: "LS",
        parameter: "userhost-in-names",
      },
    ],
  ],

  // LS with both valid and invalid vendor specific capabilities.
  [
    [
      "*",
      "LS",
      "sasl server-time znc.in/server-time-iso znc.in/playback palaverapp.com",
    ],
    [
      {
        subcommand: "LS",
        parameter: "sasl",
      },
      {
        subcommand: "LS",
        parameter: "server-time",
      },
      // Valid vendor prefixes (of the form <domain name>/<capability>).
      {
        subcommand: "LS",
        parameter: "znc.in/server-time-iso",
      },
      {
        subcommand: "LS",
        parameter: "znc.in/playback",
      },
      // Invalid vendor prefix, but we should treat it as an opaque identifier.
      {
        subcommand: "LS",
        parameter: "palaverapp.com",
      },
    ],
  ],

  // Some implementations include one less parameter.
  [
    ["LS", "sasl"],
    [
      {
        subcommand: "LS",
        parameter: "sasl",
      },
    ],
  ],

  // Modifier tests, ensure the modified is stripped from the capaibility and is
  // parsed correctly.
  [
    ["LS", "-disable =sticky ~ack"],
    [
      {
        subcommand: "LS",
        parameter: "disable",
        modifier: "-",
        disable: true,
      },
      {
        subcommand: "LS",
        parameter: "sticky",
        modifier: "=",
        sticky: true,
      },
      {
        subcommand: "LS",
        parameter: "ack",
        modifier: "~",
        ack: true,
      },
    ],
  ],

  // IRC v3.2 multi-line LS response
  [
    ["*", "LS", "*", "sasl"],
    ["*", "LS", "server-time"],
    [
      {
        subcommand: "LS",
        parameter: "sasl",
      },
      {
        subcommand: "LS",
        parameter: "server-time",
      },
    ],
  ],

  // IRC v3.2 multi-line LIST response
  [
    ["*", "LIST", "*", "sasl"],
    ["*", "LIST", "server-time"],
    [
      {
        subcommand: "LIST",
        parameter: "sasl",
      },
      {
        subcommand: "LIST",
        parameter: "server-time",
      },
    ],
  ],

  // IRC v3.2 cap value
  [
    ["*", "LS", "multi-prefix sasl=EXTERNAL sts=port=6697"],
    [
      {
        subcommand: "LS",
        parameter: "multi-prefix",
      },
      {
        subcommand: "LS",
        parameter: "sasl",
        value: "EXTERNAL",
      },
      {
        subcommand: "LS",
        parameter: "sts",
        value: "port=6697",
      },
    ],
  ],

  // cap-notify new cap
  [
    ["*", "NEW", "batch"],
    [
      {
        subcommand: "NEW",
        parameter: "batch",
      },
    ],
  ],

  // cap-notify delete cap
  [
    ["*", "DEL", "multi-prefix"],
    [
      {
        subcommand: "DEL",
        parameter: "multi-prefix",
      },
    ],
  ],
];

function run_test() {
  add_test(testCapMessages);

  run_next_test();
}

/*
 * Test round tripping parsing and then rebuilding the messages from RFC 2812.
 */
function testCapMessages() {
  for (const data of testData) {
    // Generate an ircMessage to send into capMessage.
    let i = 0;
    let message;
    let outputs;
    const account = {
      _queuedCAPs: [],
    };

    // Generate an ircMessage to send into capMessage.
    while (typeof data[i][0] == "string") {
      message = {
        params: data[i],
      };

      // Create the CAP message.
      outputs = capMessage(message, account);
      ++i;
    }

    // The original message should get a cap object added with the subcommand
    // set.
    ok(message.cap);
    equal(message.cap.subcommand, data[i][0].subcommand);

    // We only care about the "cap" part of each return message.
    outputs = outputs.map(o => o.cap);

    // Ensure the expected output is an array.
    let expectedCaps = data[i];
    if (!Array.isArray(expectedCaps)) {
      expectedCaps = [expectedCaps];
    }

    // Add defaults to the expected output.
    for (const expectedCap of expectedCaps) {
      // By default there's no modifier.
      if (!("modifier" in expectedCap)) {
        expectedCap.modifier = undefined;
      }
      for (const param of ["disable", "sticky", "ack"]) {
        if (!(param in expectedCap)) {
          expectedCap[param] = false;
        }
      }
    }

    // Ensure each item in the arrays are equal.
    deepEqual(outputs, expectedCaps);
  }

  run_next_test();
}
