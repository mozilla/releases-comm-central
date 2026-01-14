# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Account Creation
### This file has the strings, mostly error strings, for the logic / JS backend / model

## Sanitizer.sys.mjs

hostname-syntax-error = Hostname is empty or contains forbidden characters. Only letters, numbers, - and . are allowed.

alphanumdash-error = String contains unsupported characters. Only letters, numbers, - and _ are allowed.

allowed-value-error = Supplied value not in allowed list

url-scheme-error = URL scheme not allowed

url-parsing-error = URL not recognized

string-empty-error = You must supply a value for this string

boolean-error = Not a boolean

no-number-error = Not a number

number-too-large-error = Number too large

number-too-small-error = Number too small

emailaddress-syntax-error = Not a valid e-mail address

## FetchHTTP.sys.mjs

cannot-contact-server-error = Cannot contact server

bad-response-content-error = Bad response content

## readFromXML.sys.mjs

no-email-provider-error = The config file XML does not contain an email account configuration.

outgoing-not-smtp-error = The outgoing server must be of type SMTP

## ConfigVerifier.sys.mjs

cannot-login-error = Unable to log in at server. Probably wrong configuration, username or password.

## GuessConfig.sys.mjs

cannot-find-server-error = Can’t find a server

## ExhcangeAutoDiscover.sys.mjs

no-autodiscover-error = The Exchange AutoDiscover XML is invalid.
