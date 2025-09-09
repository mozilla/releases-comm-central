# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

rule-menuitem-spam =
  .label = Spam

rule-menuitem-not-spam =
  .label = Not Spam

run-filter-before-spam =
  .label = Filter before Spam Classification

run-filter-after-spam =
  .label = Filter after Spam Classification

rule-action-set-spam-status =
  .label = Set Spam Status to

# Variables:
# $author (String) - The author of the message.
# $subject (String) - The subject of the message.
# $date (String) - The date of the message.
spam-message-detection-log = Detected spam from { $author } - { $subject } at { $date }

# Variables:
# $id (String) - The author of the moved message.
# $folder (String) - The destination folder of the moved message.
moved-message-log = moved message id = { $id } to { $folder }

filter-action-log-spam = spam score
