# Mail Display

## about:3pane

The primary UI of Thunderbird is the mail tab with three panes, which has evolved over time from
when it first appeared in Netscape Navigator 2.0. The basic layout is the same now as it was then,
although the code was substantially rewritten in Thunderbird 115.

This tab is implemented by `about:3pane`, a document displayed in a `<browser>` with chrome
privileges.

### Folder Pane

The folder pane contains a tree of folders, which can be displayed in various different ways, or
"modes":

- **All Folders** - Every folder from every mail account, ordered by folder type and then name,
  unless the user has reordered them.
- **Unified Folders** - Folders grouped by folder type. First the inboxes from all accounts, then
  the drafts, sent, trash, etc.. Any folders without a special type are listed last. Each folder
  type also has a "unified" folder which displays all the mail from folders of that type.
- **Unread Folders** - Folders with unread mail in them, grouped by account or as a flat list.
- **Favourite Folders** - Folders with the `Favorite` flag, grouped by account or as a flat list.
- **Recent Folders** - A flat list of recently open folders.
- **Tags** - Tagged messages from any folder, grouped by tag.

Folder modes can be displayed in any combination or order, so long as there is at least one.
Telemetry tells us that the default All Folders mode is _by far_ the most common configuration.

### Thread Pane

(Also known as the message list pane.)

The thread pane contains the list of messages and the [Quick Filter bar](/frontend/quick_filter_bar).

The list of messages can be displayed as a table, with columns for date, subject, sender, etc.
(Table View), or as a list of cards with the data spread across multiple lines (Cards View). It is
implemented as a customised [TreeView](/frontend/trees).

### Message Pane

(Also known as the message preview pane, or the message reader pane.)

This pane's main purpose is to display the message selected in the message list, but it can also
display multiple messages, or web pages. Each of these tasks has different requirements, so the
message pane actually contains three `<browser>` elements, only one of which can be shown at a time:

- `webBrowser` - A standard content-privileged browser, which can be in the parent process or a
  child process depending on the page displayed (just like a browser element in Firefox). Clicking
  on any link in a page displayed here will open the link in an external web browser.
- `messageBrowser` - A chrome-privileged browser displaying `about:message`, for displaying a
  single message. More on this below.
- `multiMessageBrowser` - A content-privileged browser displaying multimessageview.xhtml, a page
  that can display summaries of multiple messages in different ways depending on the context.

## about:message

Message display happens in a document named `about:message`, which can appear in the message pane
of about:3pane, or by itself in a separate tab, or in a standalone window (messageWindow.xhtml).

As well as a content-privileged `<browser>` for displaying the message itself, about:message
contains UI for displaying message headers (such as the sender and subject) and listing attachments.
The process for populating the UI is:

- A message URI (e.g. an `imap-message:` URI) is passed to about:message, which first clears away
  any message it's already displaying.
- The browser is asked to load the URI (via the right `nsIMsgMessageService` for the URI scheme).
  As the URI is loaded, the back-end code responsible for handling URIs of that type creates an
  `nsIChannel` to stream message content through. This channel also implements `nsIMailChannel`.
- The browser, being unable to display `message/rfc822` documents, creates an instance of
  `nsStreamConverter` to convert it to an HTML document. The stream converter parses the MIME
  content of the message, extracting the body of the message to pass through the channel to the
  browser. At the same time, headers and attachment data are collected and set as properties of the
  mail channel.
- As the message loads in the document, progress events are emitted. about:message listens for
  these events and uses the header and attachment data from the mail channel to populate the UI.
