/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

do_get_profile();

function makeConfiguredIdentity(email, fullName) {
  const identity = MailServices.accounts.createIdentity();
  identity.email = email;
  identity.fullName = fullName;

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(identity);

  registerCleanupFunction(() => {
    MailServices.accounts.removeIncomingServer(account.incomingServer, false);
    MailServices.accounts.removeAccount(account);
  });

  return { identity, account };
}

function makeCalendar({
  identityKey = undefined,
  userAddresses = [],
  aclIdentity = null,
  hasAccessControl = false,
} = {}) {
  const calendar = Cc["@mozilla.org/calendar/calendar;1?type=caldav"].createInstance(
    Ci.calICalendar
  );
  calendar.id = "test-caldav-" + Math.random().toString(16).slice(2);
  calendar.uri = Services.io.newURI("http://example.com/caldav");

  if (identityKey !== undefined) {
    calendar.setProperty("imip.identity.key", identityKey);
  }

  const wrapped = calendar.wrappedJSObject;
  wrapped.mCalendarUserAddresses = userAddresses.slice();
  wrapped.mACLEntry = {
    hasAccessControl,
    getOwnerIdentities() {
      return aclIdentity ? [aclIdentity] : [];
    },
  };

  wrapped.fillACLProperties();
  return calendar;
}

add_task(async function test_configured_identity_overrides_no_user_addresses() {
  const { identity: configured } = makeConfiguredIdentity(
    "configured@example.com",
    "Configured User"
  );
  const calendar = makeCalendar({
    identityKey: configured.key,
    userAddresses: [],
    aclIdentity: { email: "owner@example.com", fullName: "Owner", key: "ownerKey" },
    hasAccessControl: false,
  });

  const props = calendar.wrappedJSObject.mACLProperties;
  Assert.equal(props.organizerId, "mailto:configured@example.com");
  Assert.equal(props.organizerCN, "Configured User");
  Assert.equal(props["imip.identity"].key, configured.key);
});

add_task(async function test_configured_identity_overrides_user_addresses() {
  const { identity: configured } = makeConfiguredIdentity(
    "configured2@example.com",
    "Configured Two"
  );
  const calendar = makeCalendar({
    identityKey: configured.key,
    userAddresses: ["mailto:user-address@example.com"],
    aclIdentity: { email: "owner2@example.com", fullName: "Owner2", key: "ownerKey2" },
    hasAccessControl: false,
  });

  const props = calendar.wrappedJSObject.mACLProperties;
  Assert.equal(props.organizerId, "mailto:configured2@example.com");
  Assert.equal(props.organizerCN, "Configured Two");
  Assert.equal(props["imip.identity"].key, configured.key);
});

add_task(async function test_none_uses_user_address() {
  const calendar = makeCalendar({
    identityKey: "",
    userAddresses: ["mailto:user-address@example.com"],
    aclIdentity: { email: "owner3@example.com", fullName: "Owner3", key: "ownerKey3" },
    hasAccessControl: false,
  });

  const props = calendar.wrappedJSObject.mACLProperties;
  Assert.equal(props.organizerId, "mailto:user-address@example.com");
});

/**
 * organizerId keeps the case the user configured for the identity. Consumers
 * are responsible for comparing it case insensitively. See bug 1889607.
 */
add_task(async function test_configured_identity_keeps_case() {
  const { identity: configured } = makeConfiguredIdentity("Elton.JOHN@Example.COM", "Elton John");
  const calendar = makeCalendar({
    identityKey: configured.key,
    userAddresses: [],
    hasAccessControl: false,
  });

  Assert.equal(
    calendar.wrappedJSObject.mACLProperties.organizerId,
    "mailto:Elton.JOHN@Example.COM",
    "organizerId should keep the identity's case"
  );
  Assert.equal(
    calendar.getProperty("organizerId"),
    "mailto:Elton.JOHN@Example.COM",
    "the calendar should report organizerId with the identity's case"
  );
});

add_task(async function test_acl_owner_identity_gets_mailto_prefix() {
  const calendar = makeCalendar({
    identityKey: "",
    userAddresses: [],
    aclIdentity: { email: "Owner.ACL@Example.COM", fullName: "ACL Owner", key: "aclOwnerKey" },
    hasAccessControl: true,
  });

  Assert.equal(
    calendar.wrappedJSObject.mACLProperties.organizerId,
    "mailto:Owner.ACL@Example.COM",
    "the ACL owner's organizerId should be prefixed with mailto:"
  );
});

add_task(async function test_no_configured_no_user_address_uses_default_identity() {
  const calendar = makeCalendar({
    identityKey: undefined,
    userAddresses: [],
    aclIdentity: { email: "owner4@example.com", fullName: "Owner4", key: "ownerKey4" },
    hasAccessControl: false,
  });

  const props = calendar.wrappedJSObject.mACLProperties;
  Assert.ok(props.organizerId?.startsWith("mailto:"), "organizerId is set");
  Assert.ok(props["imip.identity"], "imip.identity should be set");
});
