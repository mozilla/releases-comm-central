# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

otr-generate-key =
    .title = Generating private key
    .buttonlabelaccept = Done

# Variables:
#   $name (String) - the name of the user's own chat account
#   $protocol (String) - the chat communication protocol used by that account
otr-genkey-account = Generating private key for { $name }({ $protocol }) …

# Variables:
#   $error (String) - contains an error message that describes the cause of the failure
otr-genkey-failed = Generating key failed: { $error }
