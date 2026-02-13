# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Variables:
#   $count - number of feeds
subscribe-opml-import-unique-feeds = {
    $count ->
        [one] Imported { $count } new feed to which you aren’t already subscribed
        *[other] Imported { $count } new feeds to which you aren’t already subscribed
    }

# Variables:
#   $count - total number of elements found in the file
subscribe-opml-import-found-feeds = {
    $count ->
        [one] (out of { $count } entry found)
        *[other] (out of { $count } total entries found)
    }

# Variables:
#   $count - the count of new imported entries
subscribe-opml-import-feed-count = {
    $count ->
        [one] Imported { $count } new feed.
        *[other] Imported { $count } new feeds.
    }
