# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import-page-title = Import

## Header

import-from-app = Import from Application

import-from-app-desc = Choose to import Accounts, Address Books, Calendars, and other data from:

import-address-book = Import Address Book File

import-calendar = Import Calendar File

## Buttons

button-cancel = Cancel

button-back = Back

button-continue = Continue

## Import from app steps

app-name-thunderbird = Thunderbird

app-name-seamonkey = SeaMonkey

app-name-outlook = Outlook

app-name-becky = Becky! Internet Mail

app-name-apple-mail = Apple Mail

# Variables:
#   $app (String) - The name of the app to import from
profiles-pane-title = Import from { $app }

profiles-pane-desc = Choose the location from which to import

profile-file-picker-dir = Select a profile folder

profile-file-picker-zip = Select a zip file (smaller than 2GB)

items-pane-title = Select what to import

items-pane-source = Source location:

items-pane-checkbox-accounts = Accounts and Settings

items-pane-checkbox-address-books = Address Books

items-pane-checkbox-calendars = Calendars

items-pane-checkbox-mail-messages = Mail Messages

## Import from address book file steps

import-from-addr-book-file-desc = Select the file type you would like to import:

addr-book-csv-file = Comma or tab separated file (.csv, .tsv)

addr-book-ldif-file = LDIF file (.ldif)

addr-book-vcard-file = vCard file (.vcf, .vcard)

addr-book-mab-file = Mork database file (.mab)

addr-book-file-picker = Select an address book file

addr-book-csv-field-map-title = Match field names

addr-book-csv-field-map-desc = Select address book fields corresponding to the source fields. Uncheck fields you do not want to import.

addr-book-directories-pane-title = Select the directory you would like to import into:

addr-book-directories-pane-source = Source file:

addr-book-import-into-new-directory = Create a new directory

## Import dialog

progress-pane-title = Importing

progress-pane-finished-desc = Finished.

progress-pane-restart-desc = Restart to finish importing.

error-pane-title = Error

error-message-zip-file-too-big = The selected zip file is larger than 2GB. Please extract it first, then import from the extracted folder instead.

error-message-extract-zip-file-failed = Failed to extract the zip file. Please extract it manually, then import from the extracted folder instead.

error-message-failed = Import failed unexpectedly, more information may be available in the Error Console.

## <csv-field-map> element

csv-first-row-contains-headers = First row contains field names

csv-source-field = Source field

csv-source-first-record = First record

csv-source-second-record = Second record

csv-target-field = Address book field
