/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var irc = {};
Services.scriptloader.loadSubScript("resource:///components/irc.js", irc);

var testData = [
  // First off, let's test the messages from RFC 2812.
  "PASS secretpasswordhere",
  "NICK Wiz",
  ":WiZ!jto@tolsun.oulu.fi NICK Kilroy",
  "USER guest 0 * :Ronnie Reagan",
  "USER guest 8 * :Ronnie Reagan",
  "OPER foo bar",
  "MODE WiZ -w",
  "MODE Angel +i",
  "MODE WiZ -o",
  "SERVICE dict * *.fr 0 0 :French Dictionary",
  "QUIT :Gone to have lunch",
  ":syrk!kalt@millennium.stealth.net QUIT :Gone to have lunch",
  "SQUIT tolsun.oulu.fi :Bad Link ?",
  ":Trillian SQUIT cm22.eng.umd.edu :Server out of control",
  "JOIN #foobar",
  "JOIN &foo fubar",
  "JOIN #foo,&bar fubar",
  "JOIN #foo,#bar fubar,foobar",
  "JOIN #foo,#bar",
  "JOIN 0",
  ":WiZ!jto@tolsun.oulu.fi JOIN #Twilight_zone",
  "PART #twilight_zone",
  "PART #oz-ops,&group5",
  ":WiZ!jto@tolsun.oulu.fi PART #playzone :I lost",
  "MODE #Finnish +imI *!*@*.fi",
  "MODE #Finnish +o Kilroy",
  "MODE #Finnish +v Wiz",
  "MODE #Fins -s",
  "MODE #42 +k oulu",
  "MODE #42 -k oulu",
  "MODE #eu-opers +l 10",
  ":WiZ!jto@tolsun.oulu.fi MODE #eu-opers -l",
  "MODE &oulu +b",
  "MODE &oulu +b *!*@*",
  "MODE &oulu +b *!*@*.edu +e *!*@*.bu.edu",
  "MODE #bu +be *!*@*.edu *!*@*.bu.edu",
  "MODE #meditation e",
  "MODE #meditation I",
  "MODE !12345ircd O",
  ":WiZ!jto@tolsun.oulu.fi TOPIC #test :New topic",
  "TOPIC #test :another topic",
  "TOPIC #test :",
  "TOPIC #test",
  "NAMES #twilight_zone,#42",
  "NAMES",
  "LIST",
  "LIST #twilight_zone,#42",
  ":Angel!wings@irc.org INVITE Wiz #Dust",
  "INVITE Wiz #Twilight_Zone",
  "KICK &Melbourne Matthew",
  "KICK #Finnish John :Speaking English",
  ":WiZ!jto@tolsun.oulu.fi KICK #Finnish John",
  ":Angel!wings@irc.org PRIVMSG Wiz :Are you receiving this message ?",
  "PRIVMSG Angel :yes I'm receiving it !",
  "PRIVMSG jto@tolsun.oulu.fi :Hello !",
  "PRIVMSG kalt%millennium.stealth.net@irc.stealth.net :Are you a frog?",
  "PRIVMSG kalt%millennium.stealth.net :Do you like cheese?",
  "PRIVMSG Wiz!jto@tolsun.oulu.fi :Hello !",
  "PRIVMSG $*.fi :Server tolsun.oulu.fi rebooting.",
  "PRIVMSG #*.edu :NSFNet is undergoing work, expect interruptions",
  "VERSION tolsun.oulu.fi",
  "STATS m",
  "LINKS *.au",
  "LINKS *.edu *.bu.edu",
  "TIME tolsun.oulu.fi",
  "CONNECT tolsun.oulu.fi 6667",
  "TRACE *.oulu.fi",
  "ADMIN tolsun.oulu.fi",
  "ADMIN syrk",
  "INFO csd.bu.edu",
  "INFO Angel",
  "SQUERY irchelp :HELP privmsg",
  "SQUERY dict@irc.fr :fr2en blaireau",
  "WHO *.fi",
  "WHO jto* o",
  "WHOIS wiz",
  "WHOIS eff.org trillian",
  "WHOWAS Wiz",
  "WHOWAS Mermaid 9",
  "WHOWAS Trillian 1 *.edu",
  "PING tolsun.oulu.fi",
  "PING WiZ tolsun.oulu.fi",
  // Below fails, we don't use the (unnecessary) colon.
  //"PING :irc.funet.fi",
  "PONG csd.bu.edu tolsun.oulu.fi",
  "ERROR :Server *.fi already exists",
  "NOTICE WiZ :ERROR from csd.bu.edu -- Server *.fi already exists",
  "AWAY :Gone to lunch.  Back in 5",
  "REHASH",
  "DIE",
  "RESTART",
  "SUMMON jto",
  "SUMMON jto tolsun.oulu.fi",
  "USERS eff.org",
  ":csd.bu.edu WALLOPS :Connect '*.uiuc.edu 6667' from Joshua",
  "USERHOST Wiz Michael syrk",
  // Below fails, we don't use the (unnecessary) colon.
  //":ircd.stealth.net 302 yournick :syrk=+syrk@millennium.stealth.net",
  "ISON phone trillian WiZ jarlek Avalon Angel Monstah syrk",

  // Now for the torture test, specially crafted messages that might be
  // "difficult" to handle.
  "PRIVMSG foo ::)", // Test sending a colon as the first character.
  "PRIVMSG foo :This is a test.", // Test sending a space.
  "PRIVMSG foo :", // Empty last parameter.
  "PRIVMSG foo :This is :a test." // A "second" last parameter.
];

function run_test() {
  add_test(testRFC2812Messages);
  add_test(testBrokenUnrealMessages);
  add_test(testNewLinesInMessages);
  add_test(testLocalhost);
  add_test(testTags);

  run_next_test();
}

/*
 * Test round tripping parsing and then rebuilding the messages from RFC 2812.
 */
function testRFC2812Messages() {
  for each (let expectedStringMessage in testData) {
    // Pass in an empty default origin in order to check this below.
    let message = irc.ircMessage(expectedStringMessage, "");

    let stringMessage =
      irc.ircAccount.prototype.buildMessage(message.command, message.params);

    // Let's do a little dance here...we don't rebuild the "source" of the
    // message (the server does that), so when comparing our output message, we
    // need to avoid comparing to that part.
    if (message.origin) {
      expectedStringMessage =
        expectedStringMessage.slice(expectedStringMessage.indexOf(" ") + 1);
    }

    do_check_eq(stringMessage, expectedStringMessage);
  }

  run_next_test();
}

/*
 * Test if two objects have the same fields (recursively). aObject2 should be
 * an ircMessage and aObject1 its expected values.
 */
function isEqual(aObject1, aObject2) {
  let result = true;
  for (let fieldName in aObject1) {
    let field1 = aObject1[fieldName];
    // Get the value current field value of the ircMessage. aObject2 might have
    // be a Map, if so use the proper getter.
    let field2;
    if (aObject2 instanceof Map)
      field2 = aObject2.get(fieldName);
    else
      field2 = aObject2[fieldName];

    if (typeof field1 == "object")
      result &= isEqual(field1, field2);
    else if (Array.isArray(field1))
      result &= field1.every((el, idx) => el == field2[idx]);
    else
      result &= field1 == field2;
  }
  return result;
}

// Unreal sends a couple of broken messages, see ircMessage in irc.js for a
// description of what's wrong.
function testBrokenUnrealMessages() {
  let messages = {
    // Two spaces after command.
    ":gravel.mozilla.org 432  #momo :Erroneous Nickname: Illegal characters": {
      rawMessage: ":gravel.mozilla.org 432  #momo :Erroneous Nickname: Illegal characters",
      command: "432",
      params: ["", "#momo", "Erroneous Nickname: Illegal characters"],
      origin: "gravel.mozilla.org"
    },
    // An extraneous space at the end.
    ":gravel.mozilla.org MODE #tckk +n ": {
      rawMessage: ":gravel.mozilla.org MODE #tckk +n ",
      command: "MODE",
      params: ["#tckk", "+n"],
      origin: "gravel.mozilla.org"
    },
    // Two extraneous spaces at the end.
    ":services.esper.net MODE #foo-bar +o foobar  ": {
      rawMessage: ":services.esper.net MODE #foo-bar +o foobar  ",
      command: "MODE",
      params: ["#foo-bar", "+o", "foobar"],
      origin: "services.esper.net"
    }
  };

  for (let messageStr in messages)
    do_check_true(isEqual(messages[messageStr], irc.ircMessage(messageStr, "")));

  run_next_test();
}

// After unescaping we can end up with line breaks inside of IRC messages. Test
// this edge case specifically.
function testNewLinesInMessages() {
  let messages = {
    ":test!Instantbir@host PRIVMSG #instantbird :First line\nSecond line": {
      rawMessage: ":test!Instantbir@host PRIVMSG #instantbird :First line\nSecond line",
      command: "PRIVMSG",
      params: ["#instantbird", "First line\nSecond line"],
      origin: "test",
      user: "Instantbir",
      host: "host",
      source: "Instantbir@host"
    },
    ":test!Instantbir@host PRIVMSG #instantbird :First line\r\nSecond line": {
      rawMessage: ":test!Instantbir@host PRIVMSG #instantbird :First line\r\nSecond line",
      command: "PRIVMSG",
      params: ["#instantbird", "First line\r\nSecond line"],
      origin: "test",
      user: "Instantbir",
      host: "host",
      source: "Instantbir@host"
    }
  };

  for (let messageStr in messages)
    do_check_true(isEqual(messages[messageStr], irc.ircMessage(messageStr)));

  run_next_test();
}

// Sometimes it is a bit hard to tell whether a prefix is a nickname or a
// servername. Generally this happens when connecting to localhost or a local
// hostname and is likely seen with bouncers.
function testLocalhost() {
  let messages = {
    ":localhost 001 clokep :Welcome to the BitlBee gateway, clokep": {
      rawMessage: ":localhost 001 clokep :Welcome to the BitlBee gateway, clokep",
      command: "001",
      params: ["clokep", "Welcome to the BitlBee gateway, clokep"],
      origin: "localhost",
      user: undefined,
      host: undefined,
      source: ""
    }
  };

  for (let messageStr in messages)
    do_check_true(isEqual(messages[messageStr], irc.ircMessage(messageStr)));

  run_next_test();
}

function testTags() {
  let messages = {
    "@aaa=bBb;ccc;example.com/ddd=eee :nick!ident@host.com PRIVMSG me :Hello": {
      rawMessage: "@aaa=bBb;ccc;example.com/ddd=eee :nick!ident@host.com PRIVMSG me :Hello",
      command: "PRIVMSG",
      params: ["me", "Hello"],
      origin: "nick",
      user: "ident",
      host: "host.com",
      tags: {
        "aaa": "bBb",
        "ccc": undefined,
        "example.com/ddd": "eee"
      }
    },
    "@xn--e1afmkfd.org/foo :nick@host.com PRIVMSG him :Test": {
      rawMessage: "@xn--e1afmkfd.org/foo :nick@host.com PRIVMSG him :Test",
      command: "PRIVMSG",
      params: ["him", "Test"],
      origin: "nick",
      user: "host.com",
      tags: {
        "xn--e1afmkfd.org/foo": undefined
      }
    },
    "@aaa=\\\\n\\:\\n\\r\\s :nick@host.com PRIVMSG it :Yes": {
      rawMessage: "@aaa=\\\\n\\:\\n\\r\\s :nick@host.com PRIVMSG it :Yes",
      command: "PRIVMSG",
      params: ["it", "Yes"],
      origin: "nick",
      user: "host.com",
      tags: {
        "aaa": "\\n;\n\r "
      }
    },
    "@c;h=;a=b :quux ab cd": {
      rawMessage: "@c;h=;a=b :quux ab cd",
      command: "ab",
      params: ["cd"],
      origin: "quux",
      tags: {
        "c": undefined,
        "h": "",
        "a": "b"
      }
    },
    "@time=2012-06-30T23:59:60.419Z :John!~john@1.2.3.4 JOIN #chan": {
      rawMessage: "@time=2012-06-30T23:59:60.419Z :John!~john@1.2.3.4 JOIN #chan",
      command: "JOIN",
      params: ["#chan"],
      origin: "John",
      user: "~john",
      host: "1.2.3.4",
      tags: {
        "time": "2012-06-30T23:59:60.419Z"
      }
    }
  };

  for (let messageStr in messages)
    do_check_true(isEqual(messages[messageStr], irc.ircMessage(messageStr, "")));

  run_next_test();
}
