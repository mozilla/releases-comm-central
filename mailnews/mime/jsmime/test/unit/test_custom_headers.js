"use strict";
define(function (require) {
  var assert = require("assert");
  var jsmime = require("jsmime");

  suite("Custom decoder support", function () {
    function customDecoder(values) {
      const value = values.join("");
      return atob(value);
    }
    function customEncoder(value) {
      this.addText(btoa(value), true);
    }
    test("addStructuredEncoder", function () {
      assert.equal(
        "X-Base64: String\r\n",
        jsmime.headeremitter.emitStructuredHeader("X-Base64", "String", {})
      );
      jsmime.headeremitter.addStructuredEncoder("X-Base64", customEncoder);
      assert.equal(
        "X-Base64: U3RyaW5n\r\n",
        jsmime.headeremitter.emitStructuredHeader("X-Base64", "String", {})
      );
      assert.equal(
        "X-Base64: U3RyaW5n\r\n",
        jsmime.headeremitter.emitStructuredHeader("x-bASe64", "String", {})
      );
    });
    test("addStructuredDecoder", function () {
      assert.throws(function () {
        jsmime.headerparser.parseStructuredHeader("X-Base64", "U3RyaW5n");
      }, /Unknown structured header/);
      jsmime.headerparser.addStructuredDecoder("X-Base64", customDecoder);
      assert.equal(
        "String",
        jsmime.headerparser.parseStructuredHeader("X-Base64", "U3RyaW5n")
      );
      assert.throws(function () {
        jsmime.headerparser.addStructuredDecoder("To", customDecoder);
      }, /Cannot override header/);
    });
  });
});
