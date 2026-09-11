/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgPrompts.h"

#include "mozilla/ErrorResult.h"
#include "mozilla/intl/Localization.h"
#include "nsEmbedCID.h"
#include "nsIPromptService.h"
#include "nsIWindowMediator.h"
#include "nsServiceManagerUtils.h"

nsresult ShowSendAlert(const nsACString& aL10nId) {
  RefPtr<mozilla::intl::Localization> l10n =
      mozilla::intl::Localization::Create({"messenger/messageSend.ftl"_ns},
                                          true);
  NS_ENSURE_TRUE(l10n, NS_ERROR_UNEXPECTED);

  nsAutoCString message;
  mozilla::ErrorResult error;
  l10n->FormatValueSync(aL10nId, {}, message, error);
  NS_ENSURE_TRUE(!error.Failed(), error.StealNSResult());

  nsresult rv;
  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIDOMWindowProxy> domWindow;
  nsCOMPtr<nsIWindowMediator> winMed =
      do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  winMed->GetMostRecentWindow(nullptr, getter_AddRefs(domWindow));

  return dlgService->Alert(domWindow, nullptr,
                           NS_ConvertUTF8toUTF16(message).get());
}
