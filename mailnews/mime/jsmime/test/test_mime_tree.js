"use strict";
define(function(require) {

var assert = require('assert');
var jsmime = require('jsmime');
var fs = require('fs');

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
 * @param file  The name of the file to read, relative to the data/ directory.
 * @param start The first line of the file to return, defaulting to 0
 * @param end   The last line of the file to return, defaulting to the number of
 *              lines in the file.
 * @return      Promise<String> The contents of the file as a binary string.
 */
function read_file(file, start, end) {
  if (!(file in file_cache)) {
    var realFile = new Promise(function (resolve, reject) {
      fs.readFile("data/" + file, function (err, data) {
        if (err) reject(err);
        else resolve(data);
      });
    });
    var loader = realFile.then(function (contents) {
      var inStrForm = '';
      while (contents.length > 0) {
        inStrForm += String.fromCharCode.apply(null,
          contents.subarray(0, 1024));
        contents = contents.subarray(1024);
      }
      return inStrForm.split(/\r\n|[\r\n]/);
    });
    file_cache[file] = loader;
  }
  return file_cache[file].then(function (contents) {
    if (start !== undefined) {
      contents = contents.slice(start - 1, end - 1);
    }
    return contents.join('\r\n');
  });
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
  var results = Promise.all([
    Promise.all([p[0], read_file(file, p[1], p[2])]) for (p of partspec)]);
  var eol = extract_field(opts, "_eol");
  var msgtext = read_file(file).then(function(msgcontents) {
    var packetize = extract_field(opts, "_split");
    if (packetize !== undefined)
      msgcontents = msgcontents.split(packetize);
    if (eol !== undefined) {
      msgcontents = msgcontents.replace(/\r\n/g, eol);
    }
    return msgcontents;
  });
  if (eol !== undefined) {
    results = results.then(function(results) {
      for (var part of results) {
        part[1] = part[1].replace(/\r\n/g, eol);
      }
      return results;
    });
  }
  return [test, msgtext, opts, results];
}

/**
 * Execute a single MIME tree test.
 *
 * @param message  Either the text of the message, an array of textual message
 *                 part data (imagine coming on different TCP packets), or a
 *                 promise that resolves to any of the above.
 * @param opts     A set of options for the parser and for the test.
 * @param results  The expected results of the call. This may either be a
 *                 dictionary of part number -> header -> values (to check
 *                 headers), or an array of [partnum, partdata] for expected
 *                 results to deliverPartData, or a promise for the above.
 * @return         A promise containing the results of the test.
 */
function testParser(message, opts, results) {
  var uncheckedValues;
  var checkingHeaders;
  var calls = 0;
  var fusingParts = extract_field(opts, "_nofuseparts") === undefined;
  var emitter = {
    stack: [],
    startMessage: function emitter_startMsg() {
      assert.equal(this.stack.length, 0);
      calls++;
      this.partData = '';
    },
    endMessage: function emitter_endMsg() {
      assert.equal(this.stack.length, 0);
      calls++;
    },
    startPart: function emitter_startPart(partNum, headers) {
      this.stack.push(partNum);
      if (checkingHeaders) {
        assert.ok(partNum in uncheckedValues);
        // Headers is a map, convert it to an object.
        var objmap = new Object();
        for (let pair of headers)
          objmap[pair[0]] = pair[1];
        var expected = uncheckedValues[partNum];
        var convresults = new Object();
        for (let key in expected) {
          try {
            convresults[key] =
              jsmime.headerparser.parseStructuredHeader(key, expected[key]);
          } catch (e) {
            convresults[key] = expected[key];
          }
        }
        assert.deepEqual(objmap, convresults);
        if (fusingParts)
          assert.equal(this.partData, '');
        delete uncheckedValues[partNum];
      }
    },
    deliverPartData: function emitter_partData(partNum, data) {
      assert.equal(this.stack[this.stack.length - 1], partNum);
      if (!checkingHeaders) {
        if (fusingParts)
          this.partData += data;
        else {
          let check = uncheckedValues.shift();
          assert.equal(partNum, check[0]);
          assert.equal(data, check[1]);
        }
      }
    },
    endPart: function emitter_endPart(partNum) {
      if (this.partData != '') {
        let check = uncheckedValues.shift();
        assert.equal(partNum, check[0]);
        assert.equal(this.partData, check[1]);
        this.partData = '';
      }
      assert.equal(this.stack.pop(), partNum);
    }
  };
  opts.onerror = function (e) { throw e; };

  return Promise.all([message, results]).then(function (vals) {
    let [message, results] = vals;
    // Clone the results array into uncheckedValues
    if (Array.isArray(results)) {
      uncheckedValues = [for (val of results) val];
      checkingHeaders = false;
    } else {
      uncheckedValues = {};
      for (let key in results) {
        uncheckedValues[key] = results[key];
      }
      checkingHeaders = true;
    }
    if (!Array.isArray(message))
      message = [message];
    var parser = new jsmime.MimeParser(emitter, opts);
    message.forEach(function (packet) {
      parser.deliverData(packet);
    });
    parser.deliverEOF();
    assert.equal(calls, 2);
    if (!checkingHeaders)
      assert.equal(0, uncheckedValues.length);
    else
      assert.deepEqual({}, uncheckedValues);
  });
}

suite('MimeParser', function () {
  /// This is the expected part specifier for the multipart-complex1 test file,
  /// specified here because it is used in several cases.
  let mpart_complex1 = [['1', 8, 10], ['2', 14, 16], ['3.1', 22, 24],
      ['4', 29, 31], ['5', 33, 35]];

  suite('Simple tests', function () {
    let parser_tests = [
      // The following tests are either degenerate or error cases that should
      // work
      ["Empty string", "", {}, {'': {}}],
      ["No value for header", "Header", {}, {'': {"Header": ['']}}],
      ["No trailing newline", "To: eof@example.net", {},
        {'': {"To": ["eof@example.net"]}}],
      ["Header no val", "To: eof@example.net\r\n", {},
        {'': {"To": ["eof@example.net"]}}],
      ["No body no headers", "\r\n\r\n", {}, {'': {}}],
      ["Body no headers", "\r\n\r\nA", {}, {'': {}}],
      // Basic cases for headers
      ['Multiparts get headers', read_file("multipart-complex1"), {},
        { '': {'Content-Type': ['multipart/mixed; boundary="boundary"']},
          '1': {'Content-Type': ['application/octet-stream'],
                'Content-Transfer-Encoding': ['base64']},
          '2': {'Content-Type': ['image/png'],
                'Content-Transfer-Encoding': ['base64']},
          '3': {'Content-Type': ['multipart/related; boundary="boundary2"']},
          '3.1': {'Content-Type': ['text/html']},
          '4': {'Content-Type': ['text/plain']}, '5': {} }],
    ];
    parser_tests.forEach(function (data) {
      arrayTest(data, function () {
        return testParser(data[1], data[2], data[3]);
      });
    });
  });

  suite('Body tests', function () {
    let parser_tests = [
      // Body tests from data
      // (Note: line numbers are 1-based. Also, to capture trailing EOF, add 2
      // to the last line number of the file).
      make_body_test("Basic body", "basic1", {}, [['', 3, 5]]),
      make_body_test("Basic multipart", "multipart1", {}, [['1', 10, 12]]),
      make_body_test("Basic multipart", "multipart2", {}, [['1', 8, 11]]),
      make_body_test("Complex multipart", "multipart-complex1", {},
        mpart_complex1),
      make_body_test("Truncated multipart", "multipart-complex2", {},
        [['1.1.1.1', 21, 25], ['2', 27, 57], ['3', 60, 62]]),
      make_body_test("No LF multipart", "multipartmalt-detach", {},
        [['1', 20, 21], ['2.1', 27, 38], ['2.2', 42, 43], ['2.3', 47, 48],
         ['3', 53, 54]]),
      make_body_test("Raw body", "multipart1", {bodyformat: "raw"},
        [['', 4, 14]]),
      ["Base64 decode 1", read_file("base64-1"), {bodyformat: "decode"},
        [['', "\r\nHello, world! (Again...)\r\n\r\nLet's see how well base64 " +
              "text is handled.                            Yay, lots of space" +
              "s! There's even a CRLF at the end and one at the beginning, bu" +
              "t the output shouldn't have it.\r\n"]]],
      ["Base64 decode 2", read_file("base64-2"), {bodyformat: "decode"},
        [['', "<html><body>This is base64 encoded HTML text, and the tags sho" +
              "uldn't be stripped.\r\n<b>Bold text is bold!</b></body></html>" +
              "\r\n"]]],
      ["Base64 decode line issues",
        read_file("base64-2").then(function (s) { return s.split(/(\r\n)/) }),
        {bodyformat: "decode"},
        [['', "<html><body>This is base64 encoded HTML text, and the tags sho" +
              "uldn't be stripped.\r\n<b>Bold text is bold!</b></body></html>" +
              "\r\n"]]],
      make_body_test("Base64 nodecode", "base64-1", {}, [['', 4, 9]]),
      ["QP decode", read_file("bug505221"),
        {pruneat: '1', bodyformat: "decode"},
        [['1', '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"' +
               '>\r\n<HTML><HEAD>\r\n<META HTTP-EQUIV="Content-Type" CONTENT=' +
               '"text/html; charset=us-ascii">\r\n\r\n\r\n<META content="MSHT' +
               'ML 6.00.6000.16735" name=GENERATOR></HEAD>\r\n<BODY> bbb\r\n<' +
               '/BODY></HTML>']]],
      ["Nested messages", read_file("message-encoded"), {bodyformat: "decode"},
        [['1$', 'This is a plain-text message.'],
         ['2$', 'I am a plain-text message.'],
         ['3$', 'I am an encoded plain-text message.']]],
      ["Nested message headers", read_file("message-encoded"), {},
        {'': {'Content-Type': ['multipart/mixed; boundary="iamaboundary"']},
         '1': {'Content-Type': ['message/rfc822']},
         '1$': {'Subject': ['I am a subject']},
         '2': {'Content-Type': ['message/global'],
               'Content-Transfer-Encoding': ['base64']},
         '2$': {'Subject': ['\u79c1\u306f\u3001\u4ef6\u540d\u5348\u524d']},
         '3': {'Content-Type': ['message/news'],
               'Content-Transfer-Encoding': ['quoted-printable']},
         '3$': {'Subject': ['\u79c1\u306f\u3001\u4ef6\u540d\u5348\u524d']}}],
    ];
    parser_tests.forEach(function (data) {
      arrayTest(data, function () {
        return testParser(data[1], data[2], data[3]);
      });
    });
  });

  suite('Torture tests', function () {
    // Generate a very long message for tests
    let teststr = 'a';
    for (let i = 0; i < 16; i++)
      teststr += teststr;
    let parser_tests = [
      ["Base64 very long decode",
        "Content-Transfer-Encoding: base64\r\n\r\n" + btoa(teststr) + "\r\n",
        {bodyformat: "decode"}, [['', teststr]]],
      make_body_test("Torture regular body", "mime-torture", {}, [
        ['1', 17, 21], ['2$.1', 58, 75], ['2$.2.1', 83, 97], ['2$.3', 102, 130],
        ['3$', 155, 7742], ['4', 7747, 8213], ['5', 8218, 8242],
        ['6$.1.1', 8284, 8301], ['6$.1.2', 8306, 8733], ['6$.2.1', 8742, 9095],
        ['6$.2.2', 9100, 9354], ['6$.2.3', 9357, 11794],
        ['6$.2.4', 11797, 12155], ['6$.3', 12161, 12809],
        ['7$.1', 12844, 12845], ['7$.2', 12852, 13286],
        ['7$.3', 13288, 13297], ['8$.1', 13331, 13358], ['8$.2', 13364, 13734],
        ['9$', 13757, 20179], ['10', 20184, 21200], ['11$.1', 21223, 22031],
        ['11$.2', 22036, 22586], ['12$.1', 22607, 23469],
        ['12$.2', 23474, 23774], ['12$.3$.1', 23787, 23795],
        ['12$.3$.2.1', 23803, 23820], ['12$.3$.2.2', 23825, 24633],
        ['12$.3$.3', 24640, 24836], ['12$.3$.4$', 24848, 25872]]),
      make_body_test("Torture pruneat", "mime-torture", {"pruneat": '4'},
        [['4', 7747, 8213]]),

      // Test packetization problems
      make_body_test("Large packets", "multipart-complex1",
        {"_split": /(.{30})/}, mpart_complex1),
      make_body_test("Split on newline", "multipart-complex1",
        {"_split": /(\r\n)/}, mpart_complex1),
      make_body_test("Pathological splitting", "multipart-complex1",
        {"_split": ''}, mpart_complex1),

      // Non-CLRF line endings?
      make_body_test("LF-based messages", "multipart-complex1",
        {"_eol": "\n"}, mpart_complex1),
      make_body_test("CR-based messages", "multipart-complex1",
        {"_eol": "\r"}, mpart_complex1),
    ];
    parser_tests.forEach(function (data) {
      arrayTest(data, function () {
        return testParser(data[1], data[2], data[3]);
      });
    });
  });

  suite('Header tests', function () {
    let parser_tests = [
      // Basic cases for headers
      ['Multiparts get headers', read_file("multipart-complex1"), {},
        { '': {'Content-Type': ['multipart/mixed; boundary="boundary"']},
          '1': {'Content-Type': ['application/octet-stream'],
                'Content-Transfer-Encoding': ['base64']},
          '2': {'Content-Type': ['image/png'],
                'Content-Transfer-Encoding': ['base64']},
          '3': {'Content-Type': ['multipart/related; boundary="boundary2"']},
          '3.1': {'Content-Type': ['text/html']},
          '4': {'Content-Type': ['text/plain']}, '5': {} }],
      // 'From ' is not an [iterable] header
      ['Exclude mbox delimiter', read_file('bugmail11'), {}, {'': {
        'X-Mozilla-Status': ['0001'], 'X-Mozilla-Status2': ['00000000'],
        'X-Mozilla-Keys': [''],
        'Return-Path': ['<example@example.com>',
           '<bugzilla-daemon@mozilla.org>'],
        'Delivered-To': ['bugmail@example.org'],
        'Received': ['by 10.114.166.12 with SMTP id o12cs163262wae;' +
                     '        Fri, 11 Apr 2008 07:17:31 -0700 (PDT)',
          'by 10.115.60.1 with SMTP id n1mr214763wak.181.1207923450166;' +
          '        Fri, 11 Apr 2008 07:17:30 -0700 (PDT)',
          'from webapp-out.mozilla.org (webapp01.sj.mozilla.com [63.245.208.1' +
          '46])        by mx.google.com with ESMTP id n38si6807242wag.2.2008.' +
          '04.11.07.17.29;        Fri, 11 Apr 2008 07:17:30 -0700 (PDT)',
          'from mrapp51.mozilla.org (mrapp51.mozilla.org [127.0.0.1])' +
          '\tby webapp-out.mozilla.org (8.13.8/8.13.8) with ESMTP id m3BEHTGU' +
          '030132\tfor <bugmail@example.org>; Fri, 11 Apr 2008 07:17:29 -0700',
          '(from root@localhost)' +
          '\tby mrapp51.mozilla.org (8.13.8/8.13.8/Submit) id m3BEHTk4030129;' +
          '\tFri, 11 Apr 2008 07:17:29 -0700'],
        'Received-Spf': ['neutral (google.com: 63.245.208.146 is neither perm' +
          'itted nor denied by best guess record for domain of bugzilla-daemo' +
          'n@mozilla.org) client-ip=63.245.208.146;'],
        'Authentication-Results': ['mx.google.com; spf=neutral (google.com: 6' +
          '3.245.208.146 is neither permitted nor denied by best guess record' +
          ' for domain of bugzilla-daemon@mozilla.org) smtp.mail=bugzilla-dae' +
          'mon@mozilla.org'],
        'Date': ['Fri, 11 Apr 2008 07:17:29 -0700'],
        'Message-ID': ['<200804111417.m3BEHTk4030129@mrapp51.mozilla.org>'],
        'From': ['bugzilla-daemon@mozilla.org'], 'To': ['bugmail@example.org'],
        'Subject': ['Bugzilla: confirm account creation'],
        'X-Bugzilla-Type': ['admin'],
        'Content-Type': ['text/plain; charset="UTF-8"'],
        'MIME-Version': ['1.0']}}],
    ];
    parser_tests.forEach(function (data) {
      arrayTest(data, function () {
        return testParser(data[1], data[2], data[3]);
      });
    });
  });

  suite('Charset tests', function () {
    function buildTree(file, options) {
      var tree = new Map();
      var emitter = {
        startPart: function (part, headers) {
          tree.set(part, {headers: headers, body: null});
        },
        deliverPartData: function (part, data) {
          var obj = tree.get(part);
          if (obj.body === null)
            obj.body = data;
          else if (typeof obj.body === "string")
            obj.body += data;
          else {
            var newData = new Uint8Array(obj.body.length + data.length);
            newData.set(obj.body);
            newData.subarray(obj.body.length).set(data);
            obj.body = newData;
          }
        }
      };
      return file.then(function (data) {
        var parser = new jsmime.MimeParser(emitter, options);
        parser.deliverData(data);
        parser.deliverEOF();
        return tree;
      });
    }
    test('Unicode decoding', function () {
      return buildTree(read_file('shift-jis-image'), {
        strformat: "unicode",
        bodyformat: "decode"
      }).then(function (tree) {
        // text/plain should be transcoded...
        assert.equal(tree.get('1').headers.get('Content-Type').get('charset'),
          'Shift-JIS');
        assert.equal(tree.get('1').headers.charset, 'Shift-JIS');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb');
        assert.equal(tree.get('1').body, 'Portable Network Graphics\uff08' +
          '\u30dd\u30fc\u30bf\u30d6\u30eb\u30fb\u30cd\u30c3\u30c8\u30ef\u30fc' +
          '\u30af\u30fb\u30b0\u30e9\u30d5\u30a3\u30c3\u30af\u30b9\u3001PNG' +
          '\uff09\u306f\u30b3\u30f3\u30d4\u30e5\u30fc\u30bf\u3067\u30d3\u30c3' +
          '\u30c8\u30de\u30c3\u30d7\u753b\u50cf\u3092\u6271\u3046\u30d5\u30a1' +
          '\u30a4\u30eb\u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3067\u3042\u308b' +
          '\u3002\u5727\u7e2e\u30a2\u30eb\u30b4\u30ea\u30ba\u30e0\u3068\u3057' +
          '\u3066Deflate\u3092\u63a1\u7528\u3057\u3066\u3044\u308b\u3001' +
          '\u5727\u7e2e\u306b\u3088\u308b\u753b\u8cea\u306e\u52a3\u5316\u306e' +
          '\u306a\u3044\u53ef\u9006\u5727\u7e2e\u306e\u753b\u50cf\u30d5\u30a1' +
          '\u30a4\u30eb\u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3067\u3042\u308b' +
          '\u3002\r\n');
        // ... but not image/png
        assert.ok(!tree.get('2').headers.get('Content-Type').has('charset'));
        assert.equal(tree.get('2').headers.charset, '');
        assert.equal(tree.get('2').headers.get('Content-Description'),
          '\ufffdP\ufffdc\ufffd@\ufffd\ufffd\ufffdR\ufffdA\ufffdg\ufffd\ufffd');
        assert.equal(tree.get('2').headers.getRawHeader('Content-Description'),
          '\x83\x50\x83\x63\x83\x40\x83\x8b\x83\x52\x83\x41\x83\x67\x83\x8b');
        var imageData = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAABECAIAAADGJao+AAAAwklE' +
          'QVR4Xu3UgQbDMBRA0bc03f//b7N0VuqJEmwoc+KqNEkDh9b+2HuJu1KNO4f+AQCAAA' +
          'AQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAAANReamRLlPWYfNH0' +
          'klxcPs+cP3NxWF+vi3lb7pa2R+vx6tHOtuN1O+a5lY3HzgM5ya/GM5N7ZjfPq7/5yS' +
          '8IgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAIw322gDIPvt' +
          'lmUAAAAASUVORK5CYII=';
        imageData = atob(imageData);
        var asArray = new Uint8Array(imageData.length);
        for (var i = 0; i < asArray.length; i++)
          asArray[i] = imageData.charCodeAt(i);
        assert.deepEqual(tree.get('2').body, asArray);

        // Touching the header charset should change the interpretation.
        tree.get('1').headers.charset = 'Shift-JIS';
        assert.equal(tree.get('1').headers.charset, 'Shift-JIS');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb');
      });
    });
    test('Fallback charset decoding', function () {
      return buildTree(read_file('shift-jis-image'), {
        strformat: "unicode",
        charset: "ISO-8859-1",
        bodyformat: "decode"
      }).then(function (tree) {
        // text/plain should be transcoded...
        assert.equal(tree.get('1').headers.get('Content-Type').get('charset'),
          'Shift-JIS');
        assert.equal(tree.get('1').headers.charset, 'Shift-JIS');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb');
        assert.equal(tree.get('1').body, 'Portable Network Graphics\uff08' +
          '\u30dd\u30fc\u30bf\u30d6\u30eb\u30fb\u30cd\u30c3\u30c8\u30ef\u30fc' +
          '\u30af\u30fb\u30b0\u30e9\u30d5\u30a3\u30c3\u30af\u30b9\u3001PNG' +
          '\uff09\u306f\u30b3\u30f3\u30d4\u30e5\u30fc\u30bf\u3067\u30d3\u30c3' +
          '\u30c8\u30de\u30c3\u30d7\u753b\u50cf\u3092\u6271\u3046\u30d5\u30a1' +
          '\u30a4\u30eb\u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3067\u3042\u308b' +
          '\u3002\u5727\u7e2e\u30a2\u30eb\u30b4\u30ea\u30ba\u30e0\u3068\u3057' +
          '\u3066Deflate\u3092\u63a1\u7528\u3057\u3066\u3044\u308b\u3001' +
          '\u5727\u7e2e\u306b\u3088\u308b\u753b\u8cea\u306e\u52a3\u5316\u306e' +
          '\u306a\u3044\u53ef\u9006\u5727\u7e2e\u306e\u753b\u50cf\u30d5\u30a1' +
          '\u30a4\u30eb\u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3067\u3042\u308b' +
          '\u3002\r\n');
        // ... but not image/png
        assert.ok(!tree.get('2').headers.get('Content-Type').has('charset'));
        assert.equal(tree.get('2').headers.charset, 'ISO-8859-1');
        assert.equal(tree.get('2').headers.get('Content-Description'),
          '\u0192P\u0192c\u0192@\u0192\u2039\u0192R\u0192A\u0192g\u0192\u2039');
        assert.equal(tree.get('2').headers.getRawHeader('Content-Description'),
          '\x83\x50\x83\x63\x83\x40\x83\x8b\x83\x52\x83\x41\x83\x67\x83\x8b');
        var imageData = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAABECAIAAADGJao+AAAAwklE' +
          'QVR4Xu3UgQbDMBRA0bc03f//b7N0VuqJEmwoc+KqNEkDh9b+2HuJu1KNO4f+AQCAAA' +
          'AQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAAANReamRLlPWYfNH0' +
          'klxcPs+cP3NxWF+vi3lb7pa2R+vx6tHOtuN1O+a5lY3HzgM5ya/GM5N7ZjfPq7/5yS' +
          '8IgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAIw322gDIPvt' +
          'lmUAAAAASUVORK5CYII=';
        imageData = atob(imageData);
        var asArray = new Uint8Array(imageData.length);
        for (var i = 0; i < asArray.length; i++)
          asArray[i] = imageData.charCodeAt(i);
        assert.deepEqual(tree.get('2').body, asArray);

        // Touching the header charset should change the interpretation.
        tree.get('1').headers.charset = 'Shift-JIS';
        assert.equal(tree.get('1').headers.charset, 'Shift-JIS');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb');
      });
    });
    test('Forced charset decoding', function () {
      return buildTree(read_file('shift-jis-image'), {
        strformat: "unicode",
        charset: "ISO-8859-1",
        "force-charset": true,
        bodyformat: "decode"
      }).then(function (tree) {
        // text/plain should be transcoded...
        assert.equal(tree.get('1').headers.get('Content-Type').get('charset'),
          'Shift-JIS');
        assert.equal(tree.get('1').headers.charset, 'ISO-8859-1');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u0192P\u0192c\u0192@\u0192\u2039\u0192R\u0192A\u0192g\u0192\u2039');
        assert.equal(tree.get('1').body, 'Portable Network Graphics\u0081i' +
          '\u0192|\u0081[\u0192^\u0192u\u0192\u2039\u0081E\u0192l\u0192b' +
          '\u0192g\u0192\u008f\u0081[\u0192N\u0081E\u0192O\u0192\u2030\u0192t' +
          '\u0192B\u0192b\u0192N\u0192X\u0081APNG\u0081j\u201a\u00cd\u0192R' +
          '\u0192\u201c\u0192s\u0192\u2026\u0081[\u0192^\u201a\u00c5\u0192r' +
          '\u0192b\u0192g\u0192}\u0192b\u0192v\u2030\u00e6\u2018\u0153\u201a' +
          '\u00f0\u02c6\u00b5\u201a\u00a4\u0192t\u0192@\u0192C\u0192\u2039' +
          '\u0192t\u0192H\u0081[\u0192}\u0192b\u0192g\u201a\u00c5\u201a\u00a0' +
          '\u201a\u00e9\u0081B\u02c6\u00b3\u008fk\u0192A\u0192\u2039\u0192S' +
          '\u0192\u0160\u0192Y\u0192\u20ac\u201a\u00c6\u201a\u00b5\u201a' +
          '\u00c4Deflate\u201a\u00f0\u008d\u00cc\u2014p\u201a\u00b5\u201a' +
          '\u00c4\u201a\u00a2\u201a\u00e9\u0081A\u02c6\u00b3\u008fk\u201a' +
          '\u00c9\u201a\u00e6\u201a\u00e9\u2030\u00e6\u017d\u00bf\u201a\u00cc' +
          '\u2014\u00f2\u2030\u00bb\u201a\u00cc\u201a\u00c8\u201a\u00a2\u2030' +
          '\u00c2\u2039t\u02c6\u00b3\u008fk\u201a\u00cc\u2030\u00e6\u2018' +
          '\u0153\u0192t\u0192@\u0192C\u0192\u2039\u0192t\u0192H\u0081[\u0192' +
          '}\u0192b\u0192g\u201a\u00c5\u201a\u00a0\u201a\u00e9\u0081B\r\n');
        // ... but not image/png
        assert.ok(!tree.get('2').headers.get('Content-Type').has('charset'));
        assert.equal(tree.get('2').headers.charset, 'ISO-8859-1');
        assert.equal(tree.get('2').headers.get('Content-Description'),
          '\u0192P\u0192c\u0192@\u0192\u2039\u0192R\u0192A\u0192g\u0192\u2039');
        assert.equal(tree.get('2').headers.getRawHeader('Content-Description'),
          '\x83\x50\x83\x63\x83\x40\x83\x8b\x83\x52\x83\x41\x83\x67\x83\x8b');
        var imageData = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAABECAIAAADGJao+AAAAwklE' +
          'QVR4Xu3UgQbDMBRA0bc03f//b7N0VuqJEmwoc+KqNEkDh9b+2HuJu1KNO4f+AQCAAA' +
          'AQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAAANReamRLlPWYfNH0' +
          'klxcPs+cP3NxWF+vi3lb7pa2R+vx6tHOtuN1O+a5lY3HzgM5ya/GM5N7ZjfPq7/5yS' +
          '8IgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAIw322gDIPvt' +
          'lmUAAAAASUVORK5CYII=';
        imageData = atob(imageData);
        var asArray = new Uint8Array(imageData.length);
        for (var i = 0; i < asArray.length; i++)
          asArray[i] = imageData.charCodeAt(i);
        assert.deepEqual(tree.get('2').body, asArray);

        // Touching the header charset should change the interpretation.
        tree.get('1').headers.charset = 'Shift-JIS';
        assert.equal(tree.get('1').headers.charset, 'Shift-JIS');
        assert.equal(tree.get('1').headers.get('Content-Description'),
          '\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb');
      });
    });
    test('Charset conversion', function () {
      return buildTree(read_file('charsets'), {
        strformat: "unicode",
        bodyformat: "decode"
      }).then(function (tree) {
        var numParts = 12;
        for (var i = 1; i < numParts; i+= 2) {
          assert.equal(tree.get("" + i).body, tree.get("" + (i + 1)).body);
        }
        assert.ok(!tree.has("" + (numParts + 1)));
      });
    });
  });
});

});
