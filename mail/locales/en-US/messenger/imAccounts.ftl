# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Used when multiple incoming messages from the same sender are bundled
# into a single notification.
# Variables:
#   $count - the number of accounts that are suspected to have caused a crash
notification-single-crash-label = {
    $count ->
        [one] A previous run exited unexpectedly while connecting a new or edited account. It has not been connected so that you can Edit its Settings.
        *[other] A previous run exited unexpectedly while connecting { $count } new or edited accounts. They have not been connected so that you can Edit their Settings.
    }
