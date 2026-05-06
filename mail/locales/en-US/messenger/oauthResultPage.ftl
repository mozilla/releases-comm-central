# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### These strings are formatted and used in a generated HTML page, shown in the user's default browser. Because of that, they have to use slightly unconventional formatting. It also means instead of strings having attributes, each attribute is its own entry.

## Always included in the page

oauth-result-wordmark-alt = { -brand-full-name }

oauth-result-footer-text = Need help? Contact support.

## Successful authentication

oauth-success-title = You’re all set

oauth-success-subtitle = Your account has been securely connected to { -brand-short-name }.

oauth-success-body = You can close this window.

## Authentication error

oauth-error-title = Sign-in couldn’t be completed

oauth-error-subtitle = { -brand-short-name } wasn’t able to finish signing in with these settings.

# New lines in the string will be converted into new lines in the output.
# $linkStart (String) - Link prefix. Has to always be before $linkEnd. Has no visible content.
# $linkEnd (String) - Link suffix. Has to always be after $linkStart. Has no visible content.
oauth-error-body =
    Go back to { -brand-short-name }, review your account configuration settings, and try again.

    If the problem continues, see { $linkStart }Troubleshoot account sign-in{ $linkEnd } for help.
