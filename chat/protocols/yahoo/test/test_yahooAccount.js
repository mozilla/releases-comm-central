/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource:///modules/Services.jsm");
let yahoo = {};
Services.scriptloader.loadSubScript("resource:///components/yahoo.js", yahoo);

function run_test()
{
  add_test(test_cleanUsername);
  run_next_test();
}

// Test the stripping of @yahoo.* domains from usernames.
function test_cleanUsername()
{
  // These are just a few of the many possible domains.
  let domains = ["yahoo.com.ar", "yahoo.com.au", "yahoo.com", "yahoo.co.jp",
                 "yahoo.it", "yahoo.cn", "yahoo.co.in"];
  let userId = "user";

  // We must provide a mimimal fake implementation of a protocol object, to keep
  // the YahooAccount constructor happy.
  let fakeProtocol = {
    id: "fake-proto",
    options: {
      local_charset: "UTF-8"
    },
    _getOptionDefault: function(aOption) this.options[aOption]
  };
  let fakeImAccount = {};

  for each(let domain in domains) {
    fakeImAccount.name = userId + "@" + domain;
    let yahooAccount = new yahoo.YahooAccount(fakeProtocol, fakeImAccount);
    do_check_eq(userId, yahooAccount.cleanUsername);
  }
  run_next_test();
}
