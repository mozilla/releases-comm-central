/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file is used to test the mime parser implemented in JS, mostly by means
// of creating custom emitters and verifying that the methods on that emitter
// are called in the correct order. This also tests that the various
// HeaderParser methods are run correctly.

Components.utils.import("resource:///modules/mimeParser.jsm");
Components.utils.import("resource:///modules/IOUtils.js");

/// Utility method to compare objects
function compare_objects(real, expected) {
  // real is a Map; convert it into an object for uneval purposes
  if (typeof real == "object") {
    var newreal = {};
    for (let [k, v] of real) {
      newreal[k] = v;
    }
    real = newreal;
  }
  var a = uneval(real), b = uneval(expected);
  // Very long strings don't get printed out fully (unless they're wrong)
  if ((a.length > 100 || b.length > 100) && (a == b))
    do_check_true(a == b);
  else
    do_check_eq(a, b);
}

/// Returns and deletes object[field] if present, or undefined if not.
function extract_field(object, field) {
  if (field in object) {
    var result = object[field];
    delete object[field];
    return result;
  }
  return undefined;
}

/// A file cache for read_file.
var file_cache = {};

/**
 * Read a file into a string (all line endings become CRLF).
 */
function read_file(file, start, end) {
  if (!(file in file_cache)) {
    var realFile = do_get_file("../../../data/" + file);
    file_cache[file] = IOUtils.loadFileToString(realFile).split(/\r\n|[\r\n]/);
  }
  var contents = file_cache[file];
  if (start !== undefined) {
    contents = contents.slice(start - 1, end - 1);
  }
  return contents.join('\r\n');
}

/**
 * Helper for body tests.
 *
 * Some extra options are listed too:
 * _split: The contents of the file will be passed in packets split by this
 *         regex. Be sure to include the split delimiter in a group so that they
 *         are included in the output packets!
 * _eol: The CRLFs in the input file will be replaced with the given line
 *       ending instead.
 * @param test     The name of test
 * @param file     The name of the file to read (relative to mailnews/data)
 * @param opts     Options for the mime parser, as well as a few extras detailed
 *                 above.
 * @param partspec An array of [partnum, line start, line end] detailing the
 *                 expected parts in the body. It will be expected that the
 *                 accumulated body part data for partnum would be the contents
 *                 of the file from [line start, line end) [1-based lines]
 */
function make_body_test(test, file, opts, partspec) {
  var results = [[p[0], read_file(file, p[1], p[2])] for (p of partspec)];
  var msgcontents = read_file(file);
  return [test, msgcontents, opts, results];
}

/// This is the expected part specifier for the multipart-complex1 test file,
/// specified here because it is used in several cases.
var mpart_complex1 = [['1', 8, 10], ['2', 14, 16], ['3.1', 22, 24],
    ['4', 29, 31], ['5', 33, 35]];

// Format of tests:
// entry[0] = name of the test
// entry[1] = message (a string or an array of packets)
// entry[2] = options for the MIME parser
// entry[3] = A checker result:
//            either a {partnum: header object} (to check headers)
//            or a [[partnum body], [partnum body], ...] (to check bodies)
//            (the partnums refer to the expected part numbers of the MIME test)
// Note that for body tests, unless you're testing decoding, it is preferable to
// use make_body_test instead of writing the array yourself.
var parser_tests = [
  // Body tests from data
  // (Note: line numbers are 1-based. Also, to capture trailing EOF, add 2 to
  // the last line number of the file).
  make_body_test("Basic body", "basic1", {}, [['', 3, 5]]),
  make_body_test("Basic multipart", "multipart1", {}, [['1', 10, 12]]),
  make_body_test("Basic multipart", "multipart2", {}, [['1', 8, 11]]),
  make_body_test("Complex multipart", "multipart-complex1", {}, mpart_complex1),
  make_body_test("Truncated multipart", "multipart-complex2", {},
    [['1.1.1.1', 21, 25], ['2', 27, 57], ['3', 60, 62]]),
  make_body_test("No LF multipart", "multipartmalt-detach", {},
    [['1', 20, 21], ['2.1', 27, 38], ['2.2', 42, 43], ['2.3', 47, 48],
     ['3', 53, 54]]),
  make_body_test("Raw body", "multipart1", {bodyformat: "raw"}, [['', 4, 14]]),
  ["Base64 decode 1", read_file("base64-1"), {bodyformat: "decode"},
    [['', "\r\nHello, world! (Again...)\r\n\r\nLet's see how well base64 text" +
          " is handled.                            Yay, lots of spaces! There" +
          "'s even a CRLF at the end and one at the beginning, but the output" +
          " shouldn't have it.\r\n"]]],
  ["Base64 decode 2", read_file("base64-2"), {bodyformat: "decode"},
    [['', "<html><body>This is base64 encoded HTML text, and the tags shouldn" +
          "'t be stripped.\r\n<b>Bold text is bold!</b></body></html>\r\n"]]],
  make_body_test("Base64 nodecode", "base64-1", {}, [['', 4, 9]]),
  ["QP decode", read_file("bug505221"), {pruneat: '1', bodyformat: "decode"},
    [['1', '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">\r'  +
           '\n<HTML><HEAD>\r\n<META HTTP-EQUIV="Content-Type" CONTENT="text/h' +
           'tml; charset=us-ascii">\r\n\r\n\r\n<META content="MSHTML 6.00.600' +
           '0.16735" name=GENERATOR></HEAD>\r\n<BODY> bbb\r\n</BODY></HTML>']]],

  // Comprehensive tests from the torture test
  make_body_test("Torture regular body", "mime-torture", {}, [
    ['1', 17, 21], ['2$.1', 58, 75], ['2$.2.1', 83, 97], ['2$.3', 102, 130],
    ['3$', 155, 7742], ['4', 7747, 8213], ['5', 8218, 8242],
    ['6$.1.1', 8284, 8301], ['6$.1.2', 8306, 8733], ['6$.2.1', 8742, 9095],
    ['6$.2.2', 9100, 9354], ['6$.2.3', 9357, 11794], ['6$.2.4', 11797, 12155],
    ['6$.3', 12161, 12809], ['7$.1', 12844, 12845], ['7$.2', 12852, 13286],
    ['7$.3', 13288, 13297], ['8$.1', 13331, 13358], ['8$.2', 13364, 13734],
    ['9$', 13757, 20179], ['10', 20184, 21200], ['11$.1', 21223, 22031],
    ['11$.2', 22036, 22586], ['12$.1', 22607, 23469], ['12$.2', 23474, 23774],
    ['12$.3$.1', 23787, 23795], ['12$.3$.2.1', 23803, 23820],
    ['12$.3$.2.2', 23825, 24633], ['12$.3$.3', 24640, 24836],
    ['12$.3$.4$', 24848, 25872]]),
  make_body_test("Torture pruneat", "mime-torture", {"pruneat": '4'},
    [['4', 7747, 8213]]),
];

function test_parser(message, opts, results) {
  var checkingHeaders = !(results instanceof Array);
  var calls = 0, dataCalls = 0;
  var fusingParts = extract_field(opts, "_nofuseparts") === undefined;
  var emitter = {
    stack: [],
    startMessage: function emitter_startMsg() {
      do_check_eq(this.stack.length, 0);
      calls++;
      this.partData = '';
    },
    endMessage: function emitter_endMsg() {
      do_check_eq(this.stack.length, 0);
      calls++;
    },
    startPart: function emitter_startPart(partNum, headers) {
      this.stack.push(partNum);
      if (checkingHeaders) {
        do_check_true(partNum in results);
        compare_objects(headers, results[partNum]);
        if (fusingParts)
          do_check_eq(this.partData, '');
      }
    },
    deliverPartData: function emitter_partData(partNum, data) {
      do_check_eq(this.stack[this.stack.length - 1], partNum);
      try {
        if (!checkingHeaders) {
          if (fusingParts)
            this.partData += data;
          else {
            do_check_eq(partNum, results[dataCalls][0]);
            compare_objects(data, results[dataCalls][1]);
          }
        }
      } finally {
        if (!fusingParts)
          dataCalls++;
      }
    },
    endPart: function emitter_endPart(partNum) {
      if (this.partData != '') {
        do_check_eq(partNum, results[dataCalls][0]);
        compare_objects(this.partData, results[dataCalls][1]);
        dataCalls++;
        this.partData = '';
      }
      do_check_eq(this.stack.pop(), partNum);
    }
  };
  opts.onerror = function (e) { throw e; };
  MimeParser.parseSync(message, emitter, opts);
  do_check_eq(calls, 2);
  if (!checkingHeaders)
    do_check_eq(dataCalls, results.length);
}

var ATTACH = MimeParser.HEADER_PARAMETER;
// Format of tests:
// entry[0] = header
// entry[1] = flags
// entry[2] = result to match
var header_tests = [
  // Parameter passing
  ["multipart/related", MimeParser.HEADER_PARAMETER, ["multipart/related", {}]],
  ["a ; b=v", MimeParser.HEADER_PARAMETER, ["a", {"b": "v"}]],
  ["a ; b='v'", MimeParser.HEADER_PARAMETER, ["a", {"b": "'v'"}]],
  ['a; b = "v"', MimeParser.HEADER_PARAMETER, ["a", {"b": "v"}]],
  ["a;b=1;b=2", MimeParser.HEADER_PARAMETER, ["a", {"b": "1"}]],
  ["a;b=2;b=1", MimeParser.HEADER_PARAMETER, ["a", {"b": "2"}]],
  ['a;b="a;b"', MimeParser.HEADER_PARAMETER, ["a", {"b": "a;b"}]],
  ['a;b="\\\\"', MimeParser.HEADER_PARAMETER, ["a", {"b": "\\"}]],
  ['a;b="a\\b\\c"', MimeParser.HEADER_PARAMETER, ["a", {"b": "abc"}]],
  ['a;b=1;c=2', MimeParser.HEADER_PARAMETER, ["a", {"b": "1", "c": "2"}]],
  ['a;b="a\\', MimeParser.HEADER_PARAMETER, ["a", {"b": "a"}]],
  ['a;b', MimeParser.HEADER_PARAMETER, ["a", {}]],
  ['a;b=";";c=d', MimeParser.HEADER_PARAMETER, ["a", {"b": ';', 'c': "d"}]],
];

function test_header(headerValue, flags, expected) {
  let result = MimeParser.parseHeaderField(headerValue, flags);
  do_check_eq(result.preSemi, expected[0]);
  compare_objects(result, expected[1]);
}

function run_test() {
  for (let test of parser_tests) {
    dump("Testing message " + test[0]);
    if (test[1] instanceof Array)
      dump(" using " + test[1].length + " packets");
    dump('\n');
    test_parser(test[1], test[2], test[3]);
  }
  for (let test of header_tests) {
    dump("Testing value ->" + test[0] + "<- with flags " + test[1] + "\n");
    test_header(test[0], test[1], test[2]);
  }
}
