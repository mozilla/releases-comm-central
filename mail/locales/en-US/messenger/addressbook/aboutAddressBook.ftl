# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

about-addressbook-title = Address Book

## Toolbar

about-addressbook-toolbar-add-address-book =
  .label = Add Local Address Book
about-addressbook-toolbar-add-carddav-address-book =
  .label = Add CardDAV Address Book
about-addressbook-toolbar-add-ldap-address-book =
  .label = Add LDAP Address Book

books-pane-create-contact-button = New Contact
  .title = Create a new contact
books-pane-create-book-button =
  .title = Create a new address book
books-pane-create-list-button =
  .title = Create a new mailing list
books-pane-import-button = Import
  .title = Import address books

## Books

all-address-books-row =
  .title = All Address Books
all-address-books = All Address Books

# Variables:
# $name (String) - The name of the selected book/list.
# $count (Number) - The number of contacts in the selected book/list.
about-addressbook-card-count = Total contacts in { $name }: { $count }
# Variables:
# $count (Number) - The number of contacts in all address books.
about-addressbook-card-count-all = Total contacts in all address books: { $count }

about-addressbook-books-context-properties =
  .label = Properties
about-addressbook-books-context-edit-list =
  .label = Edit list
about-addressbook-books-context-synchronize =
  .label = Synchronize
about-addressbook-books-context-edit =
  .label = Edit
about-addressbook-books-context-print =
  .label = Print…
about-addressbook-books-context-export =
  .label = Export…
about-addressbook-books-context-delete =
  .label = Delete
about-addressbook-books-context-remove =
  .label = Remove
about-addressbook-books-context-startup-default =
  .label = Default startup directory

about-addressbook-confirm-delete-book-title = Delete Address Book
# Variables:
# $name (String) - Name of the address book to be deleted.
about-addressbook-confirm-delete-book =
  Are you sure you want to delete { $name } and all of its contacts?
about-addressbook-confirm-remove-remote-book-title = Remove Address Book
# Variables:
# $name (String) - Name of the remote address book to be removed.
about-addressbook-confirm-remove-remote-book =
  Are you sure you want to remove { $name }?

## Cards

# Variables:
# $name (String) - Name of the address book that will be searched.
about-addressbook-search2 =
  .label = Search { $name }
  .placeholder = Search { $name }…
about-addressbook-search-all2 =
  .label = Search all address books
  .placeholder = Search all address books…

about-addressbook-sort-button2 =
  .title = List display options

about-addressbook-name-format-display =
  .label = Display Name
about-addressbook-name-format-firstlast =
  .label = First Last
about-addressbook-name-format-lastfirst =
  .label = Last, First

about-addressbook-sort-name-ascending =
  .label = Sort by name (A > Z)
about-addressbook-sort-name-descending =
  .label = Sort by name (Z > A)
about-addressbook-sort-email-ascending =
  .label = Sort by email address (A > Z)
about-addressbook-sort-email-descending =
  .label = Sort by email address (Z > A)

about-addressbook-table-layout =
  .label = Table layout

## Card column headers
## Each string is listed here twice, and the values should match.

about-addressbook-column-header-generatedname2 = Name
  .title = Sort by name
about-addressbook-column-label-generatedname2 =
  .label = Name
# Variables:
# $title (String) - Contact name for tooltip.
about-addressbook-cell-generatedname2 =
  .aria-label = Name
  .title = { $title }

about-addressbook-column-header-emailaddresses2 = Email Addresses
  .title = Sort by email addresses
about-addressbook-column-label-emailaddresses2 =
  .label = Email Addresses
# Variables:
# $title (String) - Contact email addresses for tooltip.
about-addressbook-cell-emailaddresses2 =
  .aria-label = Email Addresses
  .title = { $title }

about-addressbook-column-header-nickname2 = Nickname
  .title = Sort by nickname
about-addressbook-column-label-nickname2 =
  .label = Nickname
# Variables:
# $title (String) - Contact nickname for tooltip.
about-addressbook-cell-nickname2 =
  .aria-label = Nickname
  .title = { $title }

about-addressbook-column-header-phonenumbers2 = Phone Numbers
  .title = Sort by phone numbers
about-addressbook-column-label-phonenumbers2 =
  .label = Phone Numbers
# Variables:
# $title (String) - Contact phone numbers for tooltip.
about-addressbook-cell-phonenumbers2 =
  .aria-label = Phone Numbers
  .title = { $title }

about-addressbook-column-header-addresses2 = Addresses
  .title = Sort by addresses
about-addressbook-column-label-addresses2 =
  .label = Addresses
# Variables:
# $title (String) - Contact addresses for tooltip.
about-addressbook-cell-addresses2 =
  .aria-label = Addresses
  .title = { $title }

about-addressbook-column-header-title2 = Title
  .title = Sort by title
about-addressbook-column-label-title2 =
  .label = Title
# Variables:
# $title (String) - Contact job title for tooltip.
about-addressbook-cell-title2 =
  .aria-label = Title
  .title = { $title }

about-addressbook-column-header-department2 = Department
  .title = Sort by department
about-addressbook-column-label-department2 =
  .label = Department
# Variables:
# $title (String) - Contact department for tooltip.
about-addressbook-cell-department2 =
  .aria-label = Department
  .title = { $title }

about-addressbook-column-header-organization2 = Organization
  .title = Sort by organization
about-addressbook-column-label-organization2 =
  .label = Organization
# Variables:
# $title (String) - Contact organization for tooltip.
about-addressbook-cell-organization2 =
  .aria-label = Organization
  .title = { $title }

about-addressbook-column-header-addrbook2 = Address Book
  .title = Sort by address book
about-addressbook-column-label-addrbook2 =
  .label = Address Book
# Variables:
# $title (String) - Contact address for tooltip.
about-addressbook-cell-addrbook2 =
  .aria-label = Address Book
  .title = { $title }

about-addressbook-cards-context-write =
  .label = Write

about-addressbook-confirm-delete-mixed-title = Delete Contacts and Lists
# Variables:
# $count (Number) - The number of contacts and lists to be deleted. Always greater than 1.
about-addressbook-confirm-delete-mixed =
  Are you sure you want to delete these { $count } contacts and lists?
# Variables:
# $count (Number) - The number of lists to be deleted.
about-addressbook-confirm-delete-lists-title =
  { $count ->
     [one] Delete List
    *[other] Delete Lists
  }
# Variables:
# $count (Number) - The number of lists to be deleted.
# $name (String) - The name of the list to be deleted, if $count is 1.
about-addressbook-confirm-delete-lists =
  { $count ->
     [one] Are you sure you want to delete the list { $name }?
    *[other] Are you sure you want to delete these { $count } lists?
  }
# Variables:
# $count (Number) - The number of contacts to be removed.
about-addressbook-confirm-remove-contacts-title =
  { $count ->
     [one] Remove Contact
    *[other] Remove Contacts
  }
# Variables:
# $name (String) - The name of the contact to be removed.
# $list (String) - The name of the list that contacts will be removed from.
about-addressbook-confirm-remove-contacts-single =
  Are you sure you want to remove { $name } from { $list }?
# Variables:
# $count (Number) - The number of contacts to be removed.
# $list (String) - The name of the list that contacts will be removed from.
about-addressbook-confirm-remove-contacts-multi =
  { $count ->
    *[other] Are you sure you want to remove these { $count } contacts from { $list }?
  }
# Variables:
# $count (Number) - The number of contacts to be deleted.
about-addressbook-confirm-delete-contacts-title =
  { $count ->
     [one] Delete Contact
    *[other] Delete Contacts
  }
# Variables:
# $name (String) - The name of the contact to be deleted.
about-addressbook-confirm-delete-contacts-single =
  Are you sure you want to delete the contact { $name }?
# Variables:
# $count (Number) - The number of contacts to be deleted.
about-addressbook-confirm-delete-contacts-multi =
  { $count ->
    *[other] Are you sure you want to delete these { $count } contacts?
  }

## Card list placeholder
## Shown when there are no cards in the list

about-addressbook-placeholder-empty-book = No contacts available
about-addressbook-placeholder-new-contact = New Contact
about-addressbook-placeholder-search-only = This address book shows contacts only after a search
about-addressbook-placeholder-searching = Searching…
about-addressbook-placeholder-no-search-results = No contacts found

## Details

# Variables:
# $count (Number) - The number of selected items (will never be fewer than 2).
about-addressbook-selection-mixed-header2 =
    { $count ->
       *[other] { $count } selected address book entries
    }
# Variables:
# $count (Number) - The number of selected contacts
about-addressbook-selection-contacts-header2 =
    { $count ->
       [one] { $count } selected contact
       *[other] { $count } selected contacts
    }
# Variables:
# $count (Number) - The number of selected lists
about-addressbook-selection-lists-header2 =
    { $count ->
       [one] { $count } selected list
       *[other] { $count } selected lists
    }

about-addressbook-details-edit-photo =
  .title = Edit contact photo

about-addressbook-new-contact-header = New Contact

about-addressbook-write-action-button = Write
about-addressbook-event-action-button = Event
about-addressbook-search-action-button = Search
about-addressbook-new-list-action-button = New List

about-addressbook-begin-edit-contact-button = Edit
about-addressbook-delete-edit-contact-button = Delete
about-addressbook-cancel-edit-contact-button = Cancel
about-addressbook-save-edit-contact-button = Save

about-addressbook-add-contact-to = Add to:

about-addressbook-details-email-addresses-header = Email Addresses
about-addressbook-details-phone-numbers-header = Phone Numbers
about-addressbook-details-addresses-header = Addresses
about-addressbook-details-notes-header = Notes
about-addressbook-details-impp-header = Instant Messaging
about-addressbook-details-websites-header = Websites
about-addressbook-details-other-info-header = Other Information

about-addressbook-entry-type-work = Work
about-addressbook-entry-type-home = Home
about-addressbook-entry-type-fax = Fax
# Or "Mobile"
about-addressbook-entry-type-cell = Cell
about-addressbook-entry-type-pager = Pager

about-addressbook-entry-name-birthday = Birthday
about-addressbook-entry-name-anniversary = Anniversary
about-addressbook-entry-name-title = Title
about-addressbook-entry-name-role = Role
about-addressbook-entry-name-organization = Organization
about-addressbook-entry-name-website = Website
about-addressbook-entry-name-time-zone = Time Zone
about-addressbook-entry-name-custom1 = Custom 1
about-addressbook-entry-name-custom2 = Custom 2
about-addressbook-entry-name-custom3 = Custom 3
about-addressbook-entry-name-custom4 = Custom 4

about-addressbook-unsaved-changes-prompt-title = Unsaved Changes
about-addressbook-unsaved-changes-prompt = Do you want to save your changes before leaving the edit view?

# Photo dialog

about-addressbook-photo-drop-target = Drop or paste a photo here, or click to select a file.
about-addressbook-photo-drop-loading = Loading photo…
about-addressbook-photo-drop-error = Failed to load photo.
about-addressbook-photo-filepicker-title = Select an image file

about-addressbook-photo-discard = Discard existing photo
about-addressbook-photo-cancel = Cancel
about-addressbook-photo-save = Save

# Keyboard shortcuts

about-addressbook-new-contact-key = N
