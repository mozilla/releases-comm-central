/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include <stdio.h>
#include "nsMimeHtmlEmitter.h"
#include "plstr.h"
#include "nsMailHeaders.h"
#include "nscore.h"
#include "nsEmitterUtils.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIMimeStreamConverter.h"
#include "nsIMsgWindow.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsMimeTypes.h"
#include "prtime.h"
#include "prprf.h"
#include "nsStringEnumerator.h"
#include "nsServiceManagerUtils.h"
// hack: include this to fix opening news attachments.
#include "nsINntpUrl.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"
#include "nsMemory.h"
#include "mozilla/Components.h"
#include "nsIMailChannel.h"
#include "nsIProgressEventSink.h"

#define VIEW_ALL_HEADERS 2

/*
 * nsMimeHtmlEmitter definitions....
 */
nsMimeHtmlDisplayEmitter::nsMimeHtmlDisplayEmitter() : nsMimeBaseEmitter() {
  mFirst = true;
  mSkipAttachment = false;
}

nsMimeHtmlDisplayEmitter::~nsMimeHtmlDisplayEmitter(void) {}

nsresult nsMimeHtmlDisplayEmitter::Init() { return NS_OK; }

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTMLPrefix(
    const nsACString& name) {
  if ((mFormat == nsMimeOutput::nsMimeMessageSaveAs) ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTMLPrefix(name);
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTML(const char* field,
                                                        const char* value) {
  if ((mFormat == nsMimeOutput::nsMimeMessageSaveAs) ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTML(field, value);
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTMLPostfix() {
  if ((mFormat == nsMimeOutput::nsMimeMessageSaveAs) ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTMLPostfix();
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::BroadcastHeaders(int32_t aHeaderMode) {
  nsresult rv;
  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(mChannel, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString extraExpandedHeaders;
  nsTArray<nsCString> extraExpandedHeadersArray;
  nsCString extraAddonHeaders;
  nsTArray<nsCString> extraAddonHeadersArray;
  nsAutoCString convertedDateString;
  bool pushAllHeaders = false;
  bool checkExtraHeaders = false;
  bool checkAddonHeaders = false;
  nsCString otherHeaders;
  nsTArray<nsCString> otherHeadersArray;
  bool checkOtherHeaders = false;

  nsCOMPtr<nsIPrefBranch> pPrefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (pPrefBranch) {
    pPrefBranch->GetCharPref("mailnews.headers.extraExpandedHeaders",
                             extraExpandedHeaders);
    if (!extraExpandedHeaders.IsEmpty()) {
      ToLowerCase(extraExpandedHeaders);
      ParseString(extraExpandedHeaders, ' ', extraExpandedHeadersArray);
      checkExtraHeaders = true;
    }

    pPrefBranch->GetCharPref("mailnews.headers.extraAddonHeaders",
                             extraAddonHeaders);
    if (!extraAddonHeaders.IsEmpty()) {
      // Push all headers if extraAddonHeaders is "*".
      if (extraAddonHeaders.EqualsLiteral("*")) {
        pushAllHeaders = true;
      } else {
        ToLowerCase(extraAddonHeaders);
        ParseString(extraAddonHeaders, ' ', extraAddonHeadersArray);
        checkAddonHeaders = true;
      }
    }

    pPrefBranch->GetCharPref("mail.compose.other.header", otherHeaders);
    if (!otherHeaders.IsEmpty()) {
      ToLowerCase(otherHeaders);
      ParseString(otherHeaders, ',', otherHeadersArray);
      for (uint32_t i = 0; i < otherHeadersArray.Length(); i++) {
        otherHeadersArray[i].Trim(" ");
      }

      checkOtherHeaders = true;
    }
  }

  for (size_t i = 0; i < mHeaderArray->Length(); i++) {
    headerInfoType* headerInfo = mHeaderArray->ElementAt(i);
    if ((!headerInfo) || (!headerInfo->name) || (!(*headerInfo->name)) ||
        (!headerInfo->value) || (!(*headerInfo->value)))
      continue;

    // optimization: if we aren't in view all header view mode, we only show a
    // small set of the total # of headers. don't waste time sending those out
    // to the UI since the UI is going to ignore them anyway.
    if (aHeaderMode != VIEW_ALL_HEADERS &&
        (mFormat != nsMimeOutput::nsMimeMessageFilterSniffer)) {
      bool skip = true;
      const char* headerName = headerInfo->name;
      if (pushAllHeaders) {
        skip = false;

        // Accept the following:
      } else if (!PL_strcasecmp("to", headerName) ||
                 !PL_strcasecmp("from", headerName) ||
                 !PL_strcasecmp("cc", headerName) ||
                 !PL_strcasecmp("newsgroups", headerName) ||
                 !PL_strcasecmp("bcc", headerName) ||
                 !PL_strcasecmp("followup-to", headerName) ||
                 !PL_strcasecmp("reply-to", headerName) ||
                 !PL_strcasecmp("subject", headerName) ||
                 !PL_strcasecmp("organization", headerName) ||
                 !PL_strcasecmp("user-agent", headerName) ||
                 !PL_strcasecmp("content-base", headerName) ||
                 !PL_strcasecmp("sender", headerName) ||
                 !PL_strcasecmp("date", headerName) ||
                 !PL_strcasecmp("x-mailer", headerName) ||
                 !PL_strcasecmp("content-type", headerName) ||
                 !PL_strcasecmp("message-id", headerName) ||
                 !PL_strcasecmp("x-newsreader", headerName) ||
                 !PL_strcasecmp("x-mimeole", headerName) ||
                 !PL_strcasecmp("references", headerName) ||
                 !PL_strcasecmp("in-reply-to", headerName) ||
                 !PL_strcasecmp("list-post", headerName) ||
                 !PL_strcasecmp("delivered-to", headerName)) {
        skip = false;

      } else if (checkExtraHeaders || checkAddonHeaders || checkOtherHeaders) {
        // Make headerStr lowercase because
        // extraExpandedHeaders/extraAddonHeadersArray was made lowercase above.
        nsDependentCString headerStr(headerInfo->name);
        ToLowerCase(headerStr);
        // Accept if it's an "extra" header.
        if (checkExtraHeaders && extraExpandedHeadersArray.Contains(headerStr))
          skip = false;
        if (checkAddonHeaders && extraAddonHeadersArray.Contains(headerStr))
          skip = false;
        if (checkOtherHeaders && otherHeadersArray.Contains(headerStr))
          skip = false;
      }

      if (skip) continue;
    }

    const char* headerValue = headerInfo->value;
    mailChannel->AddHeaderFromMIME(nsDependentCString(headerInfo->name),
                                   nsDependentCString(headerValue));

    // Add a localized version of the date header if we encounter it.
    if (!PL_strcasecmp("Date", headerInfo->name)) {
      GenerateDateString(headerValue, convertedDateString, false);
      mailChannel->AddHeaderFromMIME("X-Mozilla-LocalizedDate"_ns,
                                     convertedDateString);
    }
  }

  // Notify the front end that the headers are ready on `mailChannel`.
  nsCOMPtr<nsIMailProgressListener> listener;
  mailChannel->GetListener(getter_AddRefs(listener));
  if (listener) {
    listener->OnHeadersComplete(mailChannel);
  }

  return rv;
}

NS_IMETHODIMP nsMimeHtmlDisplayEmitter::WriteHTMLHeaders(
    const nsACString& name) {
  if ((mFormat == nsMimeOutput::nsMimeMessageSaveAs) ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay)) {
    nsMimeBaseEmitter::WriteHTMLHeaders(name);
  }

  if (!mDocHeader) {
    return NS_OK;
  }

  nsresult rv;
  int32_t viewMode = 0;
  nsCOMPtr<nsIPrefBranch> pPrefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv) && pPrefBranch) {
    pPrefBranch->GetIntPref("mail.show_headers", &viewMode);
  }

  return BroadcastHeaders(viewMode);
}

nsresult nsMimeHtmlDisplayEmitter::EndHeader(const nsACString& name) {
  if (mDocHeader && (mFormat != nsMimeOutput::nsMimeMessageFilterSniffer)) {
    // Start with a UTF-8 BOM so this can't be mistaken for another charset.
    UtilityWriteCRLF("\xEF\xBB\xBF<!DOCTYPE html>");
    UtilityWriteCRLF("<html>");
    UtilityWriteCRLF("<head>");

    const char* val = GetHeaderValue(HEADER_SUBJECT);  // do not free this value
    if (val) {
      nsCString subject("<title>");
      nsAppendEscapedHTML(nsDependentCString(val), subject);
      subject.AppendLiteral("</title>");
      UtilityWriteCRLF(subject.get());
    }

    // Stylesheet info!
    UtilityWriteCRLF(
        "<link rel=\"important stylesheet\" "
        "href=\"chrome://messagebody/skin/messageBody.css\">");

    UtilityWriteCRLF("</head>");
    UtilityWriteCRLF("<body>");
  }

  WriteHTMLHeaders(name);

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::StartAttachment(const nsACString& name,
                                                   const char* contentType,
                                                   const char* url,
                                                   bool aIsExternalAttachment) {
  nsresult rv = NS_OK;

  nsCString uriString;

  nsCOMPtr<nsIMsgMessageUrl> msgurl(do_QueryInterface(mURL, &rv));
  if (NS_SUCCEEDED(rv)) {
    // HACK: news urls require us to use the originalSpec. Everyone
    // else uses GetURI to get the RDF resource which describes the message.
    nsCOMPtr<nsINntpUrl> nntpUrl(do_QueryInterface(mURL, &rv));
    if (NS_SUCCEEDED(rv) && nntpUrl)
      rv = msgurl->GetOriginalSpec(uriString);
    else
      rv = msgurl->GetUri(uriString);
  }

  // The attachment name has already been RFC2047 processed
  // upstream of us.  (Namely, mime_decode_filename has been called, deferring
  // to nsIMimeHeaderParam.decodeParameter.)
  // But we'l send it through decoding ourselves as well, since we do some
  // more adjustments, such as removing spoofy chars.

  nsCString decodedName(name);
  nsCOMPtr<nsIMimeConverter> mimeConverter =
      do_GetService("@mozilla.org/messenger/mimeconverter;1", &rv);

  if (NS_SUCCEEDED(rv)) {
    mimeConverter->DecodeMimeHeaderToUTF8(name, nullptr, false, true,
                                          decodedName);
  }

  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(mChannel);
  if (mailChannel) {
    mailChannel->HandleAttachmentFromMIME(nsDependentCString(contentType),
                                          nsDependentCString(url), decodedName,
                                          uriString, aIsExternalAttachment);
  }

  // List the attachments for printing.
  rv = StartAttachmentInBody(decodedName, contentType, url);

  return rv;
}

// Attachment handling routines

nsresult nsMimeHtmlDisplayEmitter::StartAttachmentInBody(
    const nsACString& name, const char* contentType, const char* url) {
  mSkipAttachment = false;
  bool p7mExternal = false;

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefs) prefs->GetBoolPref("mailnews.p7m_external", &p7mExternal);

  if ((contentType) &&
      ((!p7mExternal && !strcmp(contentType, APPLICATION_XPKCS7_MIME)) ||
       (!p7mExternal && !strcmp(contentType, APPLICATION_PKCS7_MIME)) ||
       (!strcmp(contentType, APPLICATION_XPKCS7_SIGNATURE)) ||
       (!strcmp(contentType, APPLICATION_PKCS7_SIGNATURE)))) {
    mSkipAttachment = true;
    return NS_OK;
  }

  // Add the list of attachments. This is only visible when printing.

  if (mFirst) {
    UtilityWrite(
        "<fieldset class=\"moz-mime-attachment-header moz-print-only\">");
    if (!name.IsEmpty()) {
      nsresult rv;

      nsCOMPtr<nsIStringBundleService> bundleSvc =
          mozilla::components::StringBundle::Service();
      NS_ENSURE_TRUE(bundleSvc, NS_ERROR_UNEXPECTED);

      nsCOMPtr<nsIStringBundle> bundle;
      rv = bundleSvc->CreateBundle(
          "chrome://messenger/locale/messenger.properties",
          getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);

      nsString attachmentsHeader;
      bundle->GetStringFromName("attachmentsPrintHeader", attachmentsHeader);

      UtilityWrite(
          "<legend class=\"moz-mime-attachment-headerName moz-print-only\">");
      nsCString escapedName;
      nsAppendEscapedHTML(NS_ConvertUTF16toUTF8(attachmentsHeader),
                          escapedName);
      UtilityWrite(escapedName.get());
      UtilityWrite("</legend>");
    }
    UtilityWrite("</fieldset>");
    UtilityWrite("<div class=\"moz-mime-attachment-wrap moz-print-only\">");
    UtilityWrite("<table class=\"moz-mime-attachment-table\">");
  }

  UtilityWrite("<tr>");

  UtilityWrite("<td class=\"moz-mime-attachment-file\">");
  nsCString escapedName;
  nsAppendEscapedHTML(name, escapedName);
  UtilityWrite(escapedName.get());
  UtilityWrite("</td>");

  mFirst = false;
  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::AddAttachmentField(const char* field,
                                                      const char* value) {
  if (mSkipAttachment) return NS_OK;

  // Don't let bad things happen
  if (!value || !*value) return NS_OK;

  // Don't output this ugly header...
  if (!strcmp(field, HEADER_X_MOZILLA_PART_URL)) return NS_OK;

  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(mChannel);
  if (mailChannel) {
    mailChannel->AddAttachmentFieldFromMIME(nsDependentCString(field),
                                            nsDependentCString(value));
  }

  // Currently, we only care about the part size.
  if (strcmp(field, HEADER_X_MOZILLA_PART_SIZE)) return NS_OK;

  uint64_t size = atoi(value);
  nsAutoString sizeString;
  FormatFileSize(size, false, sizeString);
  UtilityWrite("<td class=\"moz-mime-attachment-size\">");
  UtilityWrite(NS_ConvertUTF16toUTF8(sizeString).get());
  UtilityWrite("</td>");

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndAttachment() {
  if (!mSkipAttachment) {
    UtilityWrite("</tr>");
  }

  mSkipAttachment = false;  // reset it for next attachment round
  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndAllAttachments() {
  UtilityWrite("</table>");
  UtilityWrite("</div>");

  // Notify the front end that we've finished reading the body.
  nsresult rv;
  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(mChannel, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMailProgressListener> listener;
  mailChannel->GetListener(getter_AddRefs(listener));
  if (listener) {
    listener->OnAttachmentsComplete(mailChannel);
  }

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::WriteBody(const nsACString& buf,
                                             uint32_t* amountWritten) {
  Write(buf, amountWritten);
  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndBody() {
  if (mFormat != nsMimeOutput::nsMimeMessageFilterSniffer) {
    UtilityWriteCRLF("</body>");
    UtilityWriteCRLF("</html>");
  }

  // Notify the front end that we've finished reading the body.
  nsresult rv;
  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(mChannel, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMailProgressListener> listener;
  mailChannel->GetListener(getter_AddRefs(listener));
  if (listener) {
    listener->OnBodyComplete(mailChannel);
  }

  return NS_OK;
}
