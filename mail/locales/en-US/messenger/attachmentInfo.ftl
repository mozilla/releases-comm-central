# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Strings used by attachment actions: saving, opening, detaching and deleting.

attachment-save-dialog-title = Save Attachment

attachment-save-all-dialog-title = Save All Attachments

attachment-detach-dialog-title = Detach Attachment

attachment-detach-all-dialog-title = Detach All Attachments

attachment-save-failed = Unable to save the attachment. Please check your file name and try again later.

# Variables:
#   $filename (String) - Name of the file that already exists.
attachment-file-exists = { $filename } already exists. Do you want to replace it?

# Variables:
#   $attachments (String) - Newline separated list of attachment names.
attachment-delete-confirm =
    The following attachments will be permanently deleted from this message:
    { $attachments }
    This action cannot be undone. Do you wish to continue?

# Variables:
#   $attachments (String) - Newline separated list of attachment names.
attachment-detach-confirm =
    The following attachments have been successfully saved and will now be permanently deleted from this message:
    { $attachments }
    This action cannot be undone. Do you wish to continue?

attachment-empty =
    This attachment appears to be empty.
    Please check with the person who sent this.
    Often company firewalls or antivirus programs will destroy attachments.

attachment-external-not-found = This detached file or link attachment is not found or is not accessible at this location anymore.
