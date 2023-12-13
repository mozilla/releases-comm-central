# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

openpgp-key-unverified = Accepted (unverified)
openpgp-key-undecided = Not accepted (undecided)

# Variables:
# $kid (String) - Public key id to import.
openpgp-pubkey-import-id = ID: { $kid }
# Variables:
# $fpr (String) - Fingerprint of the public key to import.
openpgp-pubkey-import-fpr = Fingerprint: { $fpr }

# Variables:
# $num (Number) - Number of public keys contained in the key file.
openpgp-pubkey-import-intro =
    { $num ->
      [one] The file contains one public key as shown below:
      *[other] The file contains {$num} public keys as shown below:
    }

# Variables:
# $num (Number) - Number of keys to accept.
openpgp-pubkey-import-accept =
    { $num ->
      [one] Do you accept this key for verifying digital signatures and for encrypting messages, for all shown email addresses?
      *[other] Do you accept these keys for verifying digital signatures and for encrypting messages, for all shown email addresses?
    }

pubkey-import-button =
    .buttonlabelaccept = Import
    .buttonaccesskeyaccept = I
