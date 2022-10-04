/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { ircProtocol } = ChromeUtils.importESModule(
  "resource:///modules/irc.sys.mjs"
);

add_task(function test_splitUsername() {
  const bareUsername = "foobar";
  const bareSplit = ircProtocol.prototype.splitUsername(bareUsername);
  deepEqual(bareSplit, []);

  const fullAccountName = "foobar@example.com";
  const fullSplit = ircProtocol.prototype.splitUsername(fullAccountName);
  deepEqual(fullSplit, ["foobar", "example.com"]);

  const extraAt = "foo@bar@example.com";
  const extraSplit = ircProtocol.prototype.splitUsername(extraAt);
  deepEqual(extraSplit, ["foo@bar", "example.com"]);
});
