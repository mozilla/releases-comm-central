# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
cert-error-domain-mismatch = The certificate for { $hostname } is not valid for that server. Someone could be trying to impersonate the server and you should not continue.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
#   $not-after (string) - Certificate is not valid after this time.
cert-error-expired = The certificate for { $hostname } expired on { $not-after }.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
#   $not-before (string) - Certificate is not valid before this time.
cert-error-not-yet-valid = The certificate for { $hostname } will not be valid until { $not-before }.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
cert-error-untrusted-default = The certificate for { $hostname } does not come from a trusted source.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
cert-error-inline-domain-mismatch =
    .title = Connection error. The certificate for { $hostname } is not valid for that server. Someone could be trying to impersonate the server and you should not continue. Click to open server security settings.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
#   $not-after (string) - Certificate is not valid after this time.
cert-error-inline-expired =
    .title = Connection error. The certificate for { $hostname } expired on { $not-after }. Click to open server security settings.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
#   $not-before (string) - Certificate is not valid before this time.
cert-error-inline-not-yet-valid =
    .title = Connection error. The certificate for { $hostname } will not be valid until { $not-before }. Click to open server security settings.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of the server with certificate error.
cert-error-inline-untrusted-default =
    .title = Connection error. The certificate for { $hostname } does not come from a trusted source. Click to open server security settings.

certificate-check-fetch-button = Fetch Certificate
certificate-check-view-button = View Certificate
certificate-check-add-exception-button = Add Exception
certificate-check-remove-exception-button = Remove Exception

# Variables:
#   $hostname (string) - Hostname (and possibly port) of a server.
certificate-check-fetching = Fetching the certificate for { $hostname }.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of a server.
certificate-check-success = The certificate for { $hostname } appears to be valid.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of a server.
certificate-check-failure = Failed to fetch the certificate for { $hostname }.

certificate-check-exception-added = Certificate exception added.

certificate-check-exception-removed = Certificate exception removed.

# Variables:
#   $hostname (string) - Hostname (and possibly port) of a server.
certificate-check-exception-exists = A certificate exception for { $hostname } exists.
