/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsEncryptedMsgURIsService.h"

#include "mozilla/Assertions.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIURL.h"
#include "nsNetUtil.h"

// This service must treat different URI representations of the same message as
// identical. The same message is named by URIs varying along two independent
// dimensions:
//
//   1. Two consumer families use two kinds of URI: the content policy and the
//      banner look up the necko/display URL (mailbox:///folder?...&number=nn);
//      copy-decrypted-to and compose look up the message URI
//      (mailbox-message://folder#nn). These do not reduce to a common key, so
//      producers register both forms per message, one for each family. This is
//      why there are two registrations; normalizing does not remove the need
//      for them.
//
//   2. Within the necko/display family, one message still appears under several
//      forms: file:// vs mailbox:// (a message opened from a file is registered
//      as file:// but displayed as mailbox://) and with or without volatile
//      query bits (?type=...). NormalizeURI collapses these to one key so the
//      necko registration matches whatever necko form a consumer uses.
//
// Normalization (dimension 2) does not bridge the two families (dimension 1);
// the two registrations do. It uses nsIMsgMessageUrl::normalizedSpec (the same
// canonicalization nsMsgContentPolicy uses for principals), which strips the
// volatile query bits. file:// URLs are not mailnews message URLs, so they are
// first mapped to their mailbox display form (mailbox:///<path>?number=0).
//
// normalizedSpec also strips the ref, where a message URI carries its key
// (mailbox-message://folder#nn). Reducing such a URI would drop the key and
// collapse distinct messages, so normalization is restricted to ref-less URIs;
// message URIs key on their raw spec, which is safe because their producer and
// consumer use the identical string. The file mapping is ref-independent.
// Anything else keys on its raw spec.
//
// Keying on the raw spec is the fallback of every step below, so aOut is set
// to it first and only replaced once a normalized form has been obtained. A
// normalized form is accepted only if it is non-empty: an empty key would
// match every other URI whose normalization degrades the same way.
static void NormalizeURI(const nsACString& aURI, nsACString& aOut) {
  aOut = aURI;

  nsCOMPtr<nsIURI> uri;
  if (NS_FAILED(NS_NewURI(getter_AddRefs(uri), aURI))) {
    return;
  }

  bool hasRef = false;
  if (NS_FAILED(uri->GetHasRef(&hasRef))) {
    NS_WARNING("Cannot get ref, keying on the raw spec");
    return;
  }

  nsAutoCString scheme;
  if (NS_FAILED(uri->GetScheme(scheme))) {
    NS_WARNING("Cannot get scheme, keying on the raw spec");
    return;
  }

#ifdef DEBUG
  // Enforce the ref convention normalization relies on: message URIs carry
  // their key in the ref, display/necko URLs do not. file: is excluded (its
  // mapping is ref-independent).
  if (scheme.EqualsLiteral("mailbox-message") ||
      scheme.EqualsLiteral("imap-message") ||
      scheme.EqualsLiteral("news-message")) {
    MOZ_ASSERT(hasRef,
               "message URI without a ref: it would be normalized and could "
               "collapse distinct messages");
  } else if (scheme.EqualsLiteral("mailbox") || scheme.EqualsLiteral("imap") ||
             scheme.EqualsLiteral("news") || scheme.EqualsLiteral("nntp")) {
    MOZ_ASSERT(!hasRef,
               "display URL with a ref: normalization would be skipped");
  }
#endif

  if (!hasRef) {
    nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(uri);
    if (msgUrl) {
      nsAutoCString normalized;
      if (NS_SUCCEEDED(msgUrl->GetNormalizedSpec(normalized)) &&
          !normalized.IsEmpty()) {
        aOut = normalized;
        return;
      }
      NS_WARNING("No normalized spec for message URL, keying on the raw spec");
      return;
    }
  }

  // A .eml opened from a file is a single message (number 0) displayed as
  // mailbox:///<path>?number=0; map the file: URL to that form. GetFilePath
  // drops any query/ref, so this is applied regardless of the ref.
  if (scheme.EqualsLiteral("file")) {
    nsCOMPtr<nsIURL> url = do_QueryInterface(uri);
    nsAutoCString filePath;
    if (url && NS_SUCCEEDED(url->GetFilePath(filePath)) &&
        !filePath.IsEmpty()) {
      nsAutoCString mailboxSpec("mailbox://"_ns);
      mailboxSpec.Append(filePath);
      mailboxSpec.AppendLiteral("?number=0");
      nsCOMPtr<nsIURI> mailboxUri;
      if (NS_SUCCEEDED(NS_NewURI(getter_AddRefs(mailboxUri), mailboxSpec))) {
        nsCOMPtr<nsIMsgMessageUrl> mailboxMsgUrl =
            do_QueryInterface(mailboxUri);
        nsAutoCString normalized;
        if (mailboxMsgUrl &&
            NS_SUCCEEDED(mailboxMsgUrl->GetNormalizedSpec(normalized)) &&
            !normalized.IsEmpty()) {
          aOut = normalized;
          return;
        }
      }
    }
    NS_WARNING(
        "Cannot map file URL to its mailbox form, keying on the raw spec");
  }

  // Everything else (message URIs, non-message schemes) keys on its exact spec,
  // already in aOut.
}

NS_IMPL_ISUPPORTS(nsEncryptedMsgURIsService, nsIEncryptedMsgURIsService)

nsEncryptedMsgURIsService::nsEncryptedMsgURIsService() {}

nsEncryptedMsgURIsService::~nsEncryptedMsgURIsService() {}

NS_IMETHODIMP nsEncryptedMsgURIsService::RememberEncrypted(
    const nsACString& uri) {
  if (uri.IsEmpty()) {
    return NS_ERROR_INVALID_ARG;
  }
  nsAutoCString key;
  NormalizeURI(uri, key);
  // An empty key would match unrelated lookups.
  if (key.IsEmpty()) {
    return NS_ERROR_FAILURE;
  }
  // Assuming duplicates are allowed.
  mEncryptedURIs.AppendElement(key);
  return NS_OK;
}

NS_IMETHODIMP nsEncryptedMsgURIsService::ForgetEncrypted(
    const nsACString& uri) {
  if (uri.IsEmpty()) {
    return NS_ERROR_INVALID_ARG;
  }
  nsAutoCString key;
  NormalizeURI(uri, key);
  if (key.IsEmpty()) {
    return NS_ERROR_FAILURE;
  }
  // Assuming, this will only remove one copy of the string, if the array
  // contains multiple copies of the same string.
  mEncryptedURIs.RemoveElement(key);
  return NS_OK;
}

NS_IMETHODIMP nsEncryptedMsgURIsService::IsEncrypted(const nsACString& uri,
                                                     bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;
  if (uri.IsEmpty()) {
    return NS_OK;
  }
  nsAutoCString key;
  NormalizeURI(uri, key);
  if (key.IsEmpty()) {
    return NS_OK;
  }
  *_retval = mEncryptedURIs.Contains(key);
  return NS_OK;
}
