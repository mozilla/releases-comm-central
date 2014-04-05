"use strict";
define(function (require) {

var assert = require('assert');
var jsmime = require('jsmime');

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

function testHeader(header, tests) {
  suite(header, function () {
    tests.forEach(function (data) {
      arrayTest(data, function () {
        array.deepEqual(headerparser.parseStructuredHeader(header,
          data[0]), data[1]);
      });
    });
  });
}

function makeCT(media, sub, params) {
  var object = new Map();
  object.mediatype = media;
  object.subtype = sub;
  object.type = media + "/" + sub;
  for (let k in params)
    object.set(k, params[k]);
  return object;
}
suite('Custom decoder support', function () {
  function customDecoder(values) {
    let value = values.join('');
    return atob(value);
  }
  function customEncoder(value) {
    this.addText(btoa(value), true);
  }
  test('addStructuredEncoder', function () {
    assert.equal('X-Base64: String\r\n',
      jsmime.headeremitter.emitStructuredHeader('X-Base64', 'String', {}));
    jsmime.headeremitter.addStructuredEncoder('X-Base64', customEncoder);
    assert.equal('X-Base64: U3RyaW5n\r\n',
      jsmime.headeremitter.emitStructuredHeader('X-Base64', 'String', {}));
    assert.equal('X-Base64: U3RyaW5n\r\n',
      jsmime.headeremitter.emitStructuredHeader('x-bASe64', 'String', {}));
  });
  test('addStructuredDecoder', function () {
    assert.throws(function () {
      jsmime.headerparser.parseStructuredHeader('X-Base64', 'U3RyaW5n');
    });
    jsmime.headerparser.addStructuredDecoder('X-Base64', customDecoder);
    assert.equal('String',
      jsmime.headerparser.parseStructuredHeader('X-Base64', 'U3RyaW5n'));
    assert.throws(function () {
      jsmime.headerparser.addStructuredDecoder('To', customDecoder);
    });
  });
});

});

