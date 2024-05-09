#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// This file contains settings for the shared (with SeaMonkey) mailnews backend.
// Thunderbird specific settings and overrides are in all-thunderbird.js.

// SpaceHit() function: whether spacebar advances to next unread message.
pref("mail.advance_on_spacebar", true);

pref("mailnews.logComposePerformance", false);

pref("mail.wrap_long_lines", true);

// Show attachments of supported types rendered directly in the message body view.
pref("mail.inline_attachments", true);
// When rendering attachments inline, show also text attachments (e.g. CSV, HTML,
// plain text) which are potentially very long.
pref("mail.inline_attachments.text", false);
pref("mail.reply_quote_inline", false);
// When in a message the List-Post header contains the content of the Reply-To
// (which is called "Reply-To Munging") we override the Reply-To header with
// the From header.
pref("mail.override_list_reply_to", true);
// hidden pref for controlling if the Content-Language header
// should be set.
pref("mail.suppress_content_language", false);
// Pref for controlling if the Date header is sanitized, by:
// 1. Converting the date to UTC, to prevent leaking the local time zone.
// 2. Rounding the date down to the most recent whole minute, to prevent
//    fingerprinting of small clock offsets.
pref("mail.sanitize_date_header", false);

// This determines the date/time format in the thread pane.
// 0: (Short) Time only
// 1: Long date and (short) time
// 2: Short date and (short) time
// 3: Unused, used to be Year/month and time, no very useful.
// 4: Weekday and (short) time. Some people prefer this for "thisweek".
pref("mail.ui.display.dateformat.default", 2);
pref("mail.ui.display.dateformat.thisweek", 2);
pref("mail.ui.display.dateformat.today", 0);

// Is a user agent header sent in outgoing email messages?
pref("mailnews.headers.sendUserAgent", true);

// If sending the user agent header is enabled,
// should only a minimal header be sent?
pref("mailnews.headers.useMinimalUserAgent", true);

// hidden pref for controlling if the user agent string
// is displayed in the message pane or not...
pref("mailnews.headers.showUserAgent", false);

// hidden pref for controlling if the organization string
// is displayed in the message pane or not...
pref("mailnews.headers.showOrganization", false);

// hidden pref for controlling if the references header
// is displayed in the message pane or not...
pref("mailnews.headers.showReferences", false);

// hidden pref for controlling if the message-id header
// is displayed in the message pane or not...
pref("mailnews.headers.showMessageId", false);

// Show list management headers. RFC 2369.
pref("mailnews.headers.showListHelp", false);
pref("mailnews.headers.showListUnsubscribe", false);
pref("mailnews.headers.showListSubscribe", false);
pref("mailnews.headers.showListPost", false);
pref("mailnews.headers.showListOwner", false);
pref("mailnews.headers.showListArchive", false);
// Show Archived-At header. RFC 5064.
pref("mailnews.headers.showArchivedAt", false);

// hidden pref for controlling if the message to a message-id
// is opened in a new window or in the same window
pref("mailnews.messageid.openInNewWindow", false);

// hidden pref for url which will be used to open  message-ids
// in browser (%mid ist replaced with the message-id)
pref("mailnews.messageid_browser.url", "https://groups.google.com/search?q=messageid%3A%mid");

// hidden pref for whether or not to warn when deleting filters. Default YES
pref("mailnews.filters.confirm_delete", true);

// space-delimited list of extra headers to show in msg header display area.
pref("mailnews.headers.extraExpandedHeaders", "");

// Space-delimited list of extra headers that will be pushed to
// currentHeaderData for processing in add-ons (without being displayed).
// Use a value of "*" to get all headers (other wildcards not supported).
pref("mailnews.headers.extraAddonHeaders", "");

// default sort order settings (when creating new folder views)
// sort_order is an int value reflecting nsMsgViewSortOrder values
//   as defined in nsIMsgDBView.idl (ascending = 1, descending = 2)
// sort_type is an int value reflecting nsMsgViewSortType values
//   as defined in nsIMsgDBView.idl (byDate = 18, byId = 21 etc.)

// for Mail/RSS/... (nsMsgDatabase)
pref("mailnews.default_sort_order", 2);
pref("mailnews.default_sort_type", 18);
// for News (nsNewsDatabase)
pref("mailnews.default_news_sort_order", 2);
pref("mailnews.default_news_sort_type", 21);

// hidden pref for whether "sort by date" and "sort by received date" in
// threaded mode should be based on the newest message in the thread, or on
// the thread root
pref("mailnews.sort_threads_by_root", false);

// default view flags for new folders
// both flags are int values reflecting nsMsgViewFlagsType values
// as defined in nsIMsgDBView.idl (kNone = 0, kThreadedDisplay = 1 etc.)

// for Mail/RSS/... (nsMsgDatabase)
pref("mailnews.default_view_flags", 1);
// for News (nsNewsDatabase)
pref("mailnews.default_news_view_flags", 1);

// If true, delete will use the direction of the sort order
// in determining the next message to select.
pref("mail.delete_matches_sort_order", false);

// mailnews tcp read+write timeout in seconds.
pref("mailnews.tcptimeout", 100);

pref("mailnews.headers.showSender", false);

// set to 0 if you don't want to ignore timestamp differences between
// local mail folders and the value stored in the corresponding .msf file.
// 0 was the default up to and including 1.5. I've made the default
// be greater than one hour so daylight savings time changes don't affect us.
// We will still always regenerate .msf files if the file size changes.
pref("mail.db_timestamp_leeway", 4000);
// How long should we leave idle db's open, in milliseconds.
pref("mail.db.idle_limit", 300000);
// How many db's should we leave open? LRU db's will be closed first
pref("mail.db.max_open", 30);

// Should we allow folders over 4GB in size?
pref("mailnews.allowMboxOver4GB", true);

// For IMAP caching lift the limits since they are designed for HTML pages.
// Note that the maximum size of a cache entry is limited by
// max_entry_size and (capacity >> 3), so divided by 8.
// Larger messages or attachments won't be cached.

//  25 MB
pref("browser.cache.memory.max_entry_size", 25000);
// 200 MB = 8*25 MB
pref("browser.cache.memory.capacity", 200000);

pref("mail.imap.chunk_size", 65536);
pref("mail.imap.min_chunk_size_threshold", 98304);
pref("mail.imap.chunk_fast", 2);
pref("mail.imap.chunk_ideal", 4);
pref("mail.imap.chunk_add", 8192);
pref("mail.imap.hide_other_users", false);
pref("mail.imap.hide_unused_namespaces", true);
pref("mail.imap.use_literal_plus", true);
pref("mail.imap.expunge_after_delete", false);
pref("mail.imap.check_deleted_before_expunge", false);
pref("mail.imap.expunge_option", 0);
pref("mail.imap.expunge_threshold_number", 20);
pref("mail.imap.hdr_chunk_size", 200);
// Should we filter imap messages based on new messages since the previous
// highest UUID seen instead of unread?
pref("mail.imap.filter_on_new", true);

pref("mail.imap.tcp_keepalive.enabled", true);
// For both items below if set less than 0 it means "use network.tcp.keepalive.*"
// values. Or if set to 0, the value will be changed to 1, both in units of seconds.
// Note: idle_time is the TCP keepalive idle time and not related to IMAP IDLE.
pref("mail.imap.tcp_keepalive.idle_time", 100);
pref("mail.imap.tcp_keepalive.retry_interval", 5);

// if true, we assume that a user access a folder in the other users namespace
// is acting as a delegate for that folder, and wishes to use the other users
// identity when acting on messages in other users folders.
pref("mail.imap.delegateOtherUsersFolders", false);
// if false, only thread by subject if Re:
pref("mail.thread_without_re", false);
// if true, don't thread by subject at all
pref("mail.strict_threading", true);
// if true, makes sure threading works correctly always (see bug 181446)
pref("mail.correct_threading", true);
pref("mail.pop3.deleteFromServerOnMove", false);
pref("mail.fixed_width_messages", true);
#ifdef MOZ_SUITE
// quoted color
pref("mail.citation_color", "#000000");
#else
// quoted color
pref("mail.citation_color", "#007cff");
#endif
// If true, remove the everything after the "-- \n" signature delimiter when replying.
pref("mail.strip_sig_on_reply", true);
// 0=plain, 1=bold, 2=italic, 3=bolditalic
pref("mail.quoted_style", 0);
// 0=normal, 1=big, 2=small
pref("mail.quoted_size", 0);
// use HTML-style quoting for displaying plain text
pref("mail.quoted_graphical", true);
// use HTML-style quoting for quoting plain text
pref("mail.quoteasblock", true);
// Use CTE quoted-printable for mail bodies.
pref("mail.strictly_mime", false);
// The maximum number of entries in the "Recent" menu of the folder picker.
pref("mail.folder_widget.max_recent", 25);
// 0/1 (name param is encoded in a legacy way), 2(RFC 2231 only)
// 0 the name param is never separated to multiple lines.
pref("mail.strictly_mime.parm_folding", 1);
pref("mail.label_ascii_only_mail_as_us_ascii", false);
pref("mail.file_attach_binary", false);
pref("mail.show_headers", 1);
// some S/MIME parts are not external (but inline decrypted).
pref("mailnews.p7m_external", false);
pref("mail.pane_config.dynamic", 0);
#ifdef MOZ_SUITE
pref("mail.addr_book.mapit_url.format", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.1.name", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.1.format", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.2.name", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.2.format", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.3.name", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.3.format", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.4.name", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.4.format", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.5.name", "chrome://messenger-region/locale/region.properties");
pref("mail.addr_book.mapit_url.5.format", "chrome://messenger-region/locale/region.properties");
pref("mailnews.start_page.url", "chrome://messenger-region/locale/region.properties");
pref("mail.accountwizard.deferstorage", false);
// 0: name + email | 1: email only | 2: name only.
pref("mail.addressDisplayFormat", 0);
// |false|: Show both name and address, even for people in my addressbook.
pref("mail.showCondensedAddresses", false);
#endif

pref("mail.addr_book.loglevel", "Warn");
pref("mail.addr_book.view.startupURI", "moz-abdirectory://?");
pref("mail.addr_book.view.startupURIisDefault", true);

pref("carddav.setup.loglevel", "Warn");
pref("carddav.sync.loglevel", "Warn");

// mail.addr_book.quicksearchquery.format is the model query used for:
// * TB: AB Quick Search and composition's Contact Side Bar
// * SM: AB Quick Search and composition's Select Addresses dialogue
//
// The format for "mail.addr_book.quicksearchquery.format" is:
// @V == the escaped value typed in the quick search bar in the address book
// c  == contains | bw == beginsWith | ...
//
// Note, changing the fields searched might require changing labels:
// SearchNameOrEmail.label in messenger.dtd,
// searchNameAndEmail.emptytext in abMainWindow.dtd, etc.
//
// mail.addr_book.quicksearchquery.format will be used if mail.addr_book.show_phonetic_fields is "false"
pref("mail.addr_book.quicksearchquery.format", "(or(DisplayName,c,@V)(FirstName,c,@V)(LastName,c,@V)(NickName,c,@V)(PrimaryEmail,c,@V)(SecondEmail,c,@V)(and(IsMailList,=,TRUE)(Notes,c,@V))(Company,c,@V)(Department,c,@V)(JobTitle,c,@V)(WebPage1,c,@V)(WebPage2,c,@V))");
// mail.addr_book.quicksearchquery.format.phonetic will be used if mail.addr_book.show_phonetic_fields is "true"
pref("mail.addr_book.quicksearchquery.format.phonetic", "(or(DisplayName,c,@V)(FirstName,c,@V)(LastName,c,@V)(NickName,c,@V)(PrimaryEmail,c,@V)(SecondEmail,c,@V)(and(IsMailList,=,TRUE)(Notes,c,@V))(Company,c,@V)(Department,c,@V)(JobTitle,c,@V)(WebPage1,c,@V)(WebPage2,c,@V)(PhoneticFirstName,c,@V)(PhoneticLastName,c,@V))");

// mail.addr_book.autocompletequery.format is the model query used for:
// * TB: Recipient Autocomplete (composition, mailing list properties dialogue)
// * SM: Recipient Autocomplete (composition, mailing list properties dialogue)
//
// mail.addr_book.autocompletequery.format will be used if mail.addr_book.show_phonetic_fields is "false"
pref("mail.addr_book.autocompletequery.format", "(or(DisplayName,c,@V)(FirstName,c,@V)(LastName,c,@V)(NickName,c,@V)(PrimaryEmail,c,@V)(SecondEmail,c,@V)(and(IsMailList,=,TRUE)(Notes,c,@V)))");
// mail.addr_book.autocompletequery.format.phonetic will be used if mail.addr_book.show_phonetic_fields is "true"
pref("mail.addr_book.autocompletequery.format.phonetic", "(or(DisplayName,c,@V)(FirstName,c,@V)(LastName,c,@V)(NickName,c,@V)(PrimaryEmail,c,@V)(SecondEmail,c,@V)(and(IsMailList,=,TRUE)(Notes,c,@V))(PhoneticFirstName,c,@V)(PhoneticLastName,c,@V))");

// values for "mail.addr_book.lastnamefirst" are:
//0=displayname, 1=lastname first, 2=firstname first
pref("mail.addr_book.lastnamefirst", 0);
pref("mail.addr_book.displayName.autoGeneration", true);
pref("mail.addr_book.show_phonetic_fields", "chrome://messenger/locale/messenger.properties");
pref("mail.html_compose",                   true);
// you can specify multiple, option headers
// this will show up in the address picker in the compose window
// examples: "X-Face" or "Approved,X-No-Archive"
pref("mail.compose.other.header", "");
pref("mail.compose.autosave", true);
// interval in minutes
pref("mail.compose.autosaveinterval", 5);
pref("mail.compose.default_to_paragraph", false);

// 0=auto, 1=plain, 2=html, 3=both
pref("mail.default_send_format", 0);
// 0: Never 1: Always 2: Ask me
pref("mail.mdn.report.not_in_to_cc", 2);
// 0: Never 1: Always 2: Ask me
pref("mail.mdn.report.outside_domain", 2);
// 0: Never 1: Always 2: Ask me 3: Denial
pref("mail.mdn.report.other", 2);
// 0: Inbox/filter 1: Sent folder
pref("mail.incorporate.return_receipt", 0);
// 1: DSN 2: MDN 3: Both
pref("mail.request.return_receipt", 2);
// 0: MDN-DNT header  1: RRT header 2: Both (MC)
pref("mail.receipt.request_header_type", 0);
pref("mail.receipt.request_return_receipt_on", false);
// false: Never send true: Send sometimes
pref("mail.mdn.report.enabled", true);

pref("mail.dsn.always_request_on", false);
// DSN request is sent with SUCCESS option
pref("mail.dsn.request_on_success_on", true);
// DSN request is sent with FAILURE option
pref("mail.dsn.request_on_failure_on", true);
// DSN request is sent with DELAY option
pref("mail.dsn.request_on_delay_on", true);
// DSN request is not sent with NEVER option
pref("mail.dsn.request_never_on", false);
// DSN request is sent with RET FULL option
pref("mail.dsn.ret_full_on", true);

// false: Use global true: Use custom
pref("mail.identity.default.dsn_use_custom_prefs", false);
pref("mail.identity.default.dsn_always_request_on", false);

pref("news.show_size_in_lines", true);
pref("news.update_unread_on_expand", true);
pref("news.get_messages_on_select", true);

// list new groups created in the last number of days
pref("news.newgroups_for_num_days", 180);

pref("mailnews.wraplength", 72);

// 0=no header, 1="<author> wrote:", 2="On <date> <author> wrote:", 3="<author> wrote On <date>:", 4=user specified
pref("mailnews.reply_header_type", 1);
pref("mailnews.reply_header_authorwrotesingle", "chrome://messenger/locale/messengercompose/composeMsgs.properties");
pref("mailnews.reply_header_ondateauthorwrote", "chrome://messenger/locale/messengercompose/composeMsgs.properties");
pref("mailnews.reply_header_authorwroteondate", "chrome://messenger/locale/messengercompose/composeMsgs.properties");
pref("mailnews.reply_header_originalmessage",   "chrome://messenger/locale/messengercompose/composeMsgs.properties");
pref("mailnews.forward_header_originalmessage", "chrome://messenger/locale/messengercompose/composeMsgs.properties");

pref("mailnews.reply_to_self_check_all_ident", true);

pref("mailnews.reply_quoting_selection", true);
pref("mailnews.reply_quoting_selection.only_if_chars", "");
pref("mailnews.reply_quoting_selection.multi_word", true);

pref("mailnews.smtp.loglevel", "Warn");

pref("mailnews.nntp.loglevel", "Warn");

pref("mailnews.pop3.loglevel", "Warn");

// If true, ImapService.sys.mjs is used. Otherwise, nsImapService.cpp is used.
pref("mailnews.imap.jsmodule", false);
pref("mailnews.imap.loglevel", "Warn");

pref("mail.operate_on_msgs_in_collapsed_threads", false);
pref("mail.warn_on_collapsed_thread_operation", true);
pref("mail.warn_on_shift_delete", true);
pref("news.warn_on_delete", true);
pref("mail.warn_on_delete_from_trash", true);
pref("mail.purge_threshhold_mb", 200);
pref("mail.prompt_purge_threshhold", true);
pref("mail.purge.ask", true);

pref("mailnews.offline_sync_mail", false);
pref("mailnews.offline_sync_news", false);
pref("mailnews.offline_sync_send_unsent", true);
pref("mailnews.offline_sync_work_offline", false);
pref("mailnews.force_ascii_search", false);

// AppleDouble is causing problems with some webmail clients and Microsoft mail servers
// rejecting a MIME part of multipart/appledouble. Mac uses resource forks less and less
// so we only use AppleDouble if the file has no extension or its extension is whitelisted below.
// "" (default) - AppleDouble won't be used if the file has an extension
// "*" - AppleDouble will always be used
// Comma-separated list of extensions for which to use AppleDouble, for example "doc,xls" (not-case sensitive).
pref("mailnews.extensions_using_appledouble", "");
pref("mailnews.localizedRe", "chrome://messenger-region/locale/region.properties");

pref("mailnews.search_date_format", "chrome://messenger/locale/messenger.properties");
pref("mailnews.search_date_separator", "chrome://messenger/locale/messenger.properties");
pref("mailnews.search_date_leading_zeros", "chrome://messenger/locale/messenger.properties");
// used to decide whether to migrate global quoting prefs
pref("mailnews.quotingPrefs.version", 0);

// the first time, we'll warn the user about the blind send, and they can disable the warning if they want.
pref("mapi.blind-send.enabled", true);
// automatically move the user offline or online based on the network connection
pref("offline.autoDetect", false);

pref("ldap_2.autoComplete.useDirectory", false);
pref("ldap_2.autoComplete.directoryServer", "");

pref("ldap_2.servers.pab.position", 1);
pref("ldap_2.servers.pab.description", "chrome://messenger/locale/addressbook/addressBook.properties");
pref("ldap_2.servers.pab.dirType", 101);
pref("ldap_2.servers.pab.filename", "abook.sqlite");
pref("ldap_2.servers.pab.isOffline", false);

pref("ldap_2.servers.history.position", 2);
pref("ldap_2.servers.history.description", "chrome://messenger/locale/addressbook/addressBook.properties");
pref("ldap_2.servers.history.dirType", 101);
pref("ldap_2.servers.history.filename", "history.sqlite");
pref("ldap_2.servers.history.isOffline", false);

// default mapping of addressbook properties to ldap attributes
pref("ldap_2.servers.default.attrmap.FirstName", "givenName");
pref("ldap_2.servers.default.attrmap.LastName", "sn,surname");
pref("ldap_2.servers.default.attrmap.DisplayName", "cn,commonname");
pref("ldap_2.servers.default.attrmap.NickName", "mozillaNickname,xmozillanickname");
pref("ldap_2.servers.default.attrmap.PrimaryEmail", "mail");
pref("ldap_2.servers.default.attrmap.SecondEmail", "mozillaSecondEmail,xmozillasecondemail");
pref("ldap_2.servers.default.attrmap.WorkPhone", "telephoneNumber");
pref("ldap_2.servers.default.attrmap.HomePhone", "homePhone");
pref("ldap_2.servers.default.attrmap.FaxNumber", "facsimiletelephonenumber,fax");
pref("ldap_2.servers.default.attrmap.PagerNumber", "pager,pagerphone");
pref("ldap_2.servers.default.attrmap.CellularNumber", "mobile,cellphone,carphone");
pref("ldap_2.servers.default.attrmap.WorkAddress", "street,streetaddress,postOfficeBox");
pref("ldap_2.servers.default.attrmap.HomeAddress", "mozillaHomeStreet");
pref("ldap_2.servers.default.attrmap.WorkAddress2", "mozillaWorkStreet2");
pref("ldap_2.servers.default.attrmap.HomeAddress2", "mozillaHomeStreet2");
pref("ldap_2.servers.default.attrmap.WorkCity", "l,locality");
pref("ldap_2.servers.default.attrmap.HomeCity", "mozillaHomeLocalityName");
pref("ldap_2.servers.default.attrmap.WorkState", "st,region");
pref("ldap_2.servers.default.attrmap.HomeState", "mozillaHomeState");
pref("ldap_2.servers.default.attrmap.WorkZipCode", "postalCode,zip");
pref("ldap_2.servers.default.attrmap.HomeZipCode", "mozillaHomePostalCode");
pref("ldap_2.servers.default.attrmap.WorkCountry", "c,countryname");
pref("ldap_2.servers.default.attrmap.HomeCountry", "mozillaHomeCountryName");
pref("ldap_2.servers.default.attrmap.JobTitle", "title");
pref("ldap_2.servers.default.attrmap.Department", "ou,department,departmentnumber,orgunit");
pref("ldap_2.servers.default.attrmap.Company", "o,company");
pref("ldap_2.servers.default.attrmap._AimScreenName", "nsAIMid,nscpaimscreenname");
pref("ldap_2.servers.default.attrmap.WebPage1", "mozillaWorkUrl,workurl,labeledURI");
pref("ldap_2.servers.default.attrmap.WebPage2", "mozillaHomeUrl,homeurl");
pref("ldap_2.servers.default.attrmap.BirthYear", "birthyear");
pref("ldap_2.servers.default.attrmap.BirthMonth", "birthmonth");
pref("ldap_2.servers.default.attrmap.BirthDay", "birthday");
pref("ldap_2.servers.default.attrmap.Custom1", "mozillaCustom1,custom1");
pref("ldap_2.servers.default.attrmap.Custom2", "mozillaCustom2,custom2");
pref("ldap_2.servers.default.attrmap.Custom3", "mozillaCustom3,custom3");
pref("ldap_2.servers.default.attrmap.Custom4", "mozillaCustom4,custom4");
pref("ldap_2.servers.default.attrmap.Notes", "description,notes");
pref("ldap_2.servers.default.attrmap.LastModifiedDate", "modifytimestamp");

pref("ldap_2.user_id", 0);
// Update kCurrentListVersion in include/dirprefs.h if you change this
pref("ldap_2.version", 3);

pref("mailnews.ldap.loglevel", "Warn");

pref("mailnews.confirm.moveFoldersToTrash", true);

// space-delimited list of extra headers to add to .msf file
pref("mailnews.customDBHeaders", "");

// close standalone message window when deleting the displayed message
pref("mail.close_message_window.on_delete", false);

#ifdef MOZ_SUITE
pref("mailnews.reuse_message_window", true);
#endif
// warn user if they attempt to open more than this many messages at once
pref("mailnews.open_window_warning", 10);
// warn user if they attempt to open more than this many messages at once
pref("mailnews.open_tab_warning", 20);

pref("mailnews.start_page.enabled", true);

pref("mailnews.scroll_to_new_message", true);

// if true, any click on a column header other than the thread column will unthread the view
pref("mailnews.thread_pane_column_unthreads", false);

/* default prefs for Mozilla 5.0 */
pref("mail.identity.default.compose_html", true);
pref("mail.identity.default.valid", true);
pref("mail.identity.default.fcc", true);
pref("mail.identity.default.fcc_folder", "mailbox://nobody@Local%20Folders/Sent");
pref("mail.identity.default.fcc_reply_follows_parent", false);
pref("mail.identity.default.autocompleteToMyDomain", false);

pref("mail.identity.default.archive_enabled", true);
// archive into 0: single folder, 1: yearly folder, 2: year/year-month folder
pref("mail.identity.default.archive_granularity", 1);
pref("mail.identity.default.archive_keep_folder_structure", false);

// keep these defaults for backwards compatibility and migration

// but .doBcc and .doBccList are the right ones from now on.
pref("mail.identity.default.bcc_self", false);
pref("mail.identity.default.bcc_others", false);
pref("mail.identity.default.bcc_list", "");

pref("mail.identity.default.draft_folder", "mailbox://nobody@Local%20Folders/Drafts");
pref("mail.identity.default.stationery_folder", "mailbox://nobody@Local%20Folders/Templates");
pref("mail.identity.default.directoryServer", "");
pref("mail.identity.default.overrideGlobal_Pref", false);
pref("mail.identity.default.auto_quote", true);
// 0=bottom 1=top 2=select
pref("mail.identity.default.reply_on_top", 0);
// true=below quoted false=above quoted
pref("mail.identity.default.sig_bottom", true);
// Include signature on fwd?
pref("mail.identity.default.sig_on_fwd", false);
// Include signature on re?
pref("mail.identity.default.sig_on_reply", true);

// Suppress double-dash signature separator
pref("mail.identity.default.suppress_signature_separator", false);

// default to archives folder on same server.
pref("mail.identity.default.archives_folder_picker_mode", "0");

// Headers to always add to outgoing mail
// examples: "header1,header2"
// pref("mail.identity.id1.headers", "header1");
// user_pref("mail.identity.id1.header.header1", "X-Mozilla-Rocks: True")
pref("mail.identity.default.headers", "");

// by default, only collect addresses the user sends to (outgoing)
// incoming is all spam anyways
#ifdef MOZ_SUITE
pref("mail.collect_email_address_incoming", false);
pref("mail.collect_email_address_newsgroup", false);
#endif
pref("mail.collect_email_address_outgoing", true);
// by default, use the Collected Addressbook for collection
pref("mail.collect_addressbook", "jsaddrbook://history.sqlite");

pref("mail.default_sendlater_uri", "mailbox://nobody@Local%20Folders/Unsent%20Messages");

pref("mail.server.default.clientid", "");
pref("mail.smtpserver.default.clientid", "");

// This is not to be enabled by default until the prerequisite
// changes are completed. See here for details:
//  https://bugzilla.mozilla.org/show_bug.cgi?id=1565379
pref("mail.server.default.clientidEnabled", false);
pref("mail.smtpserver.default.clientidEnabled", false);

// This limits the number of simultaneous SMTP connection to a server.
// Currently if this is set to other than 1, it is changed to 1 internally, so
// only 1 connection per server can actually occur.
pref("mail.smtpserver.default.max_cached_connections", 1);

// If set greater than 0, this limits the number of messages that can be sent
// serially on an SMTP connection before the connection is closed and a new
// connection is established to handle any additional messages, also subject to
// this limit. Setting this to zero or less removes any message count per
// connection limit.
pref("mail.smtpserver.default.max_messages_per_connection", 10);

pref("mail.smtpservers", "");
pref("mail.accountmanager.accounts", "");

// Last used account key value
pref("mail.account.lastKey", 0);

pref("mail.server.default.port", -1);
pref("mail.server.default.offline_support_level", -1);
pref("mail.server.default.leave_on_server", false);
pref("mail.server.default.download_on_biff", false);
pref("mail.server.default.check_time", 10);
pref("mail.server.default.delete_by_age_from_server", false);
pref("mail.server.default.num_days_to_leave_on_server", 7);
pref("mail.server.default.limit_offline_message_size", false);
pref("mail.server.default.max_size", 50);
pref("mail.server.default.delete_mail_left_on_server", false);
pref("mail.server.default.valid", true);
pref("mail.server.default.abbreviate", true);
pref("mail.server.default.isSecure", false);
// cleartext password. @see nsIMsgIncomingServer.authMethod.
pref("mail.server.default.authMethod", 3);
// @see nsIMsgIncomingServer.socketType
pref("mail.server.default.socketType", 0);
pref("mail.server.default.override_namespaces", true);
pref("mail.server.default.deferred_to_account", "");

pref("mail.server.default.delete_model", 1);
pref("mail.server.default.fetch_by_chunks", true);
// Send IMAP RFC 2971 ID Info to server
pref("mail.server.default.send_client_info", true);
pref("mail.server.default.always_authenticate", false);
pref("mail.server.default.singleSignon", true);
pref("mail.server.default.max_articles", 500);
pref("mail.server.default.notify.on", true);
pref("mail.server.default.mark_old_read", false);
pref("mail.server.default.empty_trash_on_exit", false);
// 0 = Keep Dupes, leave them alone
// 1 = delete dupes
// 2 = Move Dupes to trash
// 3 = Mark Dupes as Read
pref("mail.server.default.dup_action", 0);
pref("mail.server.default.hidden", false);

pref("mail.server.default.using_subscription", true);
pref("mail.server.default.dual_use_folders", true);
pref("mail.server.default.canDelete", false);
pref("mail.server.default.login_at_startup", false);
pref("mail.server.default.allows_specialfolders_usage", true);
pref("mail.server.default.canCreateFolders", true);
pref("mail.server.default.canFileMessages", true);

// special enhancements for IMAP servers
pref("mail.server.default.is_gmail", false);
pref("mail.server.default.use_idle", true);
// in case client or server has bugs in condstore implementation
pref("mail.server.default.use_condstore", false);
// in case client or server has bugs in compress implementation
pref("mail.server.default.use_compress_deflate", true);
// for spam
// 0 off, 100 on.  not doing bool since we might have real levels one day.
pref("mail.server.default.spamLevel", 100);
pref("mail.server.default.moveOnSpam", false);
// 0 == "Junk" on server, 1 == specific folder
pref("mail.server.default.moveTargetMode", 0);
pref("mail.server.default.spamActionTargetAccount", "");
pref("mail.server.default.spamActionTargetFolder", "");
pref("mail.server.default.useWhiteList", true);
// the Personal addressbook.
pref("mail.server.default.whiteListAbURI", "jsaddrbook://abook.sqlite");
pref("mail.server.default.useServerFilter", false);
pref("mail.server.default.serverFilterName", "SpamAssassin");
// 1 == trust positives, 2 == trust negatives, 3 == trust both
pref("mail.server.default.serverFilterTrustFlags", 1);
pref("mail.server.default.purgeSpam", false);
// 14 days
pref("mail.server.default.purgeSpamInterval", 14);
pref("mail.server.default.check_all_folders_for_new", false);
// should we inhibit whitelisting of the email addresses for a server's identities?
pref("mail.server.default.inhibitWhiteListingIdentityUser", true);
// should we inhibit whitelisting of the domain for a server's identities?
pref("mail.server.default.inhibitWhiteListingIdentityDomain", false);

// For sending imap SELECT when checking for new mail. Has been needed by some
// servers that don't properly support imap NOOP for new mail detection.
pref("mail.server.default.force_select_imap", false);

// to activate auto-sync feature (preemptive message download for imap) by default
pref("mail.server.default.autosync_offline_stores",true);
pref("mail.server.default.offline_download",true);

// -1 means no limit, no purging of offline stores.
pref("mail.server.default.autosync_max_age_days", -1);

// Can we change the store type without conversion? (=has the store been used)
pref("mail.server.default.canChangeStoreType", false);

// Enable use of imap capability UTF8=ACCEPT described in RFC 6855.
pref("mail.server.default.allow_utf8_accept", true);

// Store conversion (mbox <-> maildir)
#ifndef RELEASE_OR_BETA
pref("mail.store_conversion_enabled", true);
#else
pref("mail.store_conversion_enabled", false);
#endif

// Time between applications of periodic filters
pref("mail.server.default.periodicFilterRateMinutes", 10);

pref("mail.periodicfilters.loglevel", "Warn");

// This is the default store contractID for newly created servers.
// We don't use mail.server.default because we want to ensure that the
// store contract id is always written out to prefs.js
pref("mail.serverDefaultStoreContractID", "@mozilla.org/msgstore/berkeleystore;1");
// the probablilty threshold over which messages are classified as junk
// this number is divided by 100 before it is used. The classifier can be fine tuned
// by changing this pref. Typical values are .99, .95, .90, .5, etc.
pref("mail.adaptivefilters.junk_threshold", 90);
pref("mail.spam.logging.enabled", false);
pref("mail.spam.manualMark", false);
pref("mail.spam.markAsReadOnSpam", false);
// 0 == "move to junk folder", 1 == "delete"
pref("mail.spam.manualMarkMode", 0);
pref("mail.spam.markAsNotJunkMarksUnRead", true);
// display simple html for html junk messages
pref("mail.spam.display.sanitize", true);
// the number of allowed bayes tokens before the database is shrunk
pref("mailnews.bayesian_spam_filter.junk_maxtokens", 100000);

// pref to warn the users of exceeding the size of the message being composed. (Default 20MB).
pref("mailnews.message_warning_size", 20971520);

// set default traits for junk and good. Index should match the values in nsIJunkMailPlugin
pref("mailnews.traits.id.1", "mailnews@mozilla.org#good");
pref("mailnews.traits.name.1", "Good");
pref("mailnews.traits.enabled.1", false);
pref("mailnews.traits.id.2", "mailnews@mozilla.org#junk");
pref("mailnews.traits.name.2", "Junk");
pref("mailnews.traits.enabled.2", true);
pref("mailnews.traits.antiId.2", "mailnews@mozilla.org#good");
// traits 3 - 1000 are reserved for use by mailnews@mozilla.org
// the first externally defined trait will have index 1001
pref("mailnews.traits.lastIndex", 1000);

// Show extra column in address entry. This is numeric for
// historical reasons: 0 = no extra column, 1 = show extra column.
pref("mail.autoComplete.commentColumn", 0);

// if true, we'll use the password from an incoming server with
// matching username and domain
pref("mail.smtp.useMatchingDomainServer", false);

// if true, we'll use the password from an incoming server with
// matching username and host name
pref("mail.smtp.useMatchingHostNameServer", false);

// if true, we'll use the email sender's address for the smtp
// MAIL FROM, which might become the return-path. If false
// we use the identity email address, which is the old behaviour
pref("mail.smtp.useSenderForSmtpMailFrom", true);
// cleartext password. @see nsIMsgIncomingServer.authMethod.
pref("mail.smtpserver.default.authMethod", 3);
// @see nsIMsgOutgoingServer.socketType
pref("mail.smtpserver.default.try_ssl", 0);

// If true, SMTP LOGIN auth and POP3 USER/PASS auth, the last of the methods to try, will use Latin1.
pref("mail.smtp_login_pop3_user_pass_auth_is_latin1", true);

// Strip CSS conditional rules in received and sent mail
pref("mail.html_sanitize.drop_conditional_css", true);

// For the next 3 prefs, see <http://www.bucksch.org/1/projects/mozilla/16507>
// TXT->HTML :-) etc. in viewer
pref("mail.display_glyph", true);
// TXT->HTML *bold* etc. in viewer; ditto
pref("mail.display_struct", true);
// HTML->HTML *bold* etc. during Send; ditto
pref("mail.send_struct", false);
// display time and date using senders timezone in message pane and when printing
pref("mailnews.display.date_senders_timezone", false);
// For the next 4 prefs, see <http://www.bucksch.org/1/projects/mozilla/108153>
// Ignore HTML parts in multipart/alternative
pref("mailnews.display.prefer_plaintext", false);
// How to display HTML/MIME parts.
// 0 = Render the sender's HTML;
// 1 = HTML->TXT->HTML;
// 2 = Show HTML source;
// 3 = Sanitize HTML;
// 4 = Show all body parts
pref("mailnews.display.html_as", 0);
// Whether the View > Message body as > All body parts menu item is available
pref("mailnews.display.show_all_body_parts_menu", false);
// whether to drop <font>, <center>, align='...', etc.
pref("mailnews.display.html_sanitizer.drop_non_css_presentation", true);
// whether to drop <img>, <video> and <audio>
pref("mailnews.display.html_sanitizer.drop_media", false);
// Let only a few classes process incoming data. This protects from bugs (e.g. buffer overflows) and from security loopholes
// (e.g. allowing unchecked HTML in some obscure classes, although the user has html_as > 0).
pref("mailnews.display.disallow_mime_handlers", 0);
// This option is mainly for the UI of html_as.
// 0 = allow all available classes
// 1 = Use hardcoded blacklist to avoid rendering (incoming) HTML
// 2 = ... and inline images
// 3 = ... and some other uncommon content types
// 100 = Use hardcoded whitelist to avoid even more bugs(buffer overflows).
//       This mode will limit the features available (e.g. uncommon
//       attachment types and inline images) and is for paranoid users.

// RSS rendering options, see prior 4 prefs above.
pref("rss.display.prefer_plaintext", false);
pref("rss.display.html_as", 0);
pref("rss.display.disallow_mime_handlers", 0);

// Feed message display (summary or web page), on select.
// 0 - global override, load web page
// 1 - global override, load summary
// 2 - use default feed folder setting from Subscribe dialog; if no setting default to 1
pref("rss.show.summary", 1);

// Feed message display (summary or web page), on open.
// Action on double click or enter in threadpane for a feed message.
// 0 - open content-base url in new window
// 1 - open summary in new window
// 2 - toggle load summary and content-base url in message pane
// 3 - load content-base url in browser
pref("rss.show.content-base", 0);

// Feed message additional web page display.
// 0 - no action
// 1 - load web page in default browser, on select
pref("rss.message.loadWebPageOnSelect", 0);

// Feed auto updates / "Pause Updates"
// true  = If updating a feed results in an error code, disable the feed until next manual check or application restart.
// false = Keep feed automatic updates scheduled, even if the feed source responds with an error code.
pref("rss.disable_feeds_on_update_failure", true);

pref("feeds.loglevel", "Warn");

// 0=default as attachment
// 1=forward as quoted (mapped to 2 in mozilla)
// 2=forward as inline with attachments, (obsolete 4.x value)
pref("mail.forward_message_mode", 0);
// add .eml extension when forwarding as attachment
pref("mail.forward_add_extension", true);
// Prefix of for mail forwards. E.g. "Fwd" -> subject will be Fwd: <subject>
pref("mail.forward_subject_prefix", "Fwd");

pref("mail.startup.enabledMailCheckOnce", false);
// RFC 2646=======
pref("mailnews.send_plaintext_flowed", true);
pref("mailnews.display.disable_format_flowed_support", false);
// prompt user when crossing folders
pref("mailnews.nav_crosses_folders", 1);

// these two news.cancel.* prefs are for use by QA for automated testing.  see bug #31057
pref("news.cancel.confirm", true);
pref("news.cancel.alert_on_success", true);
pref("mail.SpellCheckBeforeSend", false);
pref("mail.spellcheck.inline", true);
// enable / disable phishing detection for link clicks
pref("mail.phishing.detection.enabled", true);
pref("mail.warn_on_send_accel_key", true);
pref("mail.enable_autocomplete", true);
pref("mailnews.global_html_domains.version", 1);

/////////////////////////////////////////////////////////////////
// Privacy Controls for Handling Remote Content
/////////////////////////////////////////////////////////////////
pref("mailnews.message_display.disable_remote_image", true);

/////////////////////////////////////////////////////////////////
// Trusted Mail Domains
//
// Specific domains can be white listed to bypass various privacy controls in Thunderbird
// such as blocking remote images, the phishing detector, etc. This is particularly
// useful for business deployments where images or links reference servers inside a
// corporate intranet. For multiple domains, separate them with a comma. i.e.
// pref("mail.trusteddomains", "mozilla.org,mozillafoundation.org");
/////////////////////////////////////////////////////////////////
pref("mail.trusteddomains", "");

pref("mail.imap.use_status_for_biff", true);
// in percent. when the quota meter starts showing up at all. decrease this for it to be more than a warning.
pref("mail.quota.mainwindow_threshold.show", 75);
// when it gets yellow
pref("mail.quota.mainwindow_threshold.warning", 80);
// when it gets red
pref("mail.quota.mainwindow_threshold.critical", 95);

// Pref controlling the updates on the pre-configured accounts.
// In order to add new pre-configured accounts (after a version),
// increase the following version number besides updating the
// pref mail.accountmanager.appendaccounts
pref("mailnews.append_preconfig_accounts.version", 1);

// Pref controlling the updates on the pre-configured smtp servers.
// In order to add new pre-configured smtp servers (after a version),
// increase the following version number besides updating the
// pref mail.smtpservers.appendsmtpservers
pref("mail.append_preconfig_smtpservers.version", 1);

pref("mail.biff.alert.show_preview", true);
pref("mail.biff.alert.show_subject", true);
pref("mail.biff.alert.show_sender",  true);
pref("mail.biff.alert.preview_length", 40);

#ifdef XP_MACOSX
pref("mail.biff.play_sound", false);
#else
pref("mail.biff.play_sound", true);
#endif
// 0 == default system sound, 1 == user specified wav
pref("mail.biff.play_sound.type", 0);
// _moz_mailbeep is a magic key, for the default sound.
// otherwise, this needs to be a file url
pref("mail.biff.play_sound.url", "");
pref("mail.biff.show_alert", true);
#ifdef XP_WIN
pref("mail.biff.show_badge", true);
pref("mail.biff.show_tray_icon", true);
pref("mail.biff.show_tray_icon_always", false);
pref("mail.biff.use_system_alert", false);
#elifdef XP_MACOSX
pref("mail.biff.animate_dock_icon", false);
#elifdef XP_UNIX
pref("mail.biff.use_system_alert", true);
#endif

// add jitter to biff interval
pref("mail.biff.add_interval_jitter", true);

#ifdef MOZ_SUITE
// if true, check for new mail even when opening non-mail windows
pref("mail.biff.on_new_window", true);
#endif

#ifdef XP_MACOSX
// If true, the number shown in the badge will be the the number of "new"
// messages, as per the classic Thunderbird definition. Defaults to false, which
// notifies about the number of unread messages.
pref("mail.biff.use_new_count_in_badge", false);
#endif
#ifdef XP_WIN
pref("mail.biff.use_new_count_in_badge", true);
#endif

// For feed account serverType=rss sound on biff.
// Allow for a different sound to be played for new feed articles.
pref("mail.feed.play_sound", false);
pref("mail.feed.play_sound.type", 0);
pref("mail.feed.play_sound.url", "");

// Content disposition for attachments (except binary files and vcards).
//   0= Content-Disposition: inline
//   1= Content-Disposition: attachment
pref("mail.content_disposition_type", 1);

// Experimental option to send message in the background - don't wait to close window.
pref("mailnews.sendInBackground", false);
// Will show a progress dialog when saving or sending a message
pref("mailnews.show_send_progress", true);
pref("mail.server.default.retainBy", 1);

pref("mailnews.ui.junk.manualMarkAsJunkMarksRead", true);

// for manual upgrades of certain UI features.
// 1 -> 2 is for the folder pane tree landing, to hide the
// unread and total columns, see messenger.js
pref("mail.ui.folderpane.version", 1);

// for manual upgrades of certain UI features.
// 1 -> 2 is for the ab results pane tree landing
// to hide the non default columns in the addressbook dialog
// see abCommon.js and addressbook.js
pref("mailnews.ui.addressbook_results.version", 1);
// for manual upgrades of certain UI features.
// 1 -> 2 is for the ab results pane tree landing
// to hide the non default columns in the addressbook sidebar panel
// see abCommon.js and addressbook-panel.js
pref("mailnews.ui.addressbook_panel_results.version", 1);
// for manual upgrades of certain UI features.
// 1 -> 2 is for the ab results pane tree landing
// to hide the non default columns in the select addresses dialog
// see abCommon.js and abSelectAddressesDialog.js
pref("mailnews.ui.select_addresses_results.version", 1);
// for manual upgrades of certain UI features.
// 1 -> 2 is for the ab results pane
// to hide the non default columns in the advanced directory search dialog
// see abCommon.js and abSearchDialog.js
pref("mailnews.ui.advanced_directory_search_results.version", 1);

// default description and color prefs for tags
// (we keep the .labels. names for backwards compatibility)
pref("mailnews.labels.description.1", "chrome://messenger/locale/messenger.properties");
pref("mailnews.labels.description.2", "chrome://messenger/locale/messenger.properties");
pref("mailnews.labels.description.3", "chrome://messenger/locale/messenger.properties");
pref("mailnews.labels.description.4", "chrome://messenger/locale/messenger.properties");
pref("mailnews.labels.description.5", "chrome://messenger/locale/messenger.properties");
// default: red
pref("mailnews.labels.color.1", "#FF0000");
// default: orange
pref("mailnews.labels.color.2", "#FF9900");
// default: green
pref("mailnews.labels.color.3", "#009900");
// default: blue
pref("mailnews.labels.color.4", "#3333FF");
// default: purple
pref("mailnews.labels.color.5", "#993399");

// Whether the colors from tags should be applied only to the message(s)
// actually tagged, or also to any collapsed threads which contain tagged
// messages.
pref("mailnews.display_reply_tag_colors_for_collapsed_threads", true);

//default null headers
//example "X-Warn: XReply", list of hdrs separated by ": "
pref("mailnews.customHeaders", "");

// default msg compose font prefs
pref("msgcompose.font_face", "");
pref("msgcompose.font_size", "3");
// If true, let the user agent use default colors (don't set text_color and
// background_color on the message body).
pref("msgcompose.default_colors", true);
pref("msgcompose.text_color", "#000000");
pref("msgcompose.background_color", "#FFFFFF");

// When there is no disclosed recipients (only bcc), we should address the message to empty group
// to prevent some mail server to disclose the bcc recipients
pref("mail.compose.add_undisclosed_recipients", true);

pref("mail.compose.dontWarnMail2Newsgroup", false);

// Attach http image resources to composed messages.
pref("mail.compose.attach_http_images", false);

// Headers to check to find the right from identity to use when catchAll is active.
pref("mail.compose.catchAllHeaders", "delivered-to, envelope-to, x-original-to, to, cc");

// these prefs (in minutes) are here to help QA test this feature
// "mail.purge.min_delay", never purge a junk folder more than once every 480 minutes (60 mins/hour * 8 hours)
// "mail.purge.timer_interval", fire the purge timer every 5 minutes, starting 5 minutes after we load accounts
pref("mail.purge.min_delay", 480);
pref("mail.purge.timer_interval", 5);

// Set to false if opening a message in the standalone message window or viewing
// it in the message pane should never mark it as read.
pref("mailnews.mark_message_read.auto", true);

// Set to true if viewing a message should mark it as read after the msg is
// viewed in the message pane for a specified time interval in seconds.
pref("mailnews.mark_message_read.delay", false);
// measured in seconds
pref("mailnews.mark_message_read.delay.interval", 5);

// delay after which messages are showed when moving through them with cursors
// during thread pane navigation
// measured in milliseconds
pref("mailnews.threadpane_select_delay", 250);

// require a password before showing imap or local headers in thread pane
pref("mail.password_protect_local_cache", false);

// import option to skip the first record, recorded so that we can save
// the users last used preference.
pref("mailnews.import.text.skipfirstrecord", true);

#ifdef MOZ_SUITE
// automatically scale attached images that are displayed inline
pref("mail.enable_automatic_image_resizing", true);
#endif

#ifdef XP_WIN
pref("ldap_2.servers.outlook.uri", "moz-aboutlookdirectory:///");
pref("ldap_2.servers.outlook.description", "chrome://messenger/locale/addressbook/addressBook.properties");
// Set to 3 to enable.
pref("ldap_2.servers.outlook.dirType", -1);
#endif
#ifdef XP_MACOSX
pref("ldap_2.servers.osx.uri", "moz-abosxdirectory:///");
pref("ldap_2.servers.osx.description", "chrome://messenger/locale/addressbook/addressBook.properties");
pref("ldap_2.servers.osx.dirType", 3);
pref("mail.notification.sound", "");
#endif
pref("mail.notification.count.inbox_only", true);
pref("mail.notification.loglevel", "Warn");

// For the Empty Junk/Trash confirmation dialogs.
pref("mailnews.emptyJunk.dontAskAgain", false);
pref("mailnews.emptyTrash.dontAskAgain", false);

// where to fetch auto config information from.
pref("mailnews.auto_config_url", "https://live.thunderbird.net/autoconfig/v1.1/");
// The list of addons which can handle certain account types
pref("mailnews.auto_config.addons_url", "https://live.thunderbird.net/autoconfig/addons.json");
// Allow to contact the ISP (email address domain).
// This may happen via insecure means (HTTP) susceptible to eavesdropping
// and MitM (see mailnews.auto_config.fetchFromISP.sslOnly below).
pref("mailnews.auto_config.fetchFromISP.enabled", true);
// Allow the username to be sent to the ISP when fetching.
// Note that the username will leak in plaintext if a non-SSL fetch is
// performed.
pref("mailnews.auto_config.fetchFromISP.sendEmailAddress", true);
// Allow only SSL channels when fetching config from ISP.
// If false, an active attacker can block SSL fetches and then
// MITM the HTTP fetch, determining the config that is shown to the user.
// However:
// 1. The user still needs to explicitly approve the false config.
// 2. Most hosters that offer this ISP config do so on HTTP and not on HTTPS.
//    That's because they direct customer domains (HTTP) to their provider
//    config (HTTPS). If you set this to true, you simply break this mechanism.
//    You will simply not get most configs.
// 3. There are guess config and AutoDiscover config mechanisms which
//    have the exact same problem. In order to mitigate those additional
//    vectors, set the following prefs accordingly:
//     * mailnews.auto_config.guess.sslOnly = true
//     * mailnews.auto_config.fetchFromExchange.enabled = false
// Not all mail servers support SSL so enabling this option might lock
// you out from your ISP. This especially affect internal mail servers.
pref("mailnews.auto_config.fetchFromISP.sslOnly", false);
// Allow the Microsoft Exchange AutoDiscover protocol.
// This also sends the email address and password to the server,
// which the protocol unfortunately requires in practice.
pref("mailnews.auto_config.fetchFromExchange.enabled", true);
// Whether we will attempt to guess the account configuration based on
// protocol default ports and common domain practices
// (e.g. {mail,pop,imap,smtp}.<email-domain>).
pref("mailnews.auto_config.guess.enabled", true);
// Allow only SSL configs when guessing.
// An attacker could block SSL to force plaintext and thus be able to
// eavesdrop. Compared to mailnews.auto_config.fetchFromISP.sslOnly
// the attacker cannot determine the config, just pick which one it
// likes best among those Thunderbird generates for the user based on
// the email address.
// Not all mail servers support SSL so enabling this option might lock
// you out from your ISP. This especially affect internal mail servers.
pref("mailnews.auto_config.guess.sslOnly", false);
// When connecting to a server for guessing, either require a good
// certificate, or allow connecting anyway.
pref("mailnews.auto_config.guess.requireGoodCert", true);
// The timeout (in seconds) for each guess
pref("mailnews.auto_config.guess.timeout", 10);
// Work around bug 1454325 by disabling mimetype mungling in XmlHttpRequest
pref("dom.xhr.standard_content_type_normalization", false);

// -- Summary Database options
// dontPreserveOnCopy: a space separated list of properties that are not
//                     copied to the new nsIMsgHdr when a message is copied.
//                     Allows extensions to control preservation of properties.
pref("mailnews.database.summary.dontPreserveOnCopy",
  "account msgOffset threadParent msgThreadId statusOfset flags size numLines ProtoThreadFlags label gloda-id gloda-dirty storeToken");

// dontPreserveOnMove: a space separated list of properties that are not
//                     copied to the new nsIMsgHdr when a message is moved.
//                     Allows extensions to control preservation of properties.
pref("mailnews.database.summary.dontPreserveOnMove",
  "account msgOffset threadParent msgThreadId statusOfset flags size numLines ProtoThreadFlags label storeToken");
// Should we output dbcache log? Set to "Debug" to show.
pref("mailnews.database.dbcache.loglevel", "Warn");

// -- Global Database (gloda) options
// Should the indexer be enabled?
pref("mailnews.database.global.indexer.enabled", false);
pref("gloda.loglevel", "Warn");
pref("gloda.test.loglevel", "Warn");
// Rate of growth of the gloda cache, whose maximum value is 8 MiB and max is 64 MiB.
// See more: https://developer.mozilla.org/en/Thunderbird/gloda#Cache_Size"
pref("mailnews.database.global.datastore.cache_to_memory_permillage", 10);

// default field order in the fieldmap
pref("mailnews.import.text.fieldmap", "+0,+1,+2,+3,+4,+5,+36,+6,+7,+8,+9,+10,+11,+12,+13,+14,+15,+16,+17,+18,+19,+20,+21,+22,+23,+24,+25,+26,+27,+28,+29,+30,+31,+32,+33,+34,+35");

// On networks deploying QoS, it is recommended that these be lockpref()'d,
// since inappropriate marking can easily overwhelm bandwidth reservations
// for certain services (i.e. EF for VoIP, AF4x for interactive video,
// AF3x for broadcast/streaming video, etc)

// default value for SMTP and POP3.
// in a DSCP environment this should be 48 (0x30, or AF12) per RFC-4594,
// Section 4.8 "High-Throughput Data Service Class"
pref("mail.pop3.qos", 0);
pref("mail.smtp.qos", 0);
pref("mail.nntp.qos", 0);

// default value for IMAP4
// in a DSCP environment this should be 56 (0x38, or AF13), ibid.
pref("mail.imap.qos", 0);

// PgpMime Addon
pref("mail.pgpmime.addon_url", "https://addons.mozilla.org/addon/enigmail/");

pref("mail.asyncprompter.loglevel", "Warn");

pref("mail.mailstoreconverter.loglevel", "Warn");

pref("mail.jsaccount.loglevel", "Warn");

pref("mailnews.oauth.loglevel", "Warn");

// Using a private browser for OAuth sign-in causes issues when the provider is
// expecting a device identifier from the browser. However, not all providers
// have been tested with non-private browsers and there is potential for
// existing session information to cause interference when signing into multiple
// accounts.
pref("mailnews.oauth.usePrivateBrowser", false);

pref("test.loghelper.loglevel", "Warn");

pref("mail.import.loglevel", "Warn");

pref("mail.export.loglevel", "Warn");

// When true, disk cache is used for messages not in offline store. If false,
// memory cache is used instead. Both use the cache2 implementation.
pref("mail.imap.use_disk_cache2", true);

#ifdef MOZ_THUNDERBIRD_RUST
// Enable support for Microsoft Exchange via Exchange Web Services.
pref("experimental.mail.ews.enabled", false);
#endif
