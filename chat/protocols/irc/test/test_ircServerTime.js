/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { tagServerTime } = ChromeUtils.importESModule(
  "resource:///modules/ircServerTime.sys.mjs"
);
var { ircMessage } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

function getTags(aRawMsg) {
  const { tags } = ircMessage(aRawMsg, "does.not@matter");

  return tags;
}

function run_test() {
  add_test(specMessages);

  run_next_test();
}

function specMessages() {
  const kMessages = [
    {
      tags: getTags(
        "@time=2011-10-19T16:40:51.620Z :Angel!angel@example.com PRIVMSG #test :Hello"
      ),
      who: "Angel!angel@example.com",
      get originalMessage() {
        return "Hello";
      },
      message: "Hello",
      incoming: true,
    },
    {
      tags: getTags(
        "@time=2012-06-30T23:59:60.419Z :John!~john@1.2.3.4 JOIN #chan"
      ),
      who: "John!~john@1.2.3.4",
      message: "John joined #chan",
      get originalMessage() {
        return "John joined #chan";
      },
      system: true,
      incoming: true,
    },
    {
      tags: getTags(
        "@znc.in/server-time-iso=2016-11-13T19:20:45.284Z :John!~john@1.2.3.4 JOIN #chan"
      ),
      who: "John!~john@1.2.3.4",
      message: "John joined #chan",
      get originalMessage() {
        return "John joined #chan";
      },
      system: true,
      incoming: true,
    },
    {
      tags: getTags("@time= :empty!Empty@host.local JOIN #test"),
      who: "empty!Empty@localhost",
      message: "Empty joined #test",
      get originalMessage() {
        return "Empty joined #test";
      },
      system: true,
      incoming: true,
    },
    {
      tags: getTags("NoTags!notags@1.2.3.4 PART #test"),
      who: "NoTags!notags@1.2.3.4",
      message: "NoTags left #test",
      get originalMessage() {
        return "NoTags left #test";
      },
      system: true,
      incoming: true,
    },
  ];

  const kExpectedTimes = [
    Math.floor(Date.parse(kMessages[0].tags.get("time")) / 1000),
    Math.floor(Date.parse("2012-06-30T23:59:59.999Z") / 1000),
    Math.floor(
      Date.parse(kMessages[2].tags.get("znc.in/server-time-iso")) / 1000
    ),
    undefined,
    undefined,
  ];

  for (const m in kMessages) {
    const msg = kMessages[m];
    const isZNC = kMessages[m].tags.has("znc.in/server-time-iso");
    const tag = isZNC ? "znc.in/server-time-iso" : "time";
    const tagMessage = {
      message: Object.assign({}, msg),
      tagName: tag,
      tagValue: msg.tags.get(tag),
    };
    tagServerTime.commands[tag](tagMessage);

    // Ensuring that the expected properties and their values as given in
    // kMessages are still the same after the handler.
    for (const i in msg) {
      equal(
        tagMessage.message[i],
        msg[i],
        "Property '" + i + "' was not modified"
      );
    }
    // The time should only be adjusted when we expect a valid server-time tag.
    equal(
      "time" in tagMessage.message,
      kExpectedTimes[m] !== undefined,
      "Message time was set when expected"
    );

    if (kExpectedTimes[m] !== undefined) {
      ok(tagMessage.message.delayed, "Delayed flag was set");
      equal(
        kExpectedTimes[m],
        tagMessage.message.time,
        "Time was parsed properly"
      );
    }
  }

  run_next_test();
}
