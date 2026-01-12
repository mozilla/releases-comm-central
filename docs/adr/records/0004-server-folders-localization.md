# ADR 0004 Server Folders Localization

## Server Folders Localization Convention

### Links

- [Bug #2006549](https://bugzilla.mozilla.org/show_bug.cgi?id=2006549)

### Status

- **Status:** Accepted

### Context

Thunderbird doesn't create Special Folders like Drafts, Trash, Spam, etc., which
are provided by the server, therefore we have no control over their names.
Each server and email provider has the ability to name these folders as they
want, as there's no obligation or strict specification on naming conventions for
those Special Folders.

This level of freedom and flexibility creates inconsistency that is mostly
noticeable when a user has multiple accounts from different regions in
Thunderbird.
The application (Thunderbird) might be in en-US, but the Spam folder could be
presented as:
- Spam
- Spam Mail
- Junk
- Junk Mail
- Posta Indesiderata (in case of an Italian server)
- Bulk
- ...or something else

This issue applies to all the Special Folders, leaving the user with a folder
pane that shows the same folder type with multiple names, creating confusion
and reducing consistency.

## Decision

As we work towards polishing and elevating our interface and user experience, it
was clear that the data visualized should respect as much as possible the locale
of the application, in order to bring consistency and maintain familiarity
across accounts, regardless of their unique locales.

For folders with special folder flags and specific English names, Thunderbird
now uses localized strings in order to respect the application's locale.

We also introduced a new static preference called `mail.useLocalizedFolderNames`
that will give control to the users to decide if special folders (trash, drafts,
etc.) on remote servers should use names provided by Thunderbird's localizers,
instead of names from the server which may or may not be localized.

### Consequences and Risks

#### Positive Consequences

- Consistent naming for all Special Folders across all accounts.
- Prioritization of the localized strings of the application's locale chosen by
the user.
- Optional preference to allow users to consume the strings coming from the
server without any localization.

#### Potential Risks

- There is potential for visual folders duplication if multiple folders have the
same folder Flag and name.
- Confusion for the user when Thunderbird is showing something different than
what they have on the server. This can be odd when server side filtering is
involved, and when discussing issues with support.
- It is possible to get into a few strange situations because any folder can
have any flag and users could define two folders in the same place with the same
flag.

### Alternatives

- Older versions of Thunderbird had a list of folder names that were localized,
and the downside of that approach was that it only handled a very limited list
of English names and the list was incomplete.

### Security Considerations

There are no security considerations at this time.

### Rollout Plan

The changes have been implemented already and will be available starting from
version 147.
