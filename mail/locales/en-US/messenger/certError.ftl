# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#   $hostname (string) - Hostname of the server with certificate error.
cert-error-domain-mismatch = The certificate for { $hostname } is not valid for that server. Someone could be trying to impersonate the server and you should not continue.

# Variables:
#   $hostname (string) - Hostname of the server with certificate error.
#   $not-after (Date) - Certificate is not valid after this time.
cert-error-expired = The certificate for { $hostname } expired on { $not-after }.

# Variables:
#   $hostname (string) - Hostname of the server with certificate error.
#   $not-before (Date) - Certificate is not valid before this time.
cert-error-not-yet-valid = The certificate for { $hostname } will not be valid until { $not-before }.

# Variables:
#   $hostname (string) - Hostname of the server with certificate error.
cert-error-untrusted-default = The certificate for { $hostname } does not come from a trusted source.
