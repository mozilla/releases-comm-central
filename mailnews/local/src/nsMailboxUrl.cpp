/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MailNewsTypes.h"
#include "msgCore.h"  // precompiled header...

#include "nsIURI.h"
#include "nsIMailboxUrl.h"
#include "nsMailboxUrl.h"

#include "nsString.h"
#include "nsLocalUtils.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"

#include "nsIMsgFolder.h"
#include "prprf.h"
#include "prmem.h"
#include "nsIMsgMailSession.h"
#include "nsNetUtil.h"
#include "nsIFileURL.h"
#include "nsIStandardURL.h"

// this is totally lame and MUST be removed by M6
// the real fix is to attach the URI to the URL as it runs through netlib
// then grab it and use it on the other side
#include "nsCOMPtr.h"
#include "nsMsgUtils.h"
#include "mozilla/Components.h"

#include "nsIMsgAccountManager.h"

// helper function for parsing the search field of a url
char* extractAttributeValue(const char* searchString,
                            const char* attributeName);

nsMailboxUrl::nsMailboxUrl() {
  m_mailboxAction = nsIMailboxUrl::ActionInvalid;
  m_filePath = nullptr;
  m_messageID = nullptr;
  m_messageKey = nsMsgKey_None;
  m_messageSize = 0;
  m_messageFile = nullptr;
  m_addDummyEnvelope = false;
  m_canonicalLineEnding = false;
  m_curMsgIndex = 0;
  mAutodetectCharset = false;
}

nsMailboxUrl::~nsMailboxUrl() { PR_Free(m_messageID); }

NS_IMPL_ADDREF_INHERITED(nsMailboxUrl, nsMsgMailNewsUrl)
NS_IMPL_RELEASE_INHERITED(nsMailboxUrl, nsMsgMailNewsUrl)

NS_INTERFACE_MAP_BEGIN(nsMailboxUrl)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMailboxUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMailboxUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMsgMessageUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMsgI18NUrl)
NS_INTERFACE_MAP_END_INHERITING(nsMsgMailNewsUrl)

////////////////////////////////////////////////////////////////////////////////////
// Begin nsIMailboxUrl specific support
////////////////////////////////////////////////////////////////////////////////////

nsresult nsMailboxUrl::SetMailboxCopyHandler(
    nsIStreamListener* aMailboxCopyHandler) {
  if (aMailboxCopyHandler) m_mailboxCopyHandler = aMailboxCopyHandler;
  return NS_OK;
}

nsresult nsMailboxUrl::GetMailboxCopyHandler(
    nsIStreamListener** aMailboxCopyHandler) {
  NS_ENSURE_ARG_POINTER(aMailboxCopyHandler);

  if (aMailboxCopyHandler) {
    NS_IF_ADDREF(*aMailboxCopyHandler = m_mailboxCopyHandler);
  }

  return NS_OK;
}

nsresult nsMailboxUrl::GetMessageKey(nsMsgKey* aMessageKey) {
  *aMessageKey = m_messageKey;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::GetMessageSize(uint32_t* aMessageSize) {
  if (aMessageSize) {
    *aMessageSize = m_messageSize;
    return NS_OK;
  } else
    return NS_ERROR_NULL_POINTER;
}

nsresult nsMailboxUrl::SetMessageSize(uint32_t aMessageSize) {
  m_messageSize = aMessageSize;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::GetNormalizedSpec(nsACString& aPrincipalSpec) {
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsURL;
  QueryInterface(NS_GET_IID(nsIMsgMailNewsUrl), getter_AddRefs(mailnewsURL));

  nsAutoCString spec;
  mailnewsURL->GetSpecIgnoringRef(spec);

  // mailbox: URLs contain a lot of query parts. We want need a normalized form:
  // mailbox:///path/to/folder?number=nn.
  // We also need to translate the second form
  // mailbox://user@domain@server/folder?number=nn.

  char* messageKey = extractAttributeValue(spec.get(), "number=");

  // Strip any query part beginning with ? or /;
  MsgRemoveQueryPart(spec);

  // Check for format lacking absolute path.
  if (spec.Find("///") == kNotFound) {
    nsCString folderPath;
    nsresult rv = nsLocalURI2Path(kMailboxRootURI, spec.get(), folderPath);
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString buf;
      MsgEscapeURL(
          folderPath,
          nsINetUtil::ESCAPE_URL_DIRECTORY | nsINetUtil::ESCAPE_URL_FORCED,
          buf);
      spec = "mailbox://"_ns + buf;
    }
  }

  if (messageKey) {
    spec += "?number="_ns;
    spec.Append(messageKey);
    PR_Free(messageKey);
  }

  aPrincipalSpec.Assign(spec);
  return NS_OK;
}

nsresult nsMailboxUrl::CreateURL(const nsACString& aSpec, nsIURL** aURL) {
  nsresult rv;
  nsCOMPtr<nsIURL> url;
  // Check whether the URL is of the form
  // mailbox://user@domain@server/folder?number=nn and contains a hostname.
  // Check for format lacking absolute path.
  if (PromiseFlatCString(aSpec).Find("///") == kNotFound) {
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec(aSpec)
             .Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // The URL is more like a file URL without a hostname.
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .Apply(&nsIStandardURLMutator::Init,
                    nsIStandardURL::URLTYPE_NO_AUTHORITY, -1,
                    PromiseFlatCString(aSpec), nullptr, nullptr, nullptr)
             .Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  url.forget(aURL);
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::SetUri(const nsACString& aURI) {
  mURI = aURI;
  return NS_OK;
}

nsresult nsMailboxUrl::Clone(nsIURI** _retval) {
  nsresult rv = nsMsgMailNewsUrl::Clone(_retval);
  NS_ENSURE_SUCCESS(rv, rv);
  // also clone the mURI member, because GetUri below won't work if
  // mURI isn't set due to nsIFile fun.
  nsCOMPtr<nsIMsgMessageUrl> clonedUrl = do_QueryInterface(*_retval);
  if (clonedUrl) clonedUrl->SetUri(mURI);
  return rv;
}

NS_IMETHODIMP nsMailboxUrl::GetUri(nsACString& aURI) {
  // if we have been given a uri to associate with this url, then use it
  // otherwise try to reconstruct a URI on the fly....

  if (!mURI.IsEmpty()) {
    aURI = mURI;
  } else if (m_filePath) {
    // This code path should only ever run for .eml messages
    // opened from file.
    nsAutoCString baseUri;
    nsresult rv = m_baseURL->GetSpec(baseUri);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCString baseMessageURI;
    nsCreateLocalBaseMessageURI(baseUri, baseMessageURI);
    nsBuildLocalMessageURI(baseMessageURI, m_messageKey, aURI);

    // Remember this for the next call.
    mURI = aURI;
  } else {
    aURI = "";
  }

  return NS_OK;
}

nsresult nsMailboxUrl::GetMsgHdrForKey(nsMsgKey msgKey, nsIMsgDBHdr** msgHdr) {
  NS_ENSURE_ARG_POINTER(msgHdr);
  NS_ENSURE_TRUE(m_filePath, NS_ERROR_NULL_POINTER);

  nsresult rv;
  nsCOMPtr<nsIMsgDatabase> mailDB;
  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  if (msgDBService) {
    rv = msgDBService->CachedDBForFilePath(m_filePath, getter_AddRefs(mailDB));
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> mailDBFolder = nullptr;
  if (mailDB) {
    mailDB->GetFolder(getter_AddRefs(mailDBFolder));
  }

  if (!mailDB || !mailDBFolder) {
    // If the database hasn't been opened before with its actual
    // nsIMsgFolder, we need to look it up, otherwise
    // nsMsgDatabase::GetMsgHdrForKey won't work.
    nsCOMPtr<nsIMsgAccountManager> accountMgr =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<RefPtr<nsIMsgFolder>> allFolders;
    rv = accountMgr->GetAllFolders(allFolders);
    NS_ENSURE_SUCCESS(rv, rv);

    for (const auto& folder : allFolders) {
      nsCOMPtr<nsIFile> folderPath;
      rv = folder->GetFilePath(getter_AddRefs(folderPath));
      if (NS_FAILED(rv)) {
        continue;
      }
      bool matchFound = false;
      rv = folderPath->Equals(m_filePath, &matchFound);
      if (NS_SUCCEEDED(rv) && matchFound) {
        rv = msgDBService->OpenFolderDB(folder, true, getter_AddRefs(mailDB));
        NS_ENSURE_SUCCESS(rv, rv);
        break;
      }
    }
  }

  if (mailDB) {
    return mailDB->GetMsgHdrForKey(msgKey, msgHdr);
  }

  // This may be an .eml file.
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::GetMessageHeader(nsIMsgDBHdr** aMsgHdr) {
  return GetMsgHdrForKey(m_messageKey, aMsgHdr);
}

NS_IMPL_GETSET(nsMailboxUrl, AddDummyEnvelope, bool, m_addDummyEnvelope)
NS_IMPL_GETSET(nsMailboxUrl, CanonicalLineEnding, bool, m_canonicalLineEnding)

NS_IMETHODIMP
nsMailboxUrl::GetOriginalSpec(nsACString& aSpec) {
  if (m_originalSpec.IsEmpty()) return NS_ERROR_NULL_POINTER;
  aSpec = m_originalSpec;
  return NS_OK;
}

NS_IMETHODIMP
nsMailboxUrl::SetOriginalSpec(const nsACString& aSpec) {
  m_originalSpec = aSpec;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::SetMessageFile(nsIFile* aFile) {
  m_messageFile = aFile;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::GetMessageFile(nsIFile** aFile) {
  // why don't we return an error for null aFile?
  if (aFile) NS_IF_ADDREF(*aFile = m_messageFile);
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::IsUrlType(uint32_t type, bool* isType) {
  NS_ENSURE_ARG(isType);

  switch (type) {
    case nsIMsgMailNewsUrl::eCopy:
      *isType = (m_mailboxAction == nsIMailboxUrl::ActionCopyMessage);
      break;
    case nsIMsgMailNewsUrl::eMove:
      *isType = (m_mailboxAction == nsIMailboxUrl::ActionMoveMessage);
      break;
    case nsIMsgMailNewsUrl::eDisplay:
      *isType = (m_mailboxAction == nsIMailboxUrl::ActionFetchMessage ||
                 m_mailboxAction == nsIMailboxUrl::ActionFetchPart);
      break;
    default:
      *isType = false;
  };

  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// End nsIMailboxUrl specific support
////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// possible search part phrases include: MessageID=id&number=MessageKey

nsresult nsMailboxUrl::ParseSearchPart() {
  nsAutoCString searchPart;
  nsresult rv = GetQuery(searchPart);
  // add code to this function to decompose everything past the '?'.....
  if (NS_SUCCEEDED(rv) && !searchPart.IsEmpty()) {
    // the action for this mailbox must be a display message...
    char* msgPart = extractAttributeValue(searchPart.get(), "part=");
    if (msgPart)  // if we have a part in the url then we must be fetching just
                  // the part.
      m_mailboxAction = nsIMailboxUrl::ActionFetchPart;
    else
      m_mailboxAction = nsIMailboxUrl::ActionFetchMessage;

    char* messageKey = extractAttributeValue(searchPart.get(), "number=");
    m_messageID = extractAttributeValue(searchPart.get(), "messageid=");
    if (messageKey)
      m_messageKey =
          (nsMsgKey)ParseUint64Str(messageKey);  // convert to a uint32_t...

    PR_Free(msgPart);
    PR_Free(messageKey);
  } else {
    m_mailboxAction = nsIMailboxUrl::ActionInvalid;
    return NS_ERROR_UNEXPECTED;
  }

  return rv;
}

// warning: don't assume when parsing the url that the protocol part is
// "news"...
nsresult nsMailboxUrl::ParseUrl() {
  GetFilePath(m_file);

  ParseSearchPart();
  // ### fix me.
  // this hack is to avoid asserting on every local message loaded because the
  // security manager is creating an empty "mailbox://" uri for every message.
  if (m_file.Length() < 2)
    m_filePath = nullptr;
  else {
    nsCString fileUri("file://");
    fileUri.Append(m_file);
    nsresult rv;
    nsCOMPtr<nsIIOService> ioService = mozilla::components::IO::Service();
    NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
    nsCOMPtr<nsIURI> uri;
    rv = ioService->NewURI(fileUri, nullptr, nullptr, getter_AddRefs(uri));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFileURL> fileURL = do_QueryInterface(uri);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFile> fileURLFile;
    fileURL->GetFile(getter_AddRefs(fileURLFile));
    NS_ENSURE_TRUE(fileURLFile, NS_ERROR_NULL_POINTER);
    m_filePath = fileURLFile;
  }

  GetPathQueryRef(m_file);
  return NS_OK;
}

nsresult nsMailboxUrl::SetSpecInternal(const nsACString& aSpec) {
  nsresult rv = nsMsgMailNewsUrl::SetSpecInternal(aSpec);
  if (NS_SUCCEEDED(rv)) {
    // Do not try to parse URLs of the form
    // mailbox://user@domain@server/folder?number=nn since this will fail.
    // Check for format lacking absolute path.
    if (PromiseFlatCString(aSpec).Find("///") != kNotFound) {
      rv = ParseUrl();
    } else {
      // We still need to parse the search part to populate
      // m_messageKey etc.
      ParseSearchPart();
    }
  }
  return rv;
}

nsresult nsMailboxUrl::SetQuery(const nsACString& aQuery) {
  nsresult rv = nsMsgMailNewsUrl::SetQuery(aQuery);
  if (NS_SUCCEEDED(rv)) rv = ParseUrl();
  return rv;
}

// takes a string like ?messageID=fooo&number=MsgKey and returns a new string
// containing just the attribute value. i.e you could pass in this string with
// an attribute name of messageID and I'll return fooo. Use PR_Free to delete
// this string...

// Assumption: attribute pairs in the string are separated by '&'.
char* extractAttributeValue(const char* searchString,
                            const char* attributeName) {
  char* attributeValue = nullptr;

  if (searchString && attributeName) {
    // search the string for attributeName
    uint32_t attributeNameSize = PL_strlen(attributeName);
    char* startOfAttribute = PL_strcasestr(searchString, attributeName);
    if (startOfAttribute) {
      startOfAttribute += attributeNameSize;  // skip over the attributeName
      if (startOfAttribute)  // is there something after the attribute name
      {
        char* endOfAttribute = PL_strchr(startOfAttribute, '&');
        nsDependentCString attributeValueStr;
        if (startOfAttribute &&
            endOfAttribute)  // is there text after attribute value
          attributeValueStr.Assign(startOfAttribute,
                                   endOfAttribute - startOfAttribute);
        else  // there is nothing left so eat up rest of line.
          attributeValueStr.Assign(startOfAttribute);

        // now unescape the string...
        nsCString unescapedValue;
        MsgUnescapeString(attributeValueStr, 0, unescapedValue);
        attributeValue = PL_strdup(unescapedValue.get());
      }  // if we have a attribute value

    }  // if we have a attribute name
  }  // if we got non-null search string and attribute name values

  return attributeValue;
}

// nsIMsgI18NUrl support

nsresult nsMailboxUrl::GetFolder(nsIMsgFolder** msgFolder) {
  // if we have a RDF URI, then try to get the folder for that URI and then ask
  // the folder for it's charset....
  nsCString uri;
  GetUri(uri);
  NS_ENSURE_TRUE(!uri.IsEmpty(), NS_ERROR_FAILURE);
  nsCOMPtr<nsIMsgDBHdr> msg;
  GetMsgDBHdrFromURI(uri, getter_AddRefs(msg));
  if (!msg) {
    // E.g. the folder no longer exists. That's ok.
    *msgFolder = nullptr;
    return NS_OK;
  }
  return msg->GetFolder(msgFolder);
}

NS_IMETHODIMP nsMailboxUrl::GetAutodetectCharset(bool* aAutodetectCharset) {
  *aAutodetectCharset = mAutodetectCharset;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::SetAutodetectCharset(bool aAutodetectCharset) {
  mAutodetectCharset = aAutodetectCharset;
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::SetMoveCopyMsgKeys(
    const nsTArray<nsMsgKey>& keysToFlag) {
  m_keys = keysToFlag.Clone();
  if (!m_keys.IsEmpty() && m_messageKey == nsMsgKey_None)
    m_messageKey = m_keys[0];
  return NS_OK;
}

NS_IMETHODIMP nsMailboxUrl::GetMoveCopyMsgHdrForIndex(uint32_t msgIndex,
                                                      nsIMsgDBHdr** msgHdr) {
  NS_ENSURE_ARG(msgHdr);
  if (msgIndex < m_keys.Length()) {
    nsMsgKey nextKey = m_keys[msgIndex];
    return GetMsgHdrForKey(nextKey, msgHdr);
  }
  return NS_MSG_MESSAGE_NOT_FOUND;
}

NS_IMETHODIMP nsMailboxUrl::GetNumMoveCopyMsgs(uint32_t* numMsgs) {
  NS_ENSURE_ARG(numMsgs);
  *numMsgs = m_keys.Length();
  return NS_OK;
}
