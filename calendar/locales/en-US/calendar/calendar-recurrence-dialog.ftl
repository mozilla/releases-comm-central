# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

calendar-recurrence-preview-label = Preview

calendar-recurrence-next = Next Month

calendar-recurrence-previous = Previous Month

calendar-recurrence-today = Today

# Recurrence Dialog Widget Order
# LOCALIZATION NOTE (monthly-order): Don't translate, Make sure there are no extra
# words in this property, just variables. You can change the order of below params
# Edit recurrence window -> Recurrence pattern -> Repeat monthly
# $ordinal - ordinal with article, $day - weekday
# e.g. "the First Saturday"
monthly-order = { $ordinal } { $day }

# LOCALIZATION NOTE (yearly-order-day): Don't translate, Make sure there are no extra
# words in this property, just variables. If you don't need $article in your locale
# please put this on the third place.
# Edit recurrence window -> Recurrence pattern -> Repeat yearly
# $day - day of month, $article - of, $month - month
# e.g. "6 [of] September"
yearly-order-day = { $day } { $article } { $month }

# LOCALIZATION NOTE (yearly-order-day): Don't translate, Make sure there are no extra
# words in this property, just variables. If you don't need $article in your locale
# please put this on the third place.
# Edit recurrence window -> Recurrence pattern -> Repeat yearly
# $ordinal - ordinal with article, $day - weekday, $article  - of, $month - month
# e.g. "the First Saturday of September"
yearly-order-ordinal = { $ordinal } { $day } { $article } { $month }

# LOCALIZATION NOTE (event-recurrence-monthly-last-day-label):
# Edit dialog recurrence -> Monthly Recurrence pattern -> Monthly daypicker
# The label on the monthly daypicker's last button that allows to select
# the last day of the month inside a BYMONTHDAY rule.
event-recurrence-monthly-last-day-label =
    .label = Last day
