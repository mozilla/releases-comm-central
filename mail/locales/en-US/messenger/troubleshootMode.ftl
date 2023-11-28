# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

troubleshoot-mode-dialog-title = { -brand-short-name } Troubleshoot Mode

troubleshoot-mode-description = Use { -brand-short-name } troubleshoot mode to diagnose issues. Your add-ons and customizations will be temporarily disabled.

troubleshoot-mode-description2 = You can make some or all of these changes permanent:

troubleshoot-mode-disable-addons =
    .label = Disable all add-ons
    .accesskey = D

troubleshoot-mode-reset-toolbars =
    .label = Reset toolbars and controls
    .accesskey = R

troubleshoot-mode-change-and-restart =
    .label = Make Changes and Restart
    .accesskey = M

troubleshoot-mode-continue =
    .label = Continue in Troubleshoot Mode
    .accesskey = C

troubleshoot-mode-quit =
    .label =
        { PLATFORM() ->
            [windows] Exit
           *[other] Quit
        }
    .accesskey =
        { PLATFORM() ->
            [windows] x
           *[other] Q
        }
