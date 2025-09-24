/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...

#include "nsNntpUrl.h"

#include "nsString.h"
#include "nsMsgUtils.h"

#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgNewsFolder.h"
#include "nsINntpService.h"
#include "nsIMsgMessageService.h"
#include "nsIMsgAccountManager.h"
#include "nsServiceManagerUtils.h"
#include "mozilla/Components.h"

#define kNewsURIGroupQuery "?group="
#define kNewsURIKeyQuery "&key="

#define kNewsURIGroupQueryLen 7
#define kNewsURIKeyQueryLen 5

nsNntpUrl::nsNntpUrl() {
  m_newsAction = nsINntpUrl::ActionUnknown;
  m_addDummyEnvelope = false;
  m_canonicalLineEnding = false;
  m_filePath = nullptr;
  m_getOldMessages = false;
  m_key = nsMsgKey_None;
  mAutodetectCharset = false;
}

nsNntpUrl::~nsNntpUrl() {}

NS_IMPL_ADDREF_INHERITED(nsNntpUrl, nsMsgMailNewsUrl)
NS_IMPL_RELEASE_INHERITED(nsNntpUrl, nsMsgMailNewsUrl)

NS_INTERFACE_MAP_BEGIN(nsNntpUrl)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsINntpUrl)
  NS_INTERFACE_MAP_ENTRY(nsINntpUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMsgMessageUrl)
  NS_INTERFACE_MAP_ENTRY(nsIMsgI18NUrl)
NS_INTERFACE_MAP_END_INHERITING(nsMsgMailNewsUrl)

////////////////////////////////////////////////////////////////////////////////
// Begin nsINntpUrl specific support
////////////////////////////////////////////////////////////////////////////////

/* News URI parsing explanation:
 * We support 3 different news URI schemes, essentially boiling down to 8
 * different formats:
 * news://host/group
 * news://host/message
 * news://host/
 * news:group
 * news:message
 * nntp://host/group
 * nntp://host/group/key
 * news-message://host/group#key
 *
 * In addition, we use queries on the news URIs with authorities for internal
 * NNTP processing. The most important one is ?group=group&key=key, for cache
 * canonicalization.
 */

nsresult nsNntpUrl::SetSpecInternal(const nsACString& aSpec) {
  // For [s]news: URIs, we need to munge the spec if it is no authority, because
  // the URI parser guesses the wrong thing otherwise
  nsCString parseSpec(aSpec);
  int32_t colon = parseSpec.Find(":");

  // Our smallest scheme is 4 characters long, so colon must be at least 4
  if (colon < 4 || colon + 1 == (int32_t)parseSpec.Length())
    return NS_ERROR_MALFORMED_URI;

  if (Substring(parseSpec, colon - 4, 4).EqualsLiteral("news") &&
      parseSpec[colon + 1] != '/') {
    // To make this parse properly, we add in three slashes, which convinces the
    // parser that the authority component is empty.
    parseSpec = Substring(aSpec, 0, colon + 1);
    parseSpec.AppendLiteral("///");
    parseSpec += Substring(aSpec, colon + 1);
  }

  nsresult rv = nsMsgMailNewsUrl::SetSpecInternal(parseSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString scheme;
  rv = GetScheme(scheme);
  NS_ENSURE_SUCCESS(rv, rv);

  if (scheme.EqualsLiteral("news") || scheme.EqualsLiteral("snews"))
    rv = ParseNewsURL();
  else if (scheme.EqualsLiteral("nntp") || scheme.EqualsLiteral("nntps"))
    rv = ParseNntpURL();
  else if (scheme.EqualsLiteral("news-message")) {
    rv = ParseNewsMessageURL();
  } else {
    return NS_ERROR_MALFORMED_URI;
  }
  NS_ENSURE_SUCCESS(rv, rv);

  rv = DetermineNewsAction();
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

nsresult nsNntpUrl::ParseNewsURL() {
  // The path here is the group/msgid portion
  nsAutoCString path;
  nsresult rv = GetFilePath(path);
  NS_ENSURE_SUCCESS(rv, rv);

  // Drop the potential beginning from the path
  if (path.Length() && path[0] == '/') path = Substring(path, 1);

  // The presence of an `@' is a sign we have a msgid
  if (path.Find("@") != -1 || path.Find("%40") != -1) {
    MsgUnescapeString(path, 0, m_messageID);

    // Set group, key for ?group=foo&key=123 uris
    nsAutoCString spec;
    rv = GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);
    int32_t groupPos = spec.Find(kNewsURIGroupQuery);  // find ?group=
    int32_t keyPos = spec.Find(kNewsURIKeyQuery);      // find &key=
    if (groupPos != kNotFound && keyPos != kNotFound) {
      // get group name and message key
      m_group = Substring(spec, groupPos + kNewsURIGroupQueryLen,
                          keyPos - groupPos - kNewsURIGroupQueryLen);
      nsCString keyStr(Substring(spec, keyPos + kNewsURIKeyQueryLen));
      m_key = keyStr.ToInteger(&rv, 10);
      NS_ENSURE_SUCCESS(rv, NS_ERROR_MALFORMED_URI);
    }
  } else
    MsgUnescapeString(path, 0, m_group);

  return NS_OK;
}

nsresult nsNntpUrl::ParseNntpURL() {
  nsAutoCString path;
  nsresult rv = GetFilePath(path);
  NS_ENSURE_SUCCESS(rv, rv);

  if (path.Length() > 0 && path[0] == '/') path = Substring(path, 1);

  if (path.IsEmpty()) return NS_ERROR_MALFORMED_URI;

  int32_t slash = path.FindChar('/');
  if (slash == -1) {
    m_group = path;
    m_key = nsMsgKey_None;
  } else {
    m_group = Substring(path, 0, slash);
    nsAutoCString keyStr;
    keyStr = Substring(path, slash + 1);
    m_key = keyStr.ToInteger(&rv, 10);
    NS_ENSURE_SUCCESS(rv, NS_ERROR_MALFORMED_URI);

    // Keys must be at least one
    if (m_key == 0) return NS_ERROR_MALFORMED_URI;
  }

  return NS_OK;
}

nsresult nsNntpUrl::ParseNewsMessageURL() {
  nsAutoCString spec;
  nsresult rv = GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t keySeparator = spec.FindChar('#');
  if (keySeparator == -1) return NS_ERROR_MALFORMED_URI;
  int32_t keyEndSeparator = spec.FindCharInSet("?&", keySeparator);

  // Grab between the last '/' and the '#' for the key
  nsAutoCString escapedGroup;
  escapedGroup = StringHead(spec, keySeparator);
  int32_t groupSeparator = escapedGroup.RFind("/");
  if (groupSeparator == -1) return NS_ERROR_MALFORMED_URI;

  MsgUnescapeString(Substring(escapedGroup, groupSeparator + 1), 0, m_group);

  nsAutoCString keyStr;
  if (keyEndSeparator != -1) {
    keyStr =
        Substring(spec, keySeparator + 1, keyEndSeparator - (keySeparator + 1));
  } else {
    keyStr = Substring(spec, keySeparator + 1);
  }
  m_key = keyStr.ToInteger(&rv);
  return NS_FAILED(rv) ? NS_ERROR_MALFORMED_URI : NS_OK;
}

nsresult nsNntpUrl::DetermineNewsAction() {
  nsAutoCString path;
  nsresult rv = nsMsgMailNewsUrl::GetPathQueryRef(path);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString query;
  rv = GetQuery(query);
  NS_ENSURE_SUCCESS(rv, rv);

  if (query.EqualsLiteral("cancel")) {
    m_newsAction = nsINntpUrl::ActionCancelArticle;
    return NS_OK;
  }
  if (query.EqualsLiteral("list-ids")) {
    m_newsAction = nsINntpUrl::ActionListIds;
    return NS_OK;
  }
  if (query.EqualsLiteral("newgroups")) {
    m_newsAction = nsINntpUrl::ActionListNewGroups;
    return NS_OK;
  }
  if (StringBeginsWith(query, "search"_ns)) {
    m_newsAction = nsINntpUrl::ActionSearch;
    return NS_OK;
  }
  if (StringBeginsWith(query, "part="_ns) || query.Find("&part=") > 0) {
    // news://news.mozilla.org:119/3B98D201.3020100%40cs.com?part=1
    // news://news.mozilla.org:119/b58dme%24aia2%40ripley.netscape.com?header=print&part=1.2&type=image/jpeg&filename=Pole.jpg
    m_newsAction = nsINntpUrl::ActionFetchPart;
    return NS_OK;
  }

  if (!m_messageID.IsEmpty() || m_key != nsMsgKey_None) {
    m_newsAction = nsINntpUrl::ActionFetchArticle;
    return NS_OK;
  }

  if (m_group.Find("*") >= 0) {
    // If the group is a wildmat, list groups instead of grabbing a group.
    m_newsAction = nsINntpUrl::ActionListGroups;
    return NS_OK;
  }
  if (!m_group.IsEmpty()) {
    m_newsAction = nsINntpUrl::ActionGetNewNews;
    return NS_OK;
  }

  // At this point, we have a URI that contains neither a query, a group, nor a
  // message ID. Ergo, we don't know what it is.
  m_newsAction = nsINntpUrl::ActionUnknown;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::SetGetOldMessages(bool aGetOldMessages) {
  m_getOldMessages = aGetOldMessages;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetGetOldMessages(bool* aGetOldMessages) {
  NS_ENSURE_ARG(aGetOldMessages);
  *aGetOldMessages = m_getOldMessages;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetNewsAction(nsNewsAction* aNewsAction) {
  if (aNewsAction) *aNewsAction = m_newsAction;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::SetNewsAction(nsNewsAction aNewsAction) {
  m_newsAction = aNewsAction;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetGroup(nsACString& group) {
  group = m_group;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetMessageID(nsACString& messageID) {
  messageID = m_messageID;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetKey(nsMsgKey* key) {
  NS_ENSURE_ARG_POINTER(key);
  *key = m_key;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetCharset(nsACString& charset) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsINntpIncomingServer> nserver(do_QueryInterface(server));
  NS_ENSURE_TRUE(nserver, NS_ERROR_NULL_POINTER);
  return nserver->GetCharset(charset);
}

NS_IMETHODIMP nsNntpUrl::GetNormalizedSpec(nsACString& aPrincipalSpec) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsNntpUrl::SetUri(const nsACString& aURI) {
  mURI = aURI;
  return NS_OK;
}

// from nsIMsgMessageUrl
NS_IMETHODIMP nsNntpUrl::GetUri(nsACString& aURI) {
  nsresult rv = NS_OK;

  // if we have been given a uri to associate with this url, then use it
  // otherwise try to reconstruct a URI on the fly....
  if (mURI.IsEmpty()) {
    nsAutoCString spec;
    rv = GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);
    mURI = spec;
  }

  aURI = mURI;
  return rv;
}

NS_IMPL_GETSET(nsNntpUrl, AddDummyEnvelope, bool, m_addDummyEnvelope)
NS_IMPL_GETSET(nsNntpUrl, CanonicalLineEnding, bool, m_canonicalLineEnding)

NS_IMETHODIMP nsNntpUrl::SetMessageFile(nsIFile* aFile) {
  m_messageFile = aFile;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetMessageFile(nsIFile** aFile) {
  if (aFile) NS_IF_ADDREF(*aFile = m_messageFile);
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////
// End nsINntpUrl specific support
////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsNntpUrl::GetMessageHeader(nsIMsgDBHdr** aMsgHdr) {
  nsresult rv;

  nsCOMPtr<nsIMsgMessageService> msgService =
      do_GetService("@mozilla.org/messenger/messageservice;1?type=news", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString spec(mOriginalSpec);
  if (spec.IsEmpty()) {
    // Handle the case where necko directly runs an internal news:// URL,
    // one that looks like news://host/message-id?group=mozilla.announce&key=15
    // Other sorts of URLs -- e.g. news://host/message-id -- will not succeed.
    rv = GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return msgService->MessageURIToMsgHdr(spec, aMsgHdr);
}

NS_IMETHODIMP nsNntpUrl::IsUrlType(uint32_t type, bool* isType) {
  NS_ENSURE_ARG(isType);

  switch (type) {
    case nsIMsgMailNewsUrl::eDisplay:
      *isType = (m_newsAction == nsINntpUrl::ActionFetchArticle);
      break;
    default:
      *isType = false;
  };

  return NS_OK;
}

NS_IMETHODIMP
nsNntpUrl::GetOriginalSpec(nsACString& aSpec) {
  aSpec = mOriginalSpec;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpUrl::SetOriginalSpec(const nsACString& aSpec) {
  mOriginalSpec = aSpec;
  return NS_OK;
}

NS_IMETHODIMP
nsNntpUrl::GetServer(nsIMsgIncomingServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);

  nsAutoCString scheme, user, host;

  GetScheme(scheme);
  GetUsername(user);
  GetHost(host);

  // No authority -> no server
  if (host.IsEmpty()) {
    *aServer = nullptr;
    return NS_OK;
  }

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();

  *aServer = nullptr;
  accountManager->FindServer(user, host, "nntp"_ns, 0, aServer);
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::GetFolder(nsIMsgFolder** msgFolder) {
  NS_ENSURE_ARG_POINTER(msgFolder);

  nsresult rv;

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  // Need a server and a group to get the folder
  if (!server || m_group.IsEmpty()) {
    *msgFolder = nullptr;
    return NS_OK;
  }

  // Find the group on the server
  nsCOMPtr<nsINntpIncomingServer> nntpServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasGroup = false;
  rv = nntpServer->ContainsNewsgroup(m_group, &hasGroup);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!hasGroup) {
    *msgFolder = nullptr;
    return NS_OK;
  }

  nsCOMPtr<nsIMsgNewsFolder> newsFolder;
  rv = nntpServer->FindGroup(m_group, getter_AddRefs(newsFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  return newsFolder->QueryInterface(NS_GET_IID(nsIMsgFolder),
                                    (void**)msgFolder);
}

NS_IMETHODIMP nsNntpUrl::GetAutodetectCharset(bool* aAutodetectCharset) {
  *aAutodetectCharset = mAutodetectCharset;
  return NS_OK;
}

NS_IMETHODIMP nsNntpUrl::SetAutodetectCharset(bool aAutodetectCharset) {
  mAutodetectCharset = aAutodetectCharset;
  return NS_OK;
}

nsresult nsNntpUrl::Clone(nsIURI** _retval) {
  nsresult rv;
  rv = nsMsgMailNewsUrl::Clone(_retval);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMessageUrl> newsurl = do_QueryInterface(*_retval, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return newsurl->SetUri(mURI);
}

nsresult nsNntpUrl::NewURI(const nsACString& aSpec, nsIURI* aBaseURI,
                           nsIURI** _retval) {
  nsresult rv;

  nsCOMPtr<nsIMsgMailNewsUrl> nntpUri =
      do_CreateInstance("@mozilla.org/messenger/nntpurl;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aBaseURI) {
    nsAutoCString newSpec;
    aBaseURI->Resolve(aSpec, newSpec);
    rv = nntpUri->SetSpecInternal(newSpec);
    // XXX Consider: rv = NS_MutateURI(new
    // nsNntpUrl::Mutator()).SetSpec(newSpec).Finalize(nntpUri);
  } else {
    rv = nntpUri->SetSpecInternal(aSpec);
  }
  NS_ENSURE_SUCCESS(rv, rv);

  nntpUri.forget(_retval);
  return NS_OK;
}
