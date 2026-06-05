# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Variables:
#   $count -  total number of downloaded messages
pop3-event-status-text = {
    $count ->
        [one] { $count } message downloaded
        *[other] { $count } messages downloaded
    }

# Variables:
#   $count - number of messages
#   $folderName - folder name
deleted-messages-from-folder = {
    $count ->
        [one] Deleted { $count } message from { $folderName }
        *[other] Deleted { $count } messages from { $folderName }
    }

# Variables:
#   $count - number of messages
#   $source - source folder name
#   $destination - destination folder name
moved-messages-from-folder = {
    $count ->
        [one] Moved { $count } message from { $source } to { $destination }
        *[other] Moved { $count } messages from { $source } to { $destination }
    }

# Variables:
#   $count - number of messages
#   $source - source folder name
#   $destination - destination folder name
copied-messages-from-folder = {
    $count ->
        [one] Copied { $count } message from { $source } to { $destination }
        *[other] Copied { $count } messages from { $source } to { $destination }
    }

# Variables:
#   $count - the total number of messages being indexed
#   $msgNumber - the number of the message currently being indexed
#   $percentComplete - percentage of indexing that is complete
gloda-indexing-status-exact = {
    $count ->
        [one] Indexing { $msgNumber } of { $count } message
        *[other] Indexing { $msgNumber } of { $count } messages ({ $percentComplete }% complete)
    }

# Variables:
#   $count - the total number of messages being indexed
#   $msgNumber - the number of the message currently being indexed
#   $percentComplete - percentage of indexing that is complete
#   $folder - folder name
gloda-indexing-folder-status-exact = {
    $count ->
        [one] Indexing { $msgNumber } of { $count } message in { $folder }
        *[other] Indexing { $msgNumber } of { $count } messages in { $folder } ({ $percentComplete }% complete)
    }

# Variables:
#   $count - number of messages
#   $folder - folder name
gloda-indexed-folder = {
    $count ->
        [one] Indexed { $count } message in { $folder }
        *[other] Indexed { $count } messages in { $folder }
    }

# Variables:
#   $count - number of seconds
gloda-indexed-folder-status = {
    $count ->
        [one] { $count } second elapsed
        *[other] { $count } seconds elapsed
    }

# Display line of the live Activity Manager process shown while a WebExtension
# is actively sending messages via messages.sendMessage(). The running count is
# shown in the status line below.
# Variables:
#   $extensionName (String) - the extension's name
extension-send-activity-live = Extension “{ $extensionName }” is sending unattended messages.

# Status line shown under extension-send-activity-live, updated after every send.
# Variables:
#   $count (Number) - number of messages sent so far in this batch
extension-send-activity-progress = { $count ->
    [one] { $count } message sent
   *[other] { $count } messages sent
}

# Permanent Activity Manager entry written when the live send process is
# finalized, 10 seconds after the last send in a batch. The count and elapsed
# time are carried in the status line below (extension-send-activity-event-status).
# Variables:
#   $extensionName (String) - the extension's name
#   $count (Number) - number of messages sent in this batch
extension-send-activity-event = { $count ->
    [one] Extension “{ $extensionName }” sent an unattended message
   *[other] Extension “{ $extensionName }” sent multiple unattended messages
}

# Status line shown under extension-send-activity-event. Reports how many
# messages were sent and the wall-clock time between the first and last send in
# the batch (rounded to whole seconds, at least one).
# Variables:
#   $count (Number) - number of messages sent in this batch
#   $seconds (Number) - elapsed seconds between the first and last send
extension-send-activity-event-status = { $count ->
    [one] { $seconds ->
        [one] { $count } message in { $seconds } second
       *[other] { $count } message in { $seconds } seconds
    }
   *[other] { $seconds ->
        [one] { $count } messages in { $seconds } second
       *[other] { $count } messages in { $seconds } seconds
    }
}
