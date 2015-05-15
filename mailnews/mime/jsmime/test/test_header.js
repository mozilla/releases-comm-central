"use strict";
define(function(require) {

var headerparser = require('jsmime').headerparser;
var assert = require('assert');

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(data[0], fn);
}
suite('headerparser', function () {
  suite('parseParameterHeader', function () {
    let header_tests = [
      ['multipart/related', ["multipart/related", {}]],
      ["a ; b=v", ["a", {"b": "v"}]],
      ["a ; b='v'", ["a", {"b": "'v'"}]],
      ['a; b = "v"', ["a", {"b": "v"}]],
      ["a;b=1;b=2", ["a", {"b": "1"}]],
      ["a;b=2;b=1", ["a", {"b": "2"}]],
      ['a;b="a;b"', ["a", {"b": "a;b"}]],
      ['a;b="\\\\"', ["a", {"b": "\\"}]],
      ['a;b="a\\b\\c"', ["a", {"b": "abc"}]],
      ['a;b=1;c=2', ["a", {"b": "1", "c": "2"}]],
      ['a;b="a\\', ["a", {"b": "a"}]],
      ['a;b', ["a", {}]],
      ['a;b=";";c=d', ["a", {"b": ';', 'c': "d"}]],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let testMap = new Map();
        for (let key in data[1][1])
          testMap.set(key, data[1][1][key]);
        testMap.preSemi = data[1][0];
        assert.deepEqual(headerparser.parseParameterHeader(data[0], false, false),
          testMap);
      });
    });
  });
  suite('parseParameterHeader (2231/2047 support)', function () {
    let header_tests = [
      // Copied from test_MIME_params.js and adapted
      ["attachment;", ["attachment", {}]],
      ["attachment; filename=basic", ["attachment", {filename: "basic"}]],
      ["attachment; filename=\"\\\"\"", ["attachment", {filename: '"'}]],
      ["attachment; filename=\"\\x\"", ["attachment", {filename: "x"}]],
      ["attachment; filename=\"\"", ["attachment", {filename: ""}]],
      ["attachment; filename=", ["attachment", {filename: ""}]],
      ["attachment; filename X", ["attachment", {}]],
      ["attachment; filename = foo-A.html",
        ["attachment", {filename: "foo-A.html"}]],
      ["attachment; filename=\"", ["attachment", {filename: ""}]],
      ["attachment; filename=foo; trouble", ["attachment", {filename: "foo"}]],
      ["attachment; filename=foo; trouble ", ["attachment", {filename: "foo"}]],
      ["attachment", ["attachment", {}]],
      ["attachment; filename=foo", ["attachment", {filename: "foo"}]],
      ["attachment; filename=\"foo\"", ["attachment", {filename: "foo"}]],
      ["attachment; filename='foo'", ["attachment", {filename: "'foo'"}]],
      ["attachment; filename=\"=?UTF-8?Q?foo?=\"",
        ["attachment", {filename: "foo"}]],
      ["attachment; filename==?UTF-8?Q?foo?=",
        ["attachment", {filename: "foo"}]],
      // 2231/5987 tests from test_MIME_params.js
      ["attachment; filename*=UTF-8''extended",
        ["attachment", {filename: "extended"}]],
      ["attachment; filename=basic; filename*=UTF-8''extended",
        ["attachment", {filename: "extended"}]],
      ["attachment; filename*=UTF-8''extended; filename=basic",
        ["attachment", {filename: "extended"}]],
      ["attachment; filename*0=foo; filename*1=bar",
        ["attachment", {filename: "foobar"}]],
      ["attachment; filename*0=first; filename*0=wrong; filename=basic",
        ["attachment", {filename: "first"}]], // or basic?
      ["attachment; filename*0=first; filename*1=second; filename*0=wrong",
        ["attachment", {filename: "firstsecond"}]], // or nothing?
      ["attachment; filename=basic; filename*0=foo; filename*1=bar",
        ["attachment", {filename: "foobar"}]],
      ["attachment; filename=basic; filename*0=first; filename*0=wrong; " +
        "filename*=UTF-8''extended", ["attachment", {filename: "extended"}]],
      ["attachment; filename=basic; filename*=UTF-8''extended; filename*0=foo" +
        "; filename*1=bar", ["attachment", {filename: "extended"}]],
      ["attachment; filename*0=foo; filename*2=bar",
        ["attachment", {filename: "foo"}]],
      ["attachment; filename*0=foo; filename*01=bar",
        ["attachment", {filename: "foo"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''multi; filename*1=line" +
        "; filename*2*=%20extended",
        ["attachment", {filename: "multiline extended"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''multi; filename*1=line" +
        "; filename*3*=%20extended", ["attachment", {filename: "multiline"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''multi; filename*1=line" +
        "; filename*0*=UTF-8''wrong; filename*1=bad; filename*2=evil",
        ["attachment", {filename: "multiline"}]],
      ["attachment; filename=basic; filename*0=UTF-8''multi; filename*=UTF-8'" +
        "'extended; filename*1=line; filename*2*=%20extended",
        ["attachment", {filename: "extended"}]],
      ["attachment; filename*0=UTF-8''unescaped; filename*1*=%20so%20includes" +
        "%20UTF-8''%20in%20value",
        ["attachment", {filename: "UTF-8''unescaped so includes UTF-8'' in value"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''multi; filename*1=line" +
        "; filename*0*=UTF-8''wrong; filename*1=bad; filename*2=evil",
        ["attachment", {filename: "multiline"}]],
      ["attachment; filename=basic; filename*1=foo; filename*2=bar",
        ["attachment", {filename: "basic"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*1=1; filen" +
        "ame*2=2;filename*3=3;filename*4=4;filename*5=5;filename*6=6;filename" +
        "*7=7;filename*8=8;filename*9=9;filename*10=a;filename*11=b;filename*" +
        "12=c;filename*13=d;filename*14=e;filename*15=f",
        ["attachment", {filename: "0123456789abcdef"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*1=1; filen" +
        "ame*2=2;filename*3=3;filename*4=4;filename*5=5;filename*6=6;filename" +
        "*7=7;filename*8=8;filename*9=9;filename*10=a;filename*11=b;filename*" +
        "12=c;filename*14=e", ["attachment", {filename: "0123456789abc"}]],
      ["attachment; filename*1=multi; filename*2=line; filename*3*=%20extended",
        ["attachment", {}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*1=1; filen" +
        "ame*2=2;filename*3=3;filename*4=4;filename*5=5;filename*6=6;filename" +
        "*7=7;filename*8=8;filename*9=9;filename*10=a;filename*11=b;filename*" +
        "12=c;filename*13=d;filename*15=f;filename*14=e",
        ["attachment", {filename: "0123456789abcdef"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*1a=1",
        ["attachment", {filename: "0"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*1111111111" +
        "1111111111111111111111111=1", ["attachment", {filename: "0"}]],
      ["attachment; filename=basic; filename*0*=UTF-8''0; filename*-1=1",
        ["attachment", {filename: "0"}]],
      ["attachment; filename=basic; filename*0=\"0\"; filename*1=1; filename*" +
        "2*=%32", ["attachment", {filename: "012"}]],
      ["attachment; filename=basic; filename**=UTF-8''0;",
        ["attachment", {filename: "basic"}]],
      ["attachment; filename=IT839\x04\xB5(m8)2.pdf;",
        ["attachment", {filename: "IT839\u0004\u00b5(m8)2.pdf"}]],
      ["attachment; filename*=utf-8''%41", ["attachment", {filename: "A"}]],
      // See bug 651185 and bug 703015
      ["attachment; filename*=\"utf-8''%41\"", ["attachment", {filename: "A"}]],
      ["attachment; filename *=utf-8''foo-%41", ["attachment", {}]],
      ["attachment; filename*=''foo", ["attachment", {}]],
      ["attachment; filename*=a''foo", ["attachment", {}]],
      // Bug 692574: we should ignore this one...
      ["attachment; filename*=UTF-8'foo-%41",
        ["attachment", {filename: "foo-A"}]],
      ["attachment; filename*=foo-%41", ["attachment", {}]],
      ["attachment; filename*=UTF-8'foo-%41; filename=bar",
        ["attachment", {filename: "foo-A"}]],
      ["attachment; filename*=ISO-8859-1''%c3%a4",
        ["attachment", {filename: "\u00c3\u00a4"}]],
      ["attachment; filename*=ISO-8859-1''%e2%82%ac",
        ["attachment", {filename: "\u00e2\u201a\u00ac"}]],
      ["attachment; filename*=UTF-8''A%e4B", ["attachment", {}]],
      ["attachment; filename*=UTF-8''A%e4B; filename=fallback",
        ["attachment", {filename: "fallback"}]],
      ["attachment; filename*0*=UTF-8''A%e4B; filename=fallback",
        ["attachment", {filename: "fallback"}]],
      ["attachment; filename*0*=ISO-8859-15''euro-sign%3d%a4; filename*=ISO-8" +
        "859-1''currency-sign%3d%a4",
        ["attachment", {filename: "currency-sign=\u00a4"}]],
      ["attachment; filename*=ISO-8859-1''currency-sign%3d%a4; filename*0*=IS" +
        "O-8859-15''euro-sign%3d%a4",
        ["attachment", {filename: "currency-sign=\u00a4"}]],
      ["attachment; filename=basic; filename*0=\"foo\"; filename*1=\"\\b\\a\\" +
        "r\"", ["attachment", {filename: "foobar"}]],
      ["attachment; filename=basic; filename*0=\"foo\"; filename*1=\"\\b\\a\\",
        ["attachment", {filename: "fooba"}]],
      ["attachment; filename=\"\\b\\a\\", ["attachment", {filename: "ba"}]],
      // According to comments and bugs, this works in necko, but it doesn't
      // appear that it ought to. See bug 732369 for more info.
      ["attachment; extension=bla filename=foo",
        ["attachment", {extension: "bla"}]],
      ["attachment; filename==?ISO-8859-1?Q?foo-=E4.html?=",
        ["attachment", {filename: "foo-\u00e4.html"}]],
      ["attachment; filename=\"=?ISO-8859-1?Q?foo-=E4.html?=\"",
        ["attachment", {filename: "foo-\u00e4.html"}]],
      ["attachment; filename=\"=?ISO-8859-1?Q?foo-=E4.html?=\"; filename*=UTF" +
        "-8''5987", ["attachment", {filename: "5987"}]],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        let testMap = new Map();
        for (let key in data[1][1])
          testMap.set(key, data[1][1][key]);
        testMap.preSemi = data[1][0];
        assert.deepEqual(headerparser.parseParameterHeader(data[0], true, true),
          testMap);
      });
    });
  });
  suite('parseAddressingHeader', function () {
    let header_tests = [
      ["", []],
      ["Joe Schmoe <jschmoe@invalid.invalid>",
        [{name: "Joe Schmoe", email: "jschmoe@invalid.invalid"}]],
      ["user@tinderbox.invalid",
        [{name: "", email: "user@tinderbox.invalid"}]],
      ["Hello Kitty <a@b.c>, No Kitty <b@b.c>",
        [{name: "Hello Kitty", email: "a@b.c"},
         {name: "No Kitty", email: "b@b.c"}]],
      ["undisclosed-recipients:;",
        [{name: "undisclosed-recipients", group: []}]],
      ["me@[127.0.0.1]", [{name: "", email: "me@[127.0.0.1]"}]],
      ["\"me\"@a.com", [{name: "", email: "me@a.com"}]],
      ["\"!\"@a.com", [{name: "", email: "\"!\"@a.com"}]],
      ["\"\\!\"@a.com", [{name: "", email: "\"!\"@a.com"}]],
      ["\"\\\\!\"@a.com", [{name: "", email: "\"\\\\!\"@a.com"}]],
      ["Coward (not@email) <real@email.com>",
        [{name: "Coward (not@email)", email: "real@email.com"}]],
      ["Group: a@b.com, b@c.com;", [{name: "Group", group:
          [{name: "", email: "a@b.com"}, {name: "", email: "b@c.com"}]}]],
      ["a@invalid.invalid, Group: a@b.com;",
        [{name: "", email: "a@invalid.invalid"},
         {name: "Group", group: [{name: "", email: "a@b.com"}]}]],
      ["Group A: a@b.com;, Group B: b@b.com;",
        [{name: "Group A", group: [{name: "", email: "a@b.com"}]},
         {name: "Group B", group: [{name: "", email: "b@b.com"}]}]],
      ["Crazy (<Stupid \"name\") <simple@a.email>",
        [{name: "Crazy (<Stupid name)", email: "simple@a.email"}]],
      ["Group: Real <a@b.com>, Fake <a@b.com>", [{name: "Group", group:
          [{name: "Real", email: "a@b.com"},
           {name: "Fake", email: "a@b.com"}]}]],
      ["\"Joe Q. Public\" <john.q.public@example.com>," +
       "Test <\"abc!x.yz\"@foo.invalid>, Test <test@[xyz!]>," +
       "\"Giant; \\\"Big\\\" Box\" <sysservices@example.net>",
         [{name: "Joe Q. Public", email: "john.q.public@example.com"},
          {name: "Test", email: "\"abc!x.yz\"@foo.invalid"},
          {name: "Test", email: "test@[xyz!]"},
          {name: "Giant; \"Big\" Box", email: "sysservices@example.net"}]],
      ["Unfortunate breaking < so . many . spaces @ here . invalid >",
        [{name: "Unfortunate breaking", email: "so.many.spaces@here.invalid"}]],
      ["so . many . spaces @ here . invalid",
        [{name: "", email: "so.many.spaces@here.invalid"}]],
      ["abc@foo.invalid", [{name:"", email: "abc@foo.invalid"}]],
      ["foo <ghj@foo.invalid>", [{name: "foo", email: "ghj@foo.invalid"}]],
      ["abc@foo.invalid, foo <ghj@foo.invalid>",
        [{name: "", email: "abc@foo.invalid"},
         {name: "foo", email: "ghj@foo.invalid"}]],
      ["foo bar <foo@bar.invalid>",
        [{name: "foo bar", email: "foo@bar.invalid"}]],
      ["foo bar <foo@bar.invalid>, abc@foo.invalid, foo <ghj@foo.invalid>",
        [{name: "foo bar", email: "foo@bar.invalid"},
         {name: "", email: "abc@foo.invalid"},
         {name: "foo", email: "ghj@foo.invalid"}]],
      ["foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>",
        [{name: "foo\u00D0 bar", email: "foo@bar.invalid"},
         {name: "\u00F6foo", email: "ghj@foo.invalid"}]],
      ["Undisclosed recipients:;",
        [{name: "Undisclosed recipients", group: []}]],
      ["\" \"@a a;b",
        [{name: "", email: "\" \"@a a"},
         {name: "b", email: ""}]],
      ["Undisclosed recipients:;\0:; foo <ghj@veryveryveryverylongveryveryver" +
        "yveryinvalidaddress.invalid>",
        [{name: "Undisclosed recipients", group: []},
         {name: "\0", group: []},
         {name: "foo", email: "ghj@veryveryveryverylongveryveryveryveryinvali" +
           "daddress.invalid"}]],
      // XXX: test_nsIMsgHeaderParser2 has an empty one here...
      ["<a;a@invalid",
        [{name: "", email: "a"}, {name: "", email: "a@invalid"}]],
      ["me@foo.invalid", [{name: "", email: "me@foo.invalid"}]],
      ["me@foo.invalid, me2@foo.invalid",
        [{name: "", email: "me@foo.invalid"},
         {name: "", email: "me2@foo.invalid"}]],
      ['"foo bar" <me@foo.invalid>',
        [{name: "foo bar", email: "me@foo.invalid"}]],
      ['"foo bar" <me@foo.invalid>, "bar foo" <me2@foo.invalid>',
        [{name: "foo bar", email: "me@foo.invalid"},
         {name: "bar foo", email: "me2@foo.invalid"}]],
      ["A Group:Ed Jones <c@a.invalid>,joe@where.invalid,John <jdoe@one.invalid>;",
        [{name: "A Group", group: [
          {name: "Ed Jones", email: "c@a.invalid"},
          {name: "", email: "joe@where.invalid"},
          {name: "John", email: "jdoe@one.invalid"}]}]],
      ['mygroup:;, empty:;, foo@foo.invalid, othergroup:bar@foo.invalid, bar2' +
        '@foo.invalid;,       y@y.invalid, empty:;',
        [{name: "mygroup", group: []},
         {name: "empty", group: []},
         {name: "", email: "foo@foo.invalid"},
         {name: "othergroup", group: [
           {name: "", email: "bar@foo.invalid"},
           {name: "", email: "bar2@foo.invalid"}
         ]},
         {name: "", email: "y@y.invalid"},
         {name: "empty", group: []}]],
      ["Undisclosed recipients:;;;;;;;;;;;;;;;;,,,,,,,,,,,,,,,,",
        [{name: "Undisclosed recipients", group: []}]],
      ["a@xxx.invalid; b@xxx.invalid",
        [{name: "", email: "a@xxx.invalid"},
         {name: "", email: "b@xxx.invalid"}]],
      ["a@xxx.invalid; B <b@xxx.invalid>",
        [{name: "", email: "a@xxx.invalid"},
         {name: "B", email: "b@xxx.invalid"}]],
      ['"A " <a@xxx.invalid>; b@xxx.invalid',
        [{name: "A ", email: "a@xxx.invalid"},
         {name: "", email: "b@xxx.invalid"}]],
      ["A <a@xxx.invalid>; B <b@xxx.invalid>",
        [{name: "A", email: "a@xxx.invalid"},
         {name: "B", email: "b@xxx.invalid"}]],
      ["A (this: is, a comment;) <a.invalid>; g:   (this: is, <a> comment;) C" +
        "<c.invalid>, d.invalid;",
        [{name: "A (this: is, a comment;)", email: "a.invalid"},
         {name: "g", group: [
           {name: "(this: is, <a> comment;) C", email: "c.invalid"},
           {name: "d.invalid", email: ""}]}]],
      ['Mary Smith <mary@x.invalid>, extra:;, group:jdoe@example.invalid; Who' +
        '? <one@y.invalid>; <boss@nil.invalid>, "Giant; \\"Big\\" Box" <sysse' +
        'rvices@example.invalid>,         ',
        [{name: "Mary Smith", email: "mary@x.invalid"},
         {name: "extra", group: []},
         {name: "group", group: [{name: "", email: "jdoe@example.invalid"}]},
         {name: "Who?", email: "one@y.invalid"},
         {name: "", email: "boss@nil.invalid"},
         {name: "Giant; \"Big\" Box", email: "sysservices@example.invalid"}]],
      ["Undisclosed recipients: a@foo.invalid ;;extra:;",
        [{name: "Undisclosed recipients", group: [
          {name: "", email: "a@foo.invalid"}]},
         {name: "extra", group: []}]],
      ["Undisclosed recipients:;;extra:a@foo.invalid;",
        [{name: "Undisclosed recipients", group: []},
         {name: "extra", group: [{name: "", email: "a@foo.invalid"}]}]],
      ["a < <a@b.c>", [{name: "a", email: "a@b.c"}]],
      ["Name <incomplete@email", [{name: "Name", email: "incomplete@email"}]],
      ["Name <space here@email.invalid>",
        [{name: 'Name', email: '"space here"@email.invalid'}]],
      ["Name <not an email>", [{name: "Name", email: "not an email"}]],
      ["=?UTF-8?Q?Simple?= <a@b.c>",
        [{name: "=?UTF-8?Q?Simple?=", email: "a@b.c"}]],
      ["No email address", [{name: "No email address", email: ""}]],
      // Thought we were parsing an address, but it was a name.
      ["name@example.com <receiver@example.com>",
        [{name: "name@example.com", email: "receiver@example.com"}]],
      ["name@huhu.com <receiver@example.com>",
        [{name: "name@huhu.com", email: "receiver@example.com"}]],
      // Some names with quotes.
      ["\"name@huhu.com\" <receiver@example.com>",
        [{name: "name@huhu.com", email: "receiver@example.com"}]],
      ["\"Chaplin, Charlie\" <receiver@example.com>",
        [{name: "Chaplin, Charlie", email: "receiver@example.com"}]],
      ["\"name@huhu.com and name@haha.com\" <receiver@example.com>",
        [{name: "name@huhu.com and name@haha.com", email: "receiver@example.com"}]],
      // Handling of comments and legacy display-names as per RFC 5322 §3.4
      ["(c1)n(c2) <(c3)a(c4)@(c5)b(c6).(c7)d(c8)> (c9(c10)c11)",
        [{name: "(c1) n (c2) (c9(c10)c11)", email: "a@b.d"}]],
      ["<(c3)a(c4)@(c5)b(c6).(c7)d(c8)> (c9(c10)c11)",
        [{name: "(c9(c10)c11)", email: "a@b.d"}]],
      ["(c3)a(c4)@(c5)b(c6).(c7)d(c8)(c9(c10)c11)",
        [{name: "c9(c10)c11", email: "a@b.d"}]],
      ["(c1)n(c2) <(c3)a(c4)@(c5)b(c6).(c7)d(c8)> (c9(c10)c11)(c12)",
        [{name: "(c1) n (c2) (c9(c10)c11) (c12)", email: "a@b.d"}]],
      ["<(c3)a(c4)@(c5)b(c6).(c7)d(c8)> (c9(c10)c11)(c12)",
        [{name: "(c9(c10)c11) (c12)", email: "a@b.d"}]],
      ["(c3)a(c4)@(c5)b(c6).(c7)d(c8)(c9(c10)c11)(c12)", [{name: "c12", email: "a@b.d"}]],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headerparser.parseAddressingHeader(data[0], false),
          data[1]);
      });
    });
  });
  suite('parseAddressingHeader (RFC 2047 support)', function () {
    let header_tests = [
      ["Simple <a@b.c>", [{name: "Simple", email: "a@b.c"}]],
      ["=?UTF-8?Q?Simple?= <a@b.c>", [{name: "Simple", email: "a@b.c"}]],
      ["=?UTF-8?Q?=3C@b.c?= <a@b.c>", [{name: "<@b.c", email: "a@b.c"}]],

      // RFC 2047 tokens should not interfere with lexical processing
      ["=?UTF-8?Q?a@b.c,?= <b@b.c>", [{name: "a@b.c,", email: "b@b.c"}]],
      ["=?UTF-8?Q?a@b.c=2C?= <b@b.c>", [{name: "a@b.c,", email: "b@b.c"}]],
      ["=?UTF-8?Q?<?= <a@b.c>", [{name: "<", email: "a@b.c"}]],
      ["Simple =?UTF-8?Q?<?= a@b.c>",
        [{name: "", email: '"Simple < a"@b.c'}]],
      ["Tag <=?UTF-8?Q?email?=@b.c>", [{name: "Tag", email: "email@b.c"}]],
      // handling of comments and legacy display-names as per RFC 5322 §3.4
      ["jl1@b.c (=?ISO-8859-1?Q?Joe_L=F6we?=)", [{name: "Joe Löwe", email: "jl1@b.c"}]],
      ["(=?ISO-8859-1?Q?Joe_L=F6we?=) jl2@b.c", [{name: "Joe Löwe", email: "jl2@b.c"}]],
      ["(=?ISO-8859-1?Q?Joe_L=F6we?=) jl3@b.c (c2)", [{name: "c2", email: "jl3@b.c"}]],
      ["=?ISO-8859-1?Q?Joe_L=F6we?= <jl3@b.c> (c2)", [{name: "Joe Löwe (c2)", email: "jl3@b.c"}]],
      ["(=?ISO-8859-1?Q?Joe_L=F6we?=) <jl3@b.c> (c2)", [{name: "(Joe Löwe) (c2)", email: "jl3@b.c"}]],
      // Bug 1141446: Malformed From addresses with erroneous quotes,
      // note: acute accents: a \u00E1, e \u00E9, i \u00ED, o \u00F3, u \u00FA.
      ["\"=?UTF-8?Q?Jazzy_Fern=C3=A1ndez_Nunoz?= jazzy.f.nunoz@example.com " +
        "[BCN-FC]\" <Barcelona-Freecycle-noreply@yahoogroups.com>",
        [{name: "Jazzy Fern\u00E1ndez Nunoz jazzy.f.nunoz@example.com [BCN-FC]",
      email: "Barcelona-Freecycle-noreply@yahoogroups.com"}]],
      ["\"=?UTF-8?B?TWlyaWFtIEJlcm5hYsOpIFBlcmVsbMOz?= miriam@example.com "+
        "[BCN-FC]\" <Barcelona-Freecycle-noreply@yahoogroups.com>",
        [{name: "Miriam Bernab\u00E9 Perell\u00F3 miriam@example.com [BCN-FC]",
      email: "Barcelona-Freecycle-noreply@yahoogroups.com"}]],
      ["\"=?iso-8859-1?Q?First_Mar=EDa_Furi=F3_Gancho?= mail@yahoo.es "+
        "[BCN-FC]\" <Barcelona-Freecycle-noreply@yahoogroups.com>",
        [{name: "First Mar\u00EDa Furi\u00F3 Gancho mail@yahoo.es [BCN-FC]",
      email: "Barcelona-Freecycle-noreply@yahoogroups.com"}]],
      ["\"=?iso-8859-1?B?U29maWEgQ2FzdGVsbPMgUm9tZXJv?= sonia@example.com "+
        "[BCN-FC]\" <Barcelona-Freecycle-noreply@yahoogroups.com>",
        [{name: "Sofia Castell\u00F3 Romero sonia@example.com [BCN-FC]",
      email: "Barcelona-Freecycle-noreply@yahoogroups.com"}]],
      ["=?iso-8859-1?Q?Klaus_Eisschl=E4ger_=28k=2Eeisschlaeger=40t-onli?=" +
        "=?iso-8859-1?Q?ne=2Ede=29?= <k.eisschlaeger@t-online.de>",
      [{name: "Klaus Eisschläger (k.eisschlaeger@t-online.de)",
        email: "k.eisschlaeger@t-online.de"}]],
      ["\"=?UTF-8?Q?=22Claudia_R=C3=B6hschicht=22?= Claudia_Roehschicht@web.de [freecycle-berlin]\" " +
        "<freecycle-berlin-noreply@yahoogroups.de>",
      [{name: "\"Claudia Röhschicht\" Claudia_Roehschicht@web.de [freecycle-berlin]",
        email: "freecycle-berlin-noreply@yahoogroups.de"}]],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headerparser.parseAddressingHeader(data[0], true),
          data[1]);
      });
    });
  });
  suite('parseDateHeader', function () {
    let header_tests = [
      // Some basic tests, derived from searching for Date headers in a mailing
      // list archive.
      ["Thu, 06 Sep 2012 08:08:21 -0700", "2012-09-06T08:08:21-0700"],
      ["Thu, 6 Sep 2012 14:49:05 -0400", "2012-09-06T14:49:05-0400"],
      ["Fri, 07 Sep 2012 07:30:11 -0700 (PDT)", "2012-09-07T07:30:11-0700"],
      ["9 Sep 2012 21:03:59 -0000", "2012-09-09T21:03:59Z"],
      ["Sun, 09 Sep 2012 19:10:59 -0400", "2012-09-09T19:10:59-0400"],
      ["Wed, 17 Jun 2009 10:12:25 +0530", "2009-06-17T10:12:25+0530"],

      // Exercise all the months.
      ["Mon, 28 Jan 2013 13:35:05 -0500", "2013-01-28T13:35:05-0500"],
      ["Wed, 29 Feb 2012 23:43:26 +0000", "2012-02-29T23:43:26+0000"],
      ["Sat, 09 Mar 2013 18:24:47 -0500", "2013-03-09T18:24:47-0500"],
      ["Sat, 27 Apr 2013 12:51:48 -0400", "2013-04-27T12:51:48-0400"],
      ["Tue, 28 May 2013 17:21:13 +0800", "2013-05-28T17:21:13+0800"],
      ["Mon, 17 Jun 2013 22:15:41 +0200", "2013-06-17T22:15:41+0200"],
      ["Wed, 18 Jul 2012 13:50:47 +0900", "2012-07-18T13:50:47+0900"],
      ["Mon, 13 Aug 2012 13:55:16 +0200", "2012-08-13T13:55:16+0200"],
      ["Thu, 06 Sep 2012 19:49:47 -0400", "2012-09-06T19:49:47-0400"],
      ["Mon, 22 Oct 2012 02:27:23 -0700", "2012-10-22T02:27:23-0700"],
      ["Thu, 22 Nov 2012 09:04:24 +0800", "2012-11-22T09:04:24+0800"],
      ["Sun, 25 Dec 2011 12:27:13 +0000", "2011-12-25T12:27:13+0000"],

      // Try out less common timezone offsets.
      ["Sun, 25 Dec 2011 12:27:13 +1337", "2011-12-25T12:27:13+1337"],
      ["Sun, 25 Dec 2011 12:27:13 -1337", "2011-12-25T12:27:13-1337"],

      // Leap seconds! Except that since dates in JS don't believe they exist,
      // they get shoved to the next second.
      ["30 Jun 2012 23:59:60 +0000", "2012-07-01T00:00:00Z"],
      ["31 Dec 2008 23:59:60 +0000", "2009-01-01T00:00:00Z"],
      // This one doesn't exist (they are added only as needed on an irregular
      // basis), but it's plausible...
      ["30 Jun 2030 23:59:60 +0000", "2030-07-01T00:00:00Z"],
      // ... and this one isn't.
      ["10 Jun 2030 13:39:60 +0000", "2030-06-10T13:40:00Z"],
      // How about leap seconds in other timezones?
      ["30 Jun 2012 18:59:60 -0500", "2012-07-01T00:00:00Z"],

      // RFC 5322 obsolete date productions
      ["Sun, 26 Jan 14 17:14:22 -0600", "2014-01-26T17:14:22-0600"],
      ["Tue, 26 Jan 49 17:14:22 -0600", "2049-01-26T17:14:22-0600"],
      ["Thu, 26 Jan 50 17:14:22 -0600", "1950-01-26T17:14:22-0600"],
      ["Sun, 26 Jan 2014 17:14:22 EST", "2014-01-26T17:14:22-0500"],
      ["Sun, 26 Jan 2014 17:14:22 CST", "2014-01-26T17:14:22-0600"],
      ["Sun, 26 Jan 2014 17:14:22 MST", "2014-01-26T17:14:22-0700"],
      ["Sun, 26 Jan 2014 17:14:22 PST", "2014-01-26T17:14:22-0800"],
      ["Sun, 26 Jan 2014 17:14:22 AST", "2014-01-26T17:14:22-0400"],
      ["Sun, 26 Jan 2014 17:14:22 NST", "2014-01-26T17:14:22-0330"],
      ["Sun, 26 Jan 2014 17:14:22 MET", "2014-01-26T17:14:22+0100"],
      ["Sun, 26 Jan 2014 17:14:22 EET", "2014-01-26T17:14:22+0200"],
      ["Sun, 26 Jan 2014 17:14:22 JST", "2014-01-26T17:14:22+0900"],
      ["Sun, 26 Jan 2014 17:14:22 GMT", "2014-01-26T17:14:22+0000"],
      ["Sun, 26 Jan 2014 17:14:22 UT", "2014-01-26T17:14:22+0000"],
      // Daylight savings timezones, even though these aren't actually during
      // daylight savings time for the relevant jurisdictions.
      ["Sun, 26 Jan 2014 17:14:22 EDT", "2014-01-26T17:14:22-0400"],
      ["Sun, 26 Jan 2014 17:14:22 CDT", "2014-01-26T17:14:22-0500"],
      ["Sun, 26 Jan 2014 17:14:22 MDT", "2014-01-26T17:14:22-0600"],
      ["Sun, 26 Jan 2014 17:14:22 PDT", "2014-01-26T17:14:22-0700"],
      ["Sun, 26 Jan 2014 17:14:22 BST", "2014-01-26T17:14:22+0100"],
      // Unknown time zone--assume UTC
      ["Sun, 26 Jan 2014 17:14:22 QMT", "2014-01-26T17:14:22+0000"],

      // The following days of the week are incorrect.
      ["Tue, 28 Jan 2013 13:35:05 -0500", "2013-01-28T13:35:05-0500"],
      ["Thu, 26 Jan 14 17:14:22 -0600", "2014-01-26T17:14:22-0600"],
      ["Fri, 26 Jan 49 17:14:22 -0600", "2049-01-26T17:14:22-0600"],
      ["Mon, 26 Jan 50 17:14:22 -0600", "1950-01-26T17:14:22-0600"],
      // And for these 2 digit years, they are correct for the other century.
      ["Mon, 26 Jan 14 17:14:22 -0600", "2014-01-26T17:14:22-0600"],
      ["Wed, 26 Jan 49 17:14:22 -0600", "2049-01-26T17:14:22-0600"],
      ["Wed, 26 Jan 50 17:14:22 -0600", "1950-01-26T17:14:22-0600"],

      // Try with some illegal names for days of the week or months of the year.
      ["Sam, 05 Apr 2014 15:04:13 -0500", "2014-04-05T15:04:13-0500"],
      ["Lun, 01 Apr 2014 15:04:13 -0500", "2014-04-01T15:04:13-0500"],
      ["Mar, 02 Apr 2014 15:04:13 -0500", "2014-04-02T15:04:13-0500"],
      ["Mar, 02 April 2014 15:04:13 -0500", "2014-04-02T15:04:13-0500"],
      ["Mar, 02 Avr 2014 15:04:13 -0500", NaN],
      ["Tue, 02 A 2014 15:04:13 -0500", NaN],


      // A truly invalid date
      ["Coincident with the rapture", NaN]
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.equal(headerparser.parseDateHeader(data[0]).toString(),
          new Date(data[1]).toString());
      });
    });
  });

  suite('decodeRFC2047Words', function () {
    let header_tests = [
      // Some basic sanity tests for the test process
      ["Test", "Test"],
      ["Test 2", "Test 2"],
      ["Basic  words", "Basic  words"],
      ["Not a =? word", "Not a =? word"],

      // Simple 2047 decodings
      ["=?UTF-8?Q?Encoded?=", "Encoded"],
      ["=?UTF-8?q?Encoded?=", "Encoded"],
      ["=?ISO-8859-1?Q?oxyg=e8ne?=", "oxyg\u00e8ne"],
      ["=?UTF-8?B?QmFzZTY0?=", "Base64"],
      ["=?UTF-8?b?QmFzZTY0?=", "Base64"],
      ["=?UTF-8?Q?A_space?=", "A space"],
      ["=?UTF-8?Q?A space?=", "A space"],
      ["A =?UTF-8?Q?B?= C", "A B C"],
      ["=?UTF-8?Q?A?= =?UTF-8?Q?B?=", "AB"],
      ["=?UTF-8?Q?oxyg=c3=a8ne?=", "oxyg\u00e8ne"],
      ["=?utf-8?Q?oxyg=C3=A8ne?=", "oxyg\u00e8ne"],
      ["=?UTF-8?B?b3h5Z8OobmU=?=", "oxyg\u00e8ne"],
      ["=?UTF-8*fr?B?b3h5Z8OobmU=?=", "oxyg\u00e8ne"],
      ["=?BIG5?Q?=B9=CF=AE=D1=C0]SSCI=A4=CEJCR=B8=EA=AE=C6=AEw=C1=BF=B2=DF=A1A=A8" +
       "=F3=A7U=B1z=A1u=B4=A3=A4=C9=AC=E3=A8s=AF=C0=BD=E8=BBP=AE=C4=B2v=A5H=A4=CE" +
       "=A7=EB=BDZ=B5=A6=B2=A4=AA=BA=B9B=A5=CE=A1v=A1A=C5w=AA=EF=B3=F8=A6W=B0=D1" +
       "=A5[=A1C?=", "\u5716\u66F8\u9928SSCI\u53CAJCR\u8CC7\u6599\u5EAB\u8B1B" +
       "\u7FD2\uFF0C\u5354\u52A9\u60A8\u300C\u63D0\u5347\u7814\u7A76\u7D20\u8CEA" +
       "\u8207\u6548\u7387\u4EE5\u53CA\u6295\u7A3F\u7B56\u7565\u7684\u904B\u7528" +
       "\u300D\uFF0C\u6B61\u8FCE\u5831\u540D\u53C3\u52A0\u3002"],

      // Invalid decodings
      ["=?UTF-8?Q?=f0ab?=", "\ufffdab"],
      ["=?UTF-8?Q?=f0?= ab", "\ufffd ab"],
      ["=?UTF-8?Q?=ed=a0=bd=ed=b2=a9?=", "\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd"],
      ["=?NoSuchCharset?Q?ab?=", "=?NoSuchCharset?Q?ab?="],
      ["=?UTF-8?U?Encoded?=", "=?UTF-8?U?Encoded?="],
      ["=?UTF-8?Q?Almost", "=?UTF-8?Q?Almost"],

      // Try some non-BMP characters in various charsets
      ["=?UTF-8?B?8J+SqQ==?=", "\ud83d\udca9"],
      // The goal for the next one is to be a non-BMP in a non-full-Unicode
      // charset. The only category where this exists is a small set of
      // characters in Big5, which were previously mapped to a PUA in an older
      // version but then reassigned to Plane 1. However, Big5 is really a set
      // of slightly different, slightly incompatible charsets.
      // TODO: This requires future investigation. Bug 912470 discusses the
      // changes to Big5 proposed within Mozilla.
      //["=?Big5?Q?=87E?=", "\ud85c\ude67"],
      ["=?GB18030?B?lDnaMw==?=", "\ud83d\udca9"],

      // How to handle breaks in multi-byte encoding
      ["=?UTF-8?Q?=f0=9f?= =?UTF-8?Q?=92=a9?=", "\ud83d\udca9"],
      ["=?UTF-8?B?8J+S?= =?UTF-8?B?qQ==?=", "\ud83d\udca9"],
      ["=?UTF-8?B?8J+S?= =?UTF-8?Q?=a9?=", "\ud83d\udca9"],
      ["=?UTF-8?B?8J+S?= =?ISO-8859-1?B?qQ==?=", "\ufffd\u00a9"],
      ["=?UTF-8?Q?=f0?= =?UTF-8?Q?ab?=", "\ufffdab"],

      // This is a split non-BMP character.
      ["=?UTF-8?B?YfCfkqnwn5Kp8J+SqfCfkqnwn5Kp8J+SqfCfkqnvv70=?= =?UTF-8?B?77+9?=",
        "a\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D" +
        "\uDCA9\uD83D\uDCA9\uFFFD\uFFFD"],

      // Spaces in RFC 2047 tokens
      ["=?UTF-8?Q?Invalid token?=", "Invalid token"],

      // More tests from bug 493544
      ["AAA =?UTF-8?Q?bbb?= CCC =?UTF-8?Q?ddd?= EEE =?UTF-8?Q?fff?= GGG",
        "AAA bbb CCC ddd EEE fff GGG"],
      ["=?UTF-8?B?4oiAICDiiIEgIOKIgiAg4oiDICDiiIQgIOKIhSAg4oiGICDiiIcgIOKIiC" +
        "Ag?=\n =?UTF-8?B?4oiJICDiiIogIOKIiyAg4oiMICDiiI0gIOKIjiAg4oiP?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?utf-8?Q?=E2=88=80__=E2=88=81__=E2=88=82__=E2=88=83__=E2=88=84__=E2" +
        "?=\n =?utf-8?Q?=88=85__=E2=88=86__=E2=88=87__=E2=88=88__=E2=88=89__" +
        "=E2=88?=\n =?utf-8?Q?=8A__=E2=88=8B__=E2=88=8C__=E2=88=8D__=E2=88=8" +
        "E__=E2=88=8F?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?UTF-8?B?4oiAICDiiIEgIOKIgiAg4oiDICDiiIQgIOKIhSAg4oiGICDiiIcgIOKIiA" +
        "==?=\n =?UTF-8?B?ICDiiIkgIOKIiiAg4oiLICDiiIwgIOKIjSAg4oiOICDiiI8=?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?UTF-8?b?4oiAICDiiIEgIOKIgiAg4oiDICDiiIQgIOKIhSAg4oiGICDiiIcgIOKIiA" +
        "==?=\n =?UTF-8?b?ICDiiIkgIOKIiiAg4oiLICDiiIwgIOKIjSAg4oiOICDiiI8=?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?utf-8?Q?=E2=88=80__=E2=88=81__=E2=88=82__=E2=88=83__=E2=88=84__?=\n" +
       " =?utf-8?Q?=E2=88=85__=E2=88=86__=E2=88=87__=E2=88=88__=E2=88=89__?=\n"+
       " =?utf-8?Q?=E2=88=8A__=E2=88=8B__=E2=88=8C__=E2=88=8D__=E2=88=8E__?=\n"+
       " =?utf-8?Q?=E2=88=8F?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?utf-8?q?=E2=88=80__=E2=88=81__=E2=88=82__=E2=88=83__=E2=88=84__?=\n" +
       " =?utf-8?q?=E2=88=85__=E2=88=86__=E2=88=87__=E2=88=88__=E2=88=89__?=\n"+
       " =?utf-8?q?=E2=88=8A__=E2=88=8B__=E2=88=8C__=E2=88=8D__=E2=88=8E__?=\n"+
       " =?utf-8?q?=E2=88=8F?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],
      ["=?UTF-8?B?4oiAICDiiIEgIOKIgiAg4oiDICDiiIQgIOKIhSAg4oiGICDiiIcgIOKIiA=" +
        "==?=\n =?UTF-8?B?ICDiiIkgIOKIiiAg4oiLICDiiIwgIOKIjSAg4oiOICDiiI8=?=",
        "\u2200  \u2201  \u2202  \u2203  \u2204  \u2205  \u2206  \u2207  " +
        "\u2208  \u2209  \u220a  \u220b  \u220c  \u220d  \u220e  \u220f"],

      // Some interesting headers found in the wild:
      // Invalid base64 text. We decide not to decode this word.
      ["Re: [Kitchen Nightmares] Meow! Gordon Ramsay Is =?ISO-8859-1?B?UEgR l" +
        "qZ VuIEhlYWQgVH rbGeOIFNob BJc RP2JzZXNzZW?= With My =?ISO-8859-1?B?" +
        "SHVzYmFuZ JzX0JhbGxzL JfU2F5c19BbXiScw==?= Baking Company Owner",
        "Re: [Kitchen Nightmares] Meow! Gordon Ramsay Is =?ISO-8859-1?B?UEgR " +
        "lqZ VuIEhlYWQgVH rbGeOIFNob BJc RP2JzZXNzZW?= With My =?ISO-8859-1?B" +
        "?SHVzYmFuZ JzX0JhbGxzL JfU2F5c19BbXiScw==?= Baking Company Owner"],
      ["=?us-ascii?Q?=09Edward_Rosten?=", "\tEdward Rosten"],
      ["=?us-ascii?Q?=3D=3FUTF-8=3FQ=3Ff=3DC3=3DBCr=3F=3D?=",
        "=?UTF-8?Q?f=C3=BCr?="],
      // We don't decode unrecognized charsets (This one is actually UTF-8).
      ["=??B?Sy4gSC4gdm9uIFLDvGRlbg==?=", "=??B?Sy4gSC4gdm9uIFLDvGRlbg==?="],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headerparser.decodeRFC2047Words(data[0]), data[1]);
      });
    });
  });
  suite('8-bit header processing', function () {
    let header_tests = [
      // Non-ASCII header values
      ["oxyg\xc3\xa8ne", "oxyg\u00e8ne", "UTF-8"],
      ["oxyg\xc3\xa8ne", "oxyg\u00e8ne", "ISO-8859-1"], // UTF-8 overrides
      ["oxyg\xc3\xa8ne", "oxyg\u00e8ne"], // default to UTF-8 if no charset
      ["oxyg\xe8ne", "oxyg\ufffdne", "UTF-8"],
      ["oxyg\xe8ne", "oxyg\u00e8ne", "ISO-8859-1"],
      ["\xc3\xa8\xe8", "\u00e8\ufffd", "UTF-8"],
      ["\xc3\xa8\xe8", "\u00c3\u00a8\u00e8", "ISO-8859-1"],

      // Don't fallback to UTF-16 or UTF-32
      ["\xe8S!0", "\ufffdS!0", "UTF-16"],
      ["\xe8S!0", "\ufffdS!0", "UTF-16be"],
      ["\xe8S!0", "\ufffdS!0", "UTF-32"],
      ["\xe8S!0", "\ufffdS!0", "utf-32"],

      // Don't combine encoded-word and header charset decoding
      ["=?UTF-8?Q?=c3?= \xa8", "\ufffd \ufffd", "UTF-8"],
      ["=?UTF-8?Q?=c3?= \xa8", "\ufffd \u00a8", "ISO-8859-1"],
      ["\xc3 =?UTF-8?Q?=a8?=", "\ufffd \ufffd", "UTF-8"],
      ["\xc3 =?UTF-8?Q?=a8?=", "\u00c3 \ufffd", "ISO-8859-1"],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headerparser.decodeRFC2047Words(
          headerparser.convert8BitHeader(data[0], data[2])), data[1]);
      });
    });
  });
});

});
