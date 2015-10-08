/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/imServices.jsm");
var irc = {};
Services.scriptloader.loadSubScript("resource:///components/irc.js", irc);

function FakeAccount() {
  this._commandBuffers = new Map();
  this.callbacks = [];
}
FakeAccount.prototype = {
  __proto__: irc.ircAccount.prototype,
  maxMessageLength: 60,
  callbacks: [],
  sendMessage: function(aCommand, aParams) {
    (this.callbacks.shift())(aCommand, aParams);
  }
}

var account = new FakeAccount();

function run_test() {
  test_parameterCollect();
  test_maxLength();
  run_next_test();
}

function test_parameterCollect() {
  // Individual tests, data consisting of [channel, key] pairs.
  let tests = [
    {
      data: [["one"], ["one"]],  // also tests deduplication
      result: "JOIN one"
    },
    {
      data: [["one", ""]],  // explicit empty password string
      result: "JOIN one"
    },
    {
      data: [["one"], ["two"], ["three"]],
      result: "JOIN one,two,three"
    },
    {
      data: [["one"], ["two", "password"], ["three"]],
      result: "JOIN two,one,three password"
    },
    {
      data: [["one"], ["two", "password"], ["three"],
             ["four", "anotherpassword"]],
      result: "JOIN two,four,one,three password,anotherpassword"
    }
  ];

  for (let test of tests) {
    let timeout;
    // Destructure test to local variables so each function
    // generated here gets the correct value in its scope.
    let {data, result} = test;
    account.callbacks.push((aCommand, aParams) => {
      let msg = account.buildMessage(aCommand, aParams);
      equal(msg, result, "Test buffering of parameters");
      clearTimeout(timeout);
      account._lastCommandSendTime = 0;
      run_next_test();
    });
    add_test(() => {
      // This timeout lets the test fail more quickly if
      // some of the callbacks we added don't get called.
      // Not strictly speaking necessary.
      timeout = setTimeout(() => {
        ok(false, "test_parameterCollect failed after timeout.");
        run_next_test();
      }, 2000);
      for (let [channel, key] of data)
        account.sendBufferedCommand("JOIN", channel, key);
    });
  }

  // Test this still works when adding commands on different ticks of
  // the event loop.
  account._lastCommandSendTime = 0;
  for (let test of tests) {
    let timeout;
    let {data, result} = test;
    account.callbacks.push((aCommand, aParams) => {
      let msg = account.buildMessage(aCommand, aParams);
      equal(msg, result, "Test buffering with setTimeout");
      clearTimeout(timeout);
      run_next_test();
    });
    add_test(() => {
      // This timeout lets the test fail more quickly if
      // some of the callbacks we added don't get called.
      // Not strictly speaking necessary.
      timeout = setTimeout(() => {
        ok(false, "test_parameterCollect failed after timeout.");
        run_next_test();
      }, 2000);
      let delay = 0;
      for (let params of data) {
        let [channel, key] = params;
        delay += 200;
        setTimeout(() => {
          account.sendBufferedCommand("JOIN", channel, key);
        }, delay);
      }
    });
  }
}

function test_maxLength() {
  let tests = [
    {
      data: [["applecustard"], ["pearpie"], ["strawberryfield"],
        ["blueberrypancake"], ["mangojuice"], ["raspberryberet"],
        ["pineapplesoup"], ["limejelly"], ["lemonsorbet"]],
      results: [
        "JOIN applecustard,pearpie,strawberryfield,blueberrypancake",
        "JOIN mangojuice,raspberryberet,pineapplesoup,limejelly",
        "JOIN lemonsorbet"
      ]
    },
    {
      data: [["applecustard"], ["pearpie"], ["strawberryfield", "password1"],
        ["blueberrypancake"], ["mangojuice"], ["raspberryberet"],
        ["pineapplesoup"], ["limejelly", "password2"], ["lemonsorbet"]],
      results: [
        "JOIN strawberryfield,applecustard,pearpie password1",
        "JOIN blueberrypancake,mangojuice,raspberryberet",
        "JOIN limejelly,pineapplesoup,lemonsorbet password2"
      ]
    }
  ];

  account._lastCommandSendTime = 0;
  for (let test of tests) {
    let timeout;
    // Destructure test to local variables so each function
    // generated here gets the correct value in its scope.
    let {data, results} = test;
    for (let r of results) {
      let result = r;
      account.callbacks.push((aCommand, aParams) => {
        let msg = account.buildMessage(aCommand, aParams);
        equal(msg, result, "Test maximum message length constraint");
        // After all results are checked, run the next test.
        if (result == results[results.length - 1]) {
          clearTimeout(timeout);
          run_next_test();
        }
      });
    }
    add_test(() => {
      // This timeout lets the test fail more quickly if
      // some of the callbacks we added don't get called.
      // Not strictly speaking necessary.
      timeout = setTimeout(() => {
        ok(false, "test_maxLength failed after timeout.");
        run_next_test();
      }, 2000);
      for (let [channel, key] of data)
        account.sendBufferedCommand("JOIN", channel, key);
    });
  }
}
