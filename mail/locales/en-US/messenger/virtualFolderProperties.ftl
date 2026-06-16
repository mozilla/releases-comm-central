# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

## Strings for the virtual folder properties dialog, which is used for both
## creating and editing saved search folders.

# Variables:
#   $count - number of chosen folders
virtual-folder-sources-chosen = {
    $count  ->
        [one] { $count } folder chosen
        *[other] { $count } folders chosen
    }

virtual-folder-no-search-folders-selected = You must choose at least one folder to search for the saved search folder.

virtual-folder-properties-title = New Saved Search Folder

# Variables:
#   $folderName (String): The name of the saved search folder.
virtual-folder-properties-edit-title = Edit Saved Search Properties for { $folderName }

virtual-folder-name = Name:
    .accesskey = N

virtual-folder-description = Create as a subfolder of:
    .accesskey = C

virtual-folder-folder-selection-caption = Select the folders to search:

virtual-folder-choose-folders-button =
    .label = Choose…
    .accesskey = h

virtual-folder-search-online =
    .label = Search Online (Gives up-to-date results for IMAP and News folders but increases time to open the folder)
    .accesskey = S

virtual-folder-search-term-caption = Configure the search criteria used for this saved search folder:

virtual-folder-accept-button-create =
    .label = Create
    .accesskey = r

virtual-folder-accept-button-update =
    .label = Update
    .accesskey = U

## The following are for the virtual folder list dialog, which is opened when
## the user clicks the "Choose..." button to select folders.

virtual-folder-list-title = Select Folder(s)

virtual-folder-list-desc = Select the folders to search:
