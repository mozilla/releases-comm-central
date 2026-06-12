# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

smime-test-cert-button =
    .label = Test

configured-cert-not-found = The certificate cannot be found.
configured-cert-ok-enc = The certificate passed the test and can be used for email encryption.
configured-cert-ok-sig = The certificate passed the test and can be used for email signing.

# $errorMsg A sentence that explains the error.
# $errorCodeStr A human readable error code, e.g. SEC_ERROR_UNKNOWN_ISSUER
configured-cert-failure-detail = The certificate verification failed with the following error: { $errorMsg } (Error Code: { $errorCodeStr })

# $errorCode A numeric error code
configured-cert-failure = The certificate verification failed with error code { $errorCode }

# $errorMsg A sentence that explains the error.
# $errorCodeStr A human readable error code, e.g. SEC_ERROR_UNKNOWN_ISSUER
# Note the initial empty line is necessary to preserve the line breaks.
configured-cert-failure-use-anyway-detail-v2 =

  There is a problem with this certificate.

  Certificate verification failed with the following error: { $errorMsg } (Error Code: { $errorCodeStr })

  Would you like to use this certificate anyway?


# $errorCode A numeric error code
# Note the initial empty line is necessary to preserve the line breaks.
configured-cert-failure-use-anyway-v2 =

  There is a problem with this certificate.

  Certificate verification failed with error code { $errorCode }.

  Would you like to use this certificate anyway?
