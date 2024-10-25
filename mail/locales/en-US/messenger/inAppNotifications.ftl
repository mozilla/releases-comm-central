# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

in-app-notification-close-image =
  .alt = Close

# This is the label of the key typically used to generate the javascript
# key code "KeyJ"
-in-app-notification-accesskey = j

in-app-notification-instructions = {
  PLATFORM() ->
  [macos] Press ⌥+Shift+{ -in-app-notification-accesskey } to jump to notification
  *[other] Press Alt+Shift+{ -in-app-notification-accesskey } to jump to notification
}
