/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function acObserver() {}

acObserver.prototype = {
  _search: null,
  _result: null,

  onSearchResult(aSearch, aResult) {
    this._search = aSearch;
    this._result = aResult;
  },
};

function run_test() {
  setupLocalServer(119);

  // create identity
  const identity = MailServices.accounts.createIdentity();
  _account.addIdentity(identity);

  const acs = Cc["@mozilla.org/autocomplete/search;1?name=news"].getService(
    Ci.nsIAutoCompleteSearch
  );
  let obs;

  const paramsN = JSON.stringify({
    idKey: identity.key,
    accountKey: _account.key,
    type: "addr_newsgroups",
  });
  const paramsF = JSON.stringify({
    idKey: identity.key,
    accountKey: _account.key,
    type: "addr_followup",
  });
  const paramsMail = JSON.stringify({
    idKey: identity.key,
    accountKey: _account.key,
    type: "addr_to",
  });

  // misc.test is not subscribed
  obs = new acObserver();
  acs.startSearch("misc", paramsN, null, obs);
  Assert.ok(obs._result == null || obs._result.matchCount == 0);

  obs = new acObserver();
  acs.startSearch("misc", paramsF, null, obs);
  Assert.ok(obs._result == null || obs._result.matchCount == 0);

  obs = new acObserver();
  acs.startSearch("misc", paramsMail, null, obs);
  Assert.ok(obs._result == null || obs._result.matchCount == 0);

  // test.filter is subscribed
  obs = new acObserver();
  acs.startSearch("filter", paramsN, null, obs);
  Assert.equal(obs._result.matchCount, 1);

  obs = new acObserver();
  acs.startSearch("filter", paramsF, null, obs);
  Assert.equal(obs._result.matchCount, 1);

  // ... but no auto-complete should occur for addr_to
  obs = new acObserver();
  acs.startSearch("filter", paramsMail, null, obs);
  Assert.ok(obs._result == null || obs._result.matchCount == 0);

  // test.subscribe.empty and test.subscribe.simple are subscribed
  obs = new acObserver();
  acs.startSearch("subscribe", paramsN, null, obs);
  Assert.equal(obs._result.matchCount, 2);

  obs = new acObserver();
  acs.startSearch("subscribe", paramsF, null, obs);
  Assert.equal(obs._result.matchCount, 2);

  // ... but no auto-complete should occur for addr_to
  obs = new acObserver();
  acs.startSearch("subscribe", paramsMail, null, obs);
  Assert.ok(obs._result == null || obs._result.matchCount == 0);

  // test.subscribe.empty is subscribed, test.empty is not
  obs = new acObserver();
  acs.startSearch("empty", paramsN, null, obs);
  Assert.equal(obs._result.matchCount, 1);

  obs = new acObserver();
  acs.startSearch("empty", paramsF, null, obs);
  Assert.equal(obs._result.matchCount, 1);

  const thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}
