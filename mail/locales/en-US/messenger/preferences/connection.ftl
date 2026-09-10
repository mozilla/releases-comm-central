# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

connection-dialog-title = Connection settings

disable-extension-button = Disable Extension

# Variables:
#   $name (String) - The extension that is controlling the proxy settings.
#
# The extension-icon is the extension's icon, or a fallback image. It should be
# purely decoration for the actual extension name, with alt="".
proxy-settings-controlled-by-extension = An extension, <img data-l10n-name="extension-icon" alt="" /> { $name }, is controlling how { -brand-short-name } connects to the Internet.

connection-internet-proxy-legend = Internet connection & proxy

proxy-type-no =
    .label = No proxy
    .accesskey = y

proxy-autodetect-network =
    .label = Automatically detect network proxy
    .accesskey = w

proxy-type-system =
    .label = Use system proxy settings
    .accesskey = u

proxy-manual-setup =
    .label = Manual proxy setup:
    .accesskey = m

proxy-http-label =
    .value = HTTP Proxy:
    .accesskey = h

http-port-label =
    .value = Port:
    .accesskey = p

proxy-https-sharing =
    .label = Use this proxy for secure web addresses (HTTPS)
    .accesskey = x

proxy-https-label =
    .value = HTTPS Proxy:
    .accesskey = S

ssl-port-label =
    .value = Port:
    .accesskey = o

proxy-socks-label =
    .value = SOCKS Host:
    .accesskey = c

socks-port-label =
    .value = Port:
    .accesskey = t

proxy-socks4-label =
    .label = SOCKS v4
    .accesskey = k

proxy-socks5-label =
    .label = SOCKS v5
    .accesskey = v

proxy-auto-script-url =
    .label = Automatic setup script URL:
    .accesskey = A

proxy-reload-label =
    .label = Reload
    .accesskey = l

no-proxy-addresses-label =
    .value = Do not use a proxy for these addresses:
    .accesskey = n

no-proxy-example = Examples: .mozilla.org, .net.nz, 192.168.1.0/24

# Do not translate "localhost", "127.0.0.1/8" and "::1". (You can translate "and".)
connection-proxy-local-network-desc = Local network connections (like localhost) never use a proxy.

proxy-auto-login-saved-password =
    .label = Automatically log in if a password is saved
    .accesskey = i
    .tooltiptext = This option silently authenticates you to proxies when you have saved credentials for them. You will be prompted if authentication fails.

proxy-socks-remote-dns =
    .label = Route domain requests (DNS) through SOCKS v5 proxy
    .accesskey = d
