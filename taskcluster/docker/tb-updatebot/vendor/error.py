#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""
Failures the updatebot jobs expect, as opposed to bugs. main() reports these as
a notification.
"""


class UpdatebotException(Exception):
    pass


class UpdateCheckException(UpdatebotException):
    pass


class VendorException(UpdatebotException):
    pass


class SubmitException(UpdatebotException):
    pass
