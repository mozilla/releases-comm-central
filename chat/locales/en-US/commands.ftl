# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# LOCALIZATION NOTE (commands-key):
#  $command (String): is a comma separated list of command names.
commands-key =
    Commands: { $command }.
    Use /help &lt;command&gt; for more information.
# LOCALIZATION NOTE (no-command, no-help-key):
#  $command (String): is the command name the user typed.
no-command = No '{ $command }' command.
#  $command (String): is the command name the user typed.
no-help-key = No help message for the '{ $command }' command, sorry!

say-help-string = say &lt;message&gt;: send a message without processing commands.
raw-help-string = raw &lt;message&gt;: send a message without escaping HTML entities.
help-help-string = help &lt;name&gt;: show the help message for the &lt;name&gt; command, or the list of possible commands when used without parameter.

# LOCALIZATION NOTE (status-command):
#  $command (String): is replaced with a status command name (one of "back-key-key", "away-key-key", "busy-key-key", "dnd-key-key", or "offline-key-key").
#  $status (String): is replaced with the localized version of that status type (one of the 5 strings below).
status-command = { $command } &lt;status message&gt;: set the status to { $status } with an optional status message.
back-key-key = available
away-key-key = away
busy-key-key = unavailable
dnd-key-key = unavailable
offline-key-key = offline
