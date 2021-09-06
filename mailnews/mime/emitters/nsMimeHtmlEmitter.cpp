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
#include "nsMsgMimeCID.h"
#include "nsMsgUtils.h"
#include "nsMemory.h"
#include "mozilla/Services.h"

#define VIEW_ALL_HEADERS 2

/**
 * A helper class to implement nsIUTF8StringEnumerator
 */

class nsMimeStringEnumerator final : public nsStringEnumeratorBase {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIUTF8STRINGENUMERATOR

  nsMimeStringEnumerator() : mCurrentIndex(0) {}

  template <class T>
  nsCString* Append(T value) {
    return mValues.AppendElement(value);
  }

  using nsStringEnumeratorBase::GetNext;

 protected:
  ~nsMimeStringEnumerator() {}
  nsTArray<nsCString> mValues;
  uint32_t mCurrentIndex;  // consumers expect first-in first-out enumeration
};

NS_IMPL_ISUPPORTS(nsMimeStringEnumerator, nsIUTF8StringEnumerator,
                  nsIStringEnumerator)

NS_IMETHODIMP
nsMimeStringEnumerator::HasMore(bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = mCurrentIndex < mValues.Length();
  return NS_OK;
}

NS_IMETHODIMP
nsMimeStringEnumerator::GetNext(nsACString& result) {
  if (mCurrentIndex >= mValues.Length()) return NS_ERROR_UNEXPECTED;

  result = mValues[mCurrentIndex++];
  return NS_OK;
}

/*
 * nsMimeHtmlEmitter definitions....
 */
nsMimeHtmlDisplayEmitter::nsMimeHtmlDisplayEmitter() : nsMimeBaseEmitter() {
  mFirst = true;
  mSkipAttachment = false;
}

nsMimeHtmlDisplayEmitter::~nsMimeHtmlDisplayEmitter(void) {}

nsresult nsMimeHtmlDisplayEmitter::Init() { return NS_OK; }

bool nsMimeHtmlDisplayEmitter::BroadCastHeadersAndAttachments() {
  // try to get a header sink if there is one....
  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  nsresult rv = GetHeaderSink(getter_AddRefs(headerSink));
  if (NS_SUCCEEDED(rv) && headerSink && mDocHeader)
    return true;
  else
    return false;
}

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTMLPrefix(
    const nsACString& name) {
  if (!BroadCastHeadersAndAttachments() ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTMLPrefix(name);
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTML(const char* field,
                                                        const char* value) {
  if (!BroadCastHeadersAndAttachments() ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTML(field, value);
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::WriteHeaderFieldHTMLPostfix() {
  if (!BroadCastHeadersAndAttachments() ||
      (mFormat == nsMimeOutput::nsMimeMessagePrintOutput) ||
      (mFormat == nsMimeOutput::nsMimeMessageBodyDisplay))
    return nsMimeBaseEmitter::WriteHeaderFieldHTMLPostfix();
  else
    return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::GetHeaderSink(
    nsIMsgHeaderSink** aHeaderSink) {
  nsresult rv = NS_OK;
  if ((mChannel) && (!mHeaderSink)) {
    nsCOMPtr<nsIURI> uri;
    mChannel->GetURI(getter_AddRefs(uri));
    if (uri) {
      nsCOMPtr<nsIMsgMailNewsUrl> msgurl(do_QueryInterface(uri));
      if (msgurl) {
        msgurl->GetMsgHeaderSink(getter_AddRefs(mHeaderSink));
        if (!mHeaderSink)  // if the url is not overriding the header sink, then
                           // just get the one from the msg window
        {
          nsCOMPtr<nsIMsgWindow> msgWindow;
          msgurl->GetMsgWindow(getter_AddRefs(msgWindow));
          if (msgWindow)
            msgWindow->GetMsgHeaderSink(getter_AddRefs(mHeaderSink));
        }
      }
    }
  }

  NS_IF_ADDREF(*aHeaderSink = mHeaderSink);
  return rv;
}

nsresult nsMimeHtmlDisplayEmitter::BroadcastHeaders(
    nsIMsgHeaderSink* aHeaderSink, int32_t aHeaderMode, bool aFromNewsgroup) {
  // two string enumerators to pass out to the header sink
  RefPtr<nsMimeStringEnumerator> headerNameEnumerator =
      new nsMimeStringEnumerator();
  NS_ENSURE_TRUE(headerNameEnumerator, NS_ERROR_OUT_OF_MEMORY);
  RefPtr<nsMimeStringEnumerator> headerValueEnumerator =
      new nsMimeStringEnumerator();
  NS_ENSURE_TRUE(headerValueEnumerator, NS_ERROR_OUT_OF_MEMORY);

  nsCString extraExpandedHeaders;
  nsTArray<nsCString> extraExpandedHeadersArray;
  nsCString extraAddonHeaders;
  nsTArray<nsCString> extraAddonHeadersArray;
  nsAutoCString convertedDateString;
  bool pushAllHeaders = false;
  bool checkExtraHeaders = false;
  bool checkAddonHeaders = false;

  nsresult rv;
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

      } else if (checkExtraHeaders || checkAddonHeaders) {
        // Make headerStr lowercase because
        // extraExpandedHeaders/extraAddonHeadersArray was made lowercase above.
        nsDependentCString headerStr(headerInfo->name);
        ToLowerCase(headerStr);
        // Accept if it's an "extra" header.
        if (checkExtraHeaders && extraExpandedHeadersArray.Contains(headerStr))
          skip = false;
        if (checkAddonHeaders && extraAddonHeadersArray.Contains(headerStr))
          skip = false;
      }

      if (skip) continue;
    }

    const char* headerValue = headerInfo->value;
    headerNameEnumerator->Append(headerInfo->name);
    headerValueEnumerator->Append(headerValue);

    // Add a localized version of the date header if we encounter it.
    if (!PL_strcasecmp("Date", headerInfo->name)) {
      headerNameEnumerator->Append("X-Mozilla-LocalizedDate");
      GenerateDateString(headerValue, convertedDateString, false);
      headerValueEnumerator->Append(convertedDateString);
    }
  }

  aHeaderSink->ProcessHeaders(headerNameEnumerator, headerValueEnumerator,
                              aFromNewsgroup);
  return rv;
}

NS_IMETHODIMP nsMimeHtmlDisplayEmitter::WriteHTMLHeaders(
    const nsACString& name) {
  if (mFormat == nsMimeOutput::nsMimeMessagePrintOutput ||
      mFormat == nsMimeOutput::nsMimeMessageBodyDisplay) {
    nsMimeBaseEmitter::WriteHTMLHeaders(name);
  }

  if (!BroadCastHeadersAndAttachments() || !mDocHeader) {
    return NS_OK;
  }

  mFirstHeaders = false;

  bool bFromNewsgroups = false;
  for (size_t j = 0; j < mHeaderArray->Length(); j++) {
    headerInfoType* headerInfo = mHeaderArray->ElementAt(j);
    if (!(headerInfo && headerInfo->name && *headerInfo->name)) continue;

    if (!PL_strcasecmp("Newsgroups", headerInfo->name)) {
      bFromNewsgroups = true;
      break;
    }
  }

  // try to get a header sink if there is one....
  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  nsresult rv = GetHeaderSink(getter_AddRefs(headerSink));

  if (headerSink) {
    int32_t viewMode = 0;
    nsCOMPtr<nsIPrefBranch> pPrefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    if (pPrefBranch)
      rv = pPrefBranch->GetIntPref("mail.show_headers", &viewMode);

    rv = BroadcastHeaders(headerSink, viewMode, bFromNewsgroups);
  }  // if header Sink

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndHeader(const nsACString& name) {
  if (mDocHeader && (mFormat != nsMimeOutput::nsMimeMessageFilterSniffer)) {
    // Start with a UTF-8 BOM so this can't be mistaken for another charset.
    UtilityWriteCRLF("\xEF\xBB\xBF<html>");
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
  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  rv = GetHeaderSink(getter_AddRefs(headerSink));

  if (NS_SUCCEEDED(rv) && headerSink) {
    nsCString uriString;

    nsCOMPtr<nsIMsgMessageUrl> msgurl(do_QueryInterface(mURL, &rv));
    if (NS_SUCCEEDED(rv)) {
      // HACK: news urls require us to use the originalSpec. Everyone
      // else uses GetURI to get the RDF resource which describes the message.
      nsCOMPtr<nsINntpUrl> nntpUrl(do_QueryInterface(mURL, &rv));
      if (NS_SUCCEEDED(rv) && nntpUrl)
        rv = msgurl->GetOriginalSpec(getter_Copies(uriString));
      else
        rv = msgurl->GetUri(uriString);
    }

    // we need to convert the attachment name from UTF-8 to unicode before
    // we emit it.  The attachment name has already been rfc2047 processed
    // upstream of us.  (Namely, mime_decode_filename has been called, deferring
    // to nsIMimeHeaderParam.decodeParameter.)
    nsString unicodeHeaderValue;
    CopyUTF8toUTF16(name, unicodeHeaderValue);

    headerSink->HandleAttachment(
        contentType, nsDependentCString(url) /* was escapedUrl */,
        unicodeHeaderValue.get(), uriString, aIsExternalAttachment);

    mSkipAttachment = false;

    // List the attachments for printing.
    rv = StartAttachmentInBody(name, contentType, url);
  } else {
    // If we don't need or cannot broadcast attachment info, just ignore it
    mSkipAttachment = true;
    rv = NS_OK;
  }

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
       (!strcmp(contentType, APPLICATION_PKCS7_SIGNATURE)) ||
       (!strcmp(contentType, TEXT_VCARD)))) {
    mSkipAttachment = true;
    return NS_OK;
  }

  // Add the list of attachments. This is only visible when printing.

  if (mFirst) {
    UtilityWrite("<fieldset class=\"mimeAttachmentHeader print-only\">");
    if (!name.IsEmpty()) {
      nsresult rv;

      nsCOMPtr<nsIStringBundleService> bundleSvc =
          mozilla::services::GetStringBundleService();
      NS_ENSURE_TRUE(bundleSvc, NS_ERROR_UNEXPECTED);

      nsCOMPtr<nsIStringBundle> bundle;
      rv = bundleSvc->CreateBundle(
          "chrome://messenger/locale/messenger.properties",
          getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);

      nsString attachmentsHeader;
      bundle->GetStringFromName("attachmentsPrintHeader", attachmentsHeader);

      UtilityWrite("<legend class=\"mimeAttachmentHeaderName print-only\">");
      nsCString escapedName;
      nsAppendEscapedHTML(NS_ConvertUTF16toUTF8(attachmentsHeader),
                          escapedName);
      UtilityWrite(escapedName.get());
      UtilityWrite("</legend>");
    }
    UtilityWrite("</fieldset>");
    UtilityWrite("<div class=\"mimeAttachmentWrap print-only\">");
    UtilityWrite("<table class=\"mimeAttachmentTable\">");
  }

  UtilityWrite("<tr>");

  UtilityWrite("<td class=\"mimeAttachmentFile\">");
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

  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  nsresult rv = GetHeaderSink(getter_AddRefs(headerSink));
  if (NS_SUCCEEDED(rv) && headerSink) {
    headerSink->AddAttachmentField(field, value);
  }

  // Currently, we only care about the part size.
  if (strcmp(field, HEADER_X_MOZILLA_PART_SIZE)) return NS_OK;

  uint64_t size = atoi(value);
  nsAutoString sizeString;
  rv = FormatFileSize(size, false, sizeString);
  UtilityWrite("<td class=\"mimeAttachmentSize\">");
  UtilityWrite(NS_ConvertUTF16toUTF8(sizeString).get());
  UtilityWrite("</td>");

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndAttachment() {
  if (mSkipAttachment) return NS_OK;

  mSkipAttachment = false;  // reset it for next attachment round

  UtilityWrite("</tr>");

  return NS_OK;
}

nsresult nsMimeHtmlDisplayEmitter::EndAllAttachments() {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  rv = GetHeaderSink(getter_AddRefs(headerSink));
  if (headerSink) headerSink->OnEndAllAttachments();

  UtilityWrite("</table>");
  UtilityWrite("</div>");

  return rv;
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
  nsCOMPtr<nsIMsgHeaderSink> headerSink;
  nsresult rv = GetHeaderSink(getter_AddRefs(headerSink));
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl(do_QueryInterface(mURL, &rv));
  if (headerSink) headerSink->OnEndMsgHeaders(mailnewsUrl);

  return NS_OK;
}
