# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

openpgp-change-expiry-title = Change Key Expiration

# Variables:
# $date (String) - Date the key is expiring on.
info-will-expire = This key is currently configured to expire on { $date }.
info-already-expired = This key has already expired.
info-does-not-expire = This key is currently configured to never expire.

info-explanation-1 = <b>After a key expires</b>, it’s no longer possible to use it for encryption or digital signing.

# Do not translate: OpenPGP
info-explanation-1-complex = This OpenPGP key consists of a primary key and at least one subkey <b>with different expiration dates</b>.

select-key-prompt = Key to change:
info-explanation-2 = To use this key for a longer period of time, change its expiration date, and then share the public key with your conversation partners again.

usage-label = Usage:
algorithm-label = Algorithm:
created-label = Created:

expire-no-change-label = Do not change the expiry date
expire-in-time-label = Key will expire in:
expire-never-expire-label = Key will never expire

partial-label-expired = expired
partial-label-never-expires = never expires

# Variables:
# $date (String) - Date the key is expiring on.
partial-label-expires = expires: { $date }
