var jum = {}; ChromeUtils.import("chrome://mozmill/content/modules/jum.js", jum);

var testPythonCallPost = function() {
  var status = "post";
  mozmill.firePythonCallbackAfterRestart("postCallback", status);
}
