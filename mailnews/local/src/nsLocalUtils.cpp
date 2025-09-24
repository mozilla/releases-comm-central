/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLocalUtils.h"
#include "prsystem.h"
#include "nsCOMPtr.h"
#include "prmem.h"
// stuff for temporary root folder hack
#include "nsIMsgAccountManager.h"
#include "nsIMsgIncomingServer.h"

#include "nsMsgUtils.h"
#include "nsNetCID.h"
#include "nsIURIMutator.h"
#include "mozilla/Components.h"

// it would be really cool to:
// - cache the last hostname->path match
// - if no such server exists, behave like an old-style mailbox URL
// (i.e. return the mail.directory preference or something)
static nsresult nsGetMailboxServer(const char* uriStr,
                                   nsIMsgIncomingServer** aResult) {
  nsresult rv = NS_OK;

  nsCOMPtr<nsIURL> url;
  rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
           .SetSpec(nsDependentCString(uriStr))
           .Finalize(url);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();
  // find all local mail "no servers" matching the given hostname
  nsCOMPtr<nsIMsgIncomingServer> none_server;
  rv = NS_MutateURI(url).SetScheme("none"_ns).Finalize(url);
  NS_ENSURE_SUCCESS(rv, rv);
  // No unescaping of username or hostname done here.
  // The unescaping is done inside of FindServerByURI
  rv = accountManager->FindServerByURI(url, getter_AddRefs(none_server));
  if (NS_SUCCEEDED(rv)) {
    none_server.forget(aResult);
    return rv;
  }

  // if that fails, look for the rss hosts matching the given hostname
  nsCOMPtr<nsIMsgIncomingServer> rss_server;
  rv = NS_MutateURI(url).SetScheme("rss"_ns).Finalize(url);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = accountManager->FindServerByURI(url, getter_AddRefs(rss_server));
  if (NS_SUCCEEDED(rv)) {
    rss_server.forget(aResult);
    return rv;
  }

  // if that fails, look for the pop hosts matching the given hostname
  nsCOMPtr<nsIMsgIncomingServer> server;
  if (NS_FAILED(rv)) {
    rv = NS_MutateURI(url).SetScheme("pop3"_ns).Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = accountManager->FindServerByURI(url, getter_AddRefs(server));

    // if we can't find a pop server, maybe it's a local message
    // in an imap hierarchy. look for an imap server.
    if (NS_FAILED(rv)) {
      rv = NS_MutateURI(url).SetScheme("imap"_ns).Finalize(url);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = accountManager->FindServerByURI(url, getter_AddRefs(server));
    }
  }
  if (NS_SUCCEEDED(rv)) {
    server.forget(aResult);
    return rv;
  }

  // If you fail after looking at all "pop3", "none" servers, you fail.
  return rv;
}

static nsresult nsLocalURI2Server(const char* uriStr,
                                  nsIMsgIncomingServer** aResult) {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = nsGetMailboxServer(uriStr, getter_AddRefs(server));
  server.forget(aResult);
  return rv;
}

// given rootURI and rootURI##folder, return on-disk path of folder
nsresult nsLocalURI2Path(const char* rootURI, const char* uriStr,
                         nsCString& pathResult) {
  nsresult rv;

  // verify that rootURI starts with "mailbox:/" or "mailbox-message:/"
  if ((PL_strcmp(rootURI, kMailboxRootURI) != 0) &&
      (PL_strcmp(rootURI, kMailboxMessageRootURI) != 0)) {
    return NS_ERROR_FAILURE;
  }

  // verify that uristr starts with rooturi
  nsAutoCString uri(uriStr);
  if (uri.Find(rootURI) != 0) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = nsLocalURI2Server(uriStr, getter_AddRefs(server));

  if (NS_FAILED(rv)) return rv;

  // now ask the server what it's root is
  // and begin pathResult with the mailbox root
  nsCOMPtr<nsIFile> localPath;
  rv = server->GetLocalPath(getter_AddRefs(localPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString localPathStr;
  rv = localPath->GetPath(localPathStr);
  NS_ENSURE_SUCCESS(rv, rv);
  CopyUTF16toUTF8(localPathStr, pathResult);
#if defined(XP_WIN)
  pathResult.Insert('/', 0);
  pathResult.ReplaceChar('\\', '/');
#endif
  const char* curPos = uriStr + PL_strlen(rootURI);
  if (curPos) {
    // advance past hostname
    while ((*curPos) == '/') curPos++;
    while (*curPos && (*curPos) != '/') curPos++;

    nsAutoString newPath;

    // Unescape folder name
    nsCString unescapedStr;
    MsgUnescapeString(nsDependentCString(curPos), 0, unescapedStr);
    NS_MsgCreatePathStringFromFolderURI(unescapedStr.get(), newPath);

    pathResult.Append('/');
    pathResult.Append(NS_ConvertUTF16toUTF8(newPath));
  }

  return NS_OK;
}

/* parses LocalMessageURI
 * mailbox-message://folder1/folder2#123?header=none or
 * mailbox-message://folder1/folder2#1234&part=1.2
 *
 * puts folder URI in folderURI (mailbox://folder1/folder2)
 * message key number in key
 */
nsresult nsParseLocalMessageURI(const nsACString& uri, nsCString& folderURI,
                                nsMsgKey* key) {
  if (!key) return NS_ERROR_NULL_POINTER;

  const nsPromiseFlatCString& uriStr = PromiseFlatCString(uri);
  int32_t keySeparator = uriStr.FindChar('#');
  if (keySeparator != -1) {
    int32_t keyEndSeparator = uriStr.FindCharInSet("?&", keySeparator);
    folderURI = StringHead(uriStr, keySeparator);
    folderURI.Cut(7, 8);  // cut out the -message part of mailbox-message:

    nsAutoCString keyStr;
    if (keyEndSeparator != -1)
      keyStr = Substring(uriStr, keySeparator + 1,
                         keyEndSeparator - (keySeparator + 1));
    else
      keyStr = StringTail(uriStr, uriStr.Length() - (keySeparator + 1));

    *key = msgKeyFromInt(ParseUint64Str(keyStr.get()));
    return NS_OK;
  }
  return NS_ERROR_FAILURE;
}

nsresult nsBuildLocalMessageURI(const nsACString& baseURI, nsMsgKey key,
                                nsACString& uri) {
  // need to convert mailbox://hostname/.. to mailbox-message://hostname/..
  uri.Append(baseURI);
  uri.Append('#');
  uri.AppendInt(key);
  return NS_OK;
}

nsresult nsCreateLocalBaseMessageURI(const nsACString& baseURI,
                                     nsCString& baseMessageURI) {
  nsAutoCString tailURI(baseURI);

  // chop off mailbox:/
  if (tailURI.Find(kMailboxRootURI) == 0)
    tailURI.Cut(0, PL_strlen(kMailboxRootURI));

  baseMessageURI = kMailboxMessageRootURI;
  baseMessageURI += tailURI;

  return NS_OK;
}
