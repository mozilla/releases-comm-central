var elementslib = {}; ChromeUtils.import("chrome://mozmill/content/modules/elementslib.js", elementslib);
var mozmill = {}; ChromeUtils.import("chrome://mozmill/content/modules/mozmill.js", mozmill);

var setupModule = function(module) {
  var _w = mozmill.wm.getMostRecentWindow("mail:3pane");
  module.messenger = new mozmill.controller.MozMillController(_w);
}

var test_foo = function(){
 messenger.type(new elementslib.ID(_w.document, 'searchInput'), "test");
 messenger.sleep(5000);
}
