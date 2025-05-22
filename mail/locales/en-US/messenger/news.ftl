# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
# $count (Number) - Number of headers.
# $newsgroup (String) - The name of the newsgroup.
new-newsgroup-headers =
    { $count ->
      [one] Downloading { $count } header for { $newsgroup }…
      *[other] Downloading { $count } headers for { $newsgroup }…
    }

# Variables:
# $newsgroup (String) - The name of the newsgroup.
no-new-messages =
    There are no new messages in { $newsgroup }.

# Variables:
# $count (Number) - Number of articles.
# $newsgroup (String) - The name of the newsgroup.
downloading-articles-for-offline =
    { $count ->
      [one] Downloading { $count } article for { $newsgroup }…
      *[other] Downloading { $count } articles for { $newsgroup }…
    }
# Variables:
# $newsgroup (String) - The name of the newsgroup.
no-articles-to-download =
    There are no articles to download for { $newsgroup }.

# Variables:
# $newsgroup (String) - The name of the newsgroup.
no-such-newsgroup = The newsgroup { $newsgroup } is not available on the server.
