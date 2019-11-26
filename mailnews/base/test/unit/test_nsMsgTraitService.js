/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var ts = Cc["@mozilla.org/msg-trait-service;1"].getService(
  Ci.nsIMsgTraitService
);

// junk-related traits set by default
var kJunkId = "mailnews@mozilla.org#junk";
var kGoodId = "mailnews@mozilla.org#good";
var kGoodIndex = Ci.nsIJunkMailPlugin.GOOD_TRAIT;
var kJunkIndex = Ci.nsIJunkMailPlugin.JUNK_TRAIT;

// a dummy set of traits
var proId = "TheProTrait";
var proName = "ProName";
var antiId = "TheAntiTrait";

function run_test() {
  // Check lastIndex prior to adding, 3 - 1000 are reserved for mailnews
  Assert.equal(ts.lastIndex, 1000);

  // basic junk as traits should be setup automatically
  Assert.equal(
    kGoodId,
    Services.prefs.getCharPref("mailnews.traits.id." + kGoodIndex)
  );
  Assert.equal(
    kJunkId,
    Services.prefs.getCharPref("mailnews.traits.id." + kJunkIndex)
  );
  Assert.equal(
    kGoodId,
    Services.prefs.getCharPref("mailnews.traits.antiId." + kJunkIndex)
  );
  Assert.ok(
    Services.prefs.getBoolPref("mailnews.traits.enabled." + kJunkIndex)
  );

  // add the pro and anti test traits
  Assert.ok(!ts.isRegistered(proId));
  var proIndex = ts.registerTrait(proId);
  Assert.ok(ts.isRegistered(proId));
  Assert.equal(proIndex, 1001);
  Assert.equal(proIndex, ts.getIndex(proId));
  Assert.equal(proId, ts.getId(proIndex));
  var antiIndex = ts.registerTrait(antiId);
  Assert.equal(proIndex, 1001);
  Assert.equal(antiIndex, 1002);

  // check setting and getting things through the service
  ts.setName(proId, proName);
  Assert.equal(proName, ts.getName(proId));
  Assert.ok(!ts.getEnabled(proId));
  ts.setEnabled(proId, true);
  Assert.ok(ts.getEnabled(proId));
  ts.setAntiId(proId, antiId);
  Assert.equal(antiId, ts.getAntiId(proId));
  let proArray = ts.getEnabledProIndices();
  let antiArray = ts.getEnabledAntiIndices();
  Assert.equal(proArray.length, 2);
  Assert.equal(antiArray.length, 2);
  Assert.equal(proArray[1], proIndex);
  Assert.equal(antiArray[1], antiIndex);

  // check of aliases
  // add three random aliases
  ts.addAlias(1, 501);
  ts.addAlias(1, 502);
  ts.addAlias(1, 601);
  let aliases = ts.getAliases(1);
  Assert.equal(aliases[0], 501);
  Assert.equal(aliases[1], 502);
  Assert.equal(aliases[2], 601);

  // remove the middle one
  ts.removeAlias(1, 502);
  aliases = ts.getAliases(1);
  Assert.equal(aliases.length, 2);
  Assert.equal(aliases[0], 501);
  Assert.equal(aliases[1], 601);

  // try to add an existing value
  ts.addAlias(1, 501);
  aliases = ts.getAliases(1);
  Assert.equal(aliases.length, 2);
  Assert.equal(aliases[0], 501);
  Assert.equal(aliases[1], 601);

  // now let's make sure this got saved in preferences
  Assert.equal(
    proId,
    Services.prefs.getCharPref("mailnews.traits.id." + proIndex)
  );
  Assert.equal(
    proName,
    Services.prefs.getCharPref("mailnews.traits.name." + proIndex)
  );
  Assert.ok(Services.prefs.getBoolPref("mailnews.traits.enabled." + proIndex));
  Assert.equal(
    antiId,
    Services.prefs.getCharPref("mailnews.traits.antiId." + proIndex)
  );

  // remove the pro trait
  ts.unRegisterTrait(proId);
  Assert.ok(!ts.isRegistered(proId));

  // check that this is also removed from prefs. The get calls should fail
  try {
    Services.prefs.getCharPref("mailnews.traits.id." + proIndex);
    Assert.ok(false);
  } catch (e) {}

  try {
    Services.prefs.getCharPref("mailnews.traits.name." + proIndex);
    Assert.ok(false);
  } catch (e) {}

  try {
    Services.prefs.getBoolPref("mailnews.traits.enabled." + proIndex);
    Assert.ok(false);
  } catch (e) {}

  try {
    Services.prefs.getCharPref("mailnews.traits.antiId." + proIndex);
    Assert.ok(false);
  } catch (e) {}
}
