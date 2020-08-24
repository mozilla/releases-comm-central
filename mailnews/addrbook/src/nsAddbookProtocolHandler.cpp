/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "msgCore.h"  // precompiled header...
#include "nsString.h"

#include "nsAddbookProtocolHandler.h"

#include "nsAddbookUrl.h"
#include "nsAddbookProtocolHandler.h"
#include "nsCOMPtr.h"
#include "nsAbBaseCID.h"
#include "nsNetUtil.h"
#include "nsStringStream.h"
#include "nsIAbCard.h"
#include "nsIAbDirectory.h"
#include "nsIAbManager.h"
#include "prmem.h"
#include "nsIStringBundle.h"
#include "mozilla/Services.h"
#include "nsIAsyncInputStream.h"
#include "nsIAsyncOutputStream.h"
#include "nsIPipe.h"
#include "nsIPrincipal.h"
#include "nsIInputStream.h"
#include "nsCollationCID.h"
#include "nsICollation.h"

nsAddbookProtocolHandler::nsAddbookProtocolHandler() {
  mAddbookOperation = nsIAddbookUrlOperation::InvalidUrl;
}

nsAddbookProtocolHandler::~nsAddbookProtocolHandler() {}

NS_IMPL_ISUPPORTS(nsAddbookProtocolHandler, nsIProtocolHandler)

NS_IMETHODIMP nsAddbookProtocolHandler::GetScheme(nsACString& aScheme) {
  aScheme = "addbook";
  return NS_OK;
}

NS_IMETHODIMP nsAddbookProtocolHandler::GetDefaultPort(int32_t* aDefaultPort) {
  return NS_OK;
}

NS_IMETHODIMP nsAddbookProtocolHandler::GetProtocolFlags(uint32_t* aUritype) {
  *aUritype = URI_STD | URI_LOADABLE_BY_ANYONE | URI_FORBIDS_COOKIE_ACCESS;
  return NS_OK;
}

nsresult nsAddbookProtocolHandler::NewURI(
    const nsACString& aSpec,
    const char* aOriginCharset,  // ignored
    nsIURI* aBaseURI, nsIURI** _retval) {
  nsresult rv;
  nsCOMPtr<nsIURI> uri;
  rv = NS_MutateURI(new nsAddbookUrl::Mutator()).SetSpec(aSpec).Finalize(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  uri.forget(_retval);
  return NS_OK;
}

NS_IMETHODIMP
nsAddbookProtocolHandler::AllowPort(int32_t port, const char* scheme,
                                    bool* _retval) {
  // don't override anything.
  *_retval = false;
  return NS_OK;
}

nsresult nsAddbookProtocolHandler::GenerateXMLOutputChannel(
    nsString& aOutput, nsIAddbookUrl* addbookUrl, nsIURI* aURI,
    nsILoadInfo* aLoadInfo, nsIChannel** _retval) {
  nsresult rv;
  nsCOMPtr<nsIStringInputStream> inStr(
      do_CreateInstance("@mozilla.org/io/string-input-stream;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ConvertUTF16toUTF8 utf8String(aOutput.get());

  rv = inStr->SetData(utf8String.get(), utf8String.Length());
  NS_ENSURE_SUCCESS(rv, rv);

  if (aLoadInfo) {
    return NS_NewInputStreamChannelInternal(_retval, aURI, inStr.forget(),
                                            "text/xml"_ns, EmptyCString(),
                                            aLoadInfo);
  }

  nsCOMPtr<nsIPrincipal> nullPrincipal =
      do_CreateInstance("@mozilla.org/nullprincipal;1", &rv);
  NS_ASSERTION(NS_SUCCEEDED(rv), "CreateInstance of nullprincipalfailed.");
  if (NS_FAILED(rv)) return rv;

  return NS_NewInputStreamChannel(
      _retval, aURI, inStr.forget(), nullPrincipal,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER, "text/xml"_ns);
}

NS_IMETHODIMP
nsAddbookProtocolHandler::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                     nsIChannel** _retval) {
  nsresult rv;
  nsCOMPtr<nsIAddbookUrl> addbookUrl = do_QueryInterface(aURI, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = addbookUrl->GetAddbookOperation(&mAddbookOperation);
  NS_ENSURE_SUCCESS(rv, rv);

  if (mAddbookOperation == nsIAddbookUrlOperation::InvalidUrl) {
    nsAutoString errorString;
    errorString.AssignLiteral("Unsupported format/operation requested for ");
    nsAutoCString spec;
    rv = aURI->GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);

    errorString.Append(NS_ConvertUTF8toUTF16(spec));
    rv = GenerateXMLOutputChannel(errorString, addbookUrl, aURI, aLoadInfo,
                                  _retval);
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  nsString output;
  rv = GeneratePrintOutput(addbookUrl, output);
  if (NS_FAILED(rv)) {
    output.AssignLiteral("failed to print. url=");
    nsAutoCString spec;
    rv = aURI->GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);
    output.Append(NS_ConvertUTF8toUTF16(spec));
  }

  rv = GenerateXMLOutputChannel(output, addbookUrl, aURI, aLoadInfo, _retval);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult nsAddbookProtocolHandler::GeneratePrintOutput(
    nsIAddbookUrl* addbookUrl, nsString& aOutput) {
  NS_ENSURE_ARG_POINTER(addbookUrl);

  nsAutoCString uri;
  nsresult rv = addbookUrl->GetPathQueryRef(uri);
  NS_ENSURE_SUCCESS(rv, rv);

  /* turn
   "//jsaddrbook/abook.sqlite?action=print"
   into "jsaddrbook://abook.sqlite"
  */

  /* step 1:
   turn "//jsaddrbook/abook.sqlite?action=print"
   into "jsaddrbook/abook.sqlite?action=print"
   */
  if (uri[0] != '/' && uri[1] != '/') return NS_ERROR_UNEXPECTED;

  uri.Cut(0, 2);

  /* step 2:
   turn "jsaddrbook/abook.sqlite?action=print"
   into "jsaddrbook/abook.sqlite"
   */
  int32_t pos = uri.Find("?action=print");
  if (pos == -1) return NS_ERROR_UNEXPECTED;

  uri.SetLength(pos);

  /* step 2:
   turn "jsaddrbook/abook.sqlite"
   into "jsaddrbook://abook.sqlite"
   */
  pos = uri.FindChar('/');
  if (pos == -1) return NS_ERROR_UNEXPECTED;

  uri.Insert('/', pos);
  uri.Insert(':', pos);

  nsCOMPtr<nsIAbManager> abManager(do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> directory;
  if (!uri.Equals(kAllDirectoryRoot "?")) {
    rv = abManager->GetDirectory(uri, getter_AddRefs(directory));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = BuildDirectoryXML(directory, aOutput);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

typedef struct CardEnclosure {
  nsCOMPtr<nsIAbCard> card;
  nsString generatedName;
} CardEnclosure;

class CardComparator {
 private:
  nsCOMPtr<nsICollation> mCollation;

  int cmp(CardEnclosure a, CardEnclosure b) const {
    int32_t result;
    mCollation->CompareString(nsICollation::kCollationCaseInSensitive,
                              a.generatedName, b.generatedName, &result);
    return result;
  }

 public:
  CardComparator() {
    nsCOMPtr<nsICollationFactory> factory =
        do_CreateInstance(NS_COLLATIONFACTORY_CONTRACTID);
    factory->CreateCollation(getter_AddRefs(mCollation));
  }

  bool Equals(CardEnclosure a, CardEnclosure b) const { return cmp(a, b) == 0; }
  bool LessThan(CardEnclosure a, CardEnclosure b) const {
    return cmp(a, b) < 0;
  }
};

nsresult EnumerateCards(nsIAbDirectory* aDirectory,
                        nsTArray<CardEnclosure>& aCards,
                        nsIStringBundle* aBundle) {
  if (!aDirectory) return NS_ERROR_UNEXPECTED;

  nsCOMPtr<nsISimpleEnumerator> cardsEnumerator;
  nsCOMPtr<nsIAbCard> card;

  nsresult rv = aDirectory->GetChildCards(getter_AddRefs(cardsEnumerator));
  if (NS_SUCCEEDED(rv) && cardsEnumerator) {
    nsCOMPtr<nsISupports> item;
    bool more;
    while (NS_SUCCEEDED(cardsEnumerator->HasMoreElements(&more)) && more) {
      rv = cardsEnumerator->GetNext(getter_AddRefs(item));
      if (NS_SUCCEEDED(rv)) {
        nsCOMPtr<nsIAbCard> card = do_QueryInterface(item);
        CardEnclosure enclosure = CardEnclosure();
        enclosure.card = card;
        card->GenerateName(0, aBundle, enclosure.generatedName);
        aCards.AppendElement(enclosure);
      }
    }
  }

  return NS_OK;
}

nsresult nsAddbookProtocolHandler::BuildDirectoryXML(nsIAbDirectory* aDirectory,
                                                     nsString& aOutput) {
  nsresult rv;

  aOutput.AppendLiteral(
      "<?xml version=\"1.0\"?>\n"
      "<?xml-stylesheet type=\"text/css\" "
      "href=\"chrome://messagebody/content/addressbook/print.css\"?>\n"
      "<directory>\n");

  // Get Address Book string and set it as title of XML document
  nsCOMPtr<nsIStringBundle> bundle;
  nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::services::GetStringBundleService();
  if (stringBundleService) {
    rv = stringBundleService->CreateBundle(
        "chrome://messenger/locale/addressbook/addressBook.properties",
        getter_AddRefs(bundle));
    if (NS_SUCCEEDED(rv)) {
      nsString addrBook;
      rv = bundle->GetStringFromName("addressBook", addrBook);
      if (NS_SUCCEEDED(rv)) {
        aOutput.AppendLiteral("<title xmlns=\"http://www.w3.org/1999/xhtml\">");
        aOutput.Append(addrBook);
        aOutput.AppendLiteral("</title>\n");
      }
    }
  }

  nsTArray<CardEnclosure> cards;
  if (aDirectory) {
    EnumerateCards(aDirectory, cards, bundle);
  } else {
    nsCOMPtr<nsIAbManager> abManager(
        do_GetService(NS_ABMANAGER_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsISimpleEnumerator> enumerator;
    rv = abManager->GetDirectories(getter_AddRefs(enumerator));
    NS_ENSURE_SUCCESS(rv, rv);

    bool hasMore = false;
    nsCOMPtr<nsISupports> support;
    nsCOMPtr<nsIAbDirectory> directory;
    while (NS_SUCCEEDED(enumerator->HasMoreElements(&hasMore)) && hasMore) {
      rv = enumerator->GetNext(getter_AddRefs(support));
      NS_ENSURE_SUCCESS(rv, rv);
      directory = do_QueryInterface(support, &rv);

      // If, for some reason, we are unable to get a directory, we continue.
      if (NS_FAILED(rv)) continue;

      rv = EnumerateCards(directory, cards, bundle);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  CardComparator cardComparator = CardComparator();
  cards.Sort(cardComparator);

  for (CardEnclosure enclosure : cards) {
    bool isMailList;
    if (NS_FAILED(enclosure.card->GetIsMailList(&isMailList)) || isMailList) {
      continue;
    }

    nsCString xmlSubstr;

    rv = enclosure.card->TranslateTo("xml"_ns, xmlSubstr);
    NS_ENSURE_SUCCESS(rv, rv);

    aOutput.AppendLiteral("<separator/>");
    aOutput.Append(NS_ConvertUTF8toUTF16(xmlSubstr));
    aOutput.AppendLiteral("<separator/>");
  }

  aOutput.AppendLiteral("</directory>\n");

  return NS_OK;
}
