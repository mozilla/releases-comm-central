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

      // RFC 2047 token should not interfer with lexical processing
      ["=?UTF-8?Q?a@b.c,?= <b@b.c>", [{name: "a@b.c,", email: "b@b.c"}]],
      ["=?UTF-8?Q?a@b.c=2C?= <b@b.c>", [{name: "a@b.c,", email: "b@b.c"}]],
      ["=?UTF-8?Q?<?= <a@b.c>", [{name: "<", email: "a@b.c"}]],
      ["Simple =?UTF-8?Q?<?= a@b.c>",
        [{name: "", email: '"Simple < a"@b.c'}]],
      ["Tag <=?UTF-8?Q?email?=@b.c>", [{name: "Tag", email: "email@b.c"}]],
    ];
    header_tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headerparser.parseAddressingHeader(data[0], true),
          data[1]);
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
