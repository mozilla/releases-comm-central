# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

close-shortcut =
    .key = w

# Variables:
#   $title (String): the title of the popup window
extension-popup-title = { PLATFORM() ->
    [macos] { $title }
    *[other] { $title } - { -brand-full-name }
}
extension-popup-default-title = { -brand-full-name }
