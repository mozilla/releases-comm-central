// Custom header support for testing structured_headers.js

jsmime.headerparser.addStructuredDecoder("X-Unusual", function (hdrs) {
  return Number.parseInt(hdrs[hdrs.length - 1], 16);
});

jsmime.headeremitter.addStructuredEncoder("X-Unusual", function (val) {
  this.addUnstructured(val.toString(16));
});
