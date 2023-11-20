/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessengerBootstrap.h"
#include "nsCOMPtr.h"

#include "nsIMutableArray.h"
#include "nsIMsgFolder.h"
#include "nsIWindowWatcher.h"
#include "nsMsgUtils.h"
#include "nsISupportsPrimitives.h"
#include "mozIDOMWindow.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"

NS_IMPL_ISUPPORTS(nsMessengerBootstrap, nsIMessengerWindowService)

nsMessengerBootstrap::nsMessengerBootstrap() {}

nsMessengerBootstrap::~nsMessengerBootstrap() {}

NS_IMETHODIMP nsMessengerBootstrap::OpenMessengerWindowWithUri(
    const char* windowType, const nsACString& aFolderURI,
    nsMsgKey aMessageKey) {
  bool standAloneMsgWindow = false;
  nsAutoCString chromeUrl("chrome://messenger/content/");
  if (windowType && !strcmp(windowType, "mail:messageWindow")) {
    chromeUrl.AppendLiteral("messageWindow.xhtml");
    standAloneMsgWindow = true;
  } else {
    chromeUrl.AppendLiteral("messenger.xhtml");
  }
  nsresult rv;
  nsCOMPtr<nsIMutableArray> argsArray(
      do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // create scriptable versions of our strings that we can store in our
  // nsIMutableArray....
  if (!aFolderURI.IsEmpty()) {
    if (standAloneMsgWindow) {
      nsCOMPtr<nsIMsgFolder> folder;
      rv = GetExistingFolder(aFolderURI, getter_AddRefs(folder));
      NS_ENSURE_SUCCESS(rv, rv);
      nsAutoCString msgUri;
      folder->GetBaseMessageURI(msgUri);

      nsCOMPtr<nsISupportsCString> scriptableMsgURI(
          do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID));
      NS_ENSURE_TRUE(scriptableMsgURI, NS_ERROR_FAILURE);
      msgUri.Append('#');
      msgUri.AppendInt(aMessageKey, 10);
      scriptableMsgURI->SetData(msgUri);
      argsArray->AppendElement(scriptableMsgURI);
    }
    nsCOMPtr<nsISupportsCString> scriptableFolderURI(
        do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID));
    NS_ENSURE_TRUE(scriptableFolderURI, NS_ERROR_FAILURE);

    scriptableFolderURI->SetData(aFolderURI);
    argsArray->AppendElement(scriptableFolderURI);

    if (!standAloneMsgWindow) {
      nsCOMPtr<nsISupportsPRUint32> scriptableMessageKey(
          do_CreateInstance(NS_SUPPORTS_PRUINT32_CONTRACTID));
      NS_ENSURE_TRUE(scriptableMessageKey, NS_ERROR_FAILURE);
      scriptableMessageKey->SetData(aMessageKey);
      argsArray->AppendElement(scriptableMessageKey);
    }
  }

  nsCOMPtr<nsIWindowWatcher> wwatch(
      do_GetService(NS_WINDOWWATCHER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIDOMWindowProxy> newWindow;
  return wwatch->OpenWindow(0, chromeUrl, "_blank"_ns,
                            "chrome,all,dialog=no"_ns, argsArray,
                            getter_AddRefs(newWindow));
}
