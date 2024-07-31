/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsProtocolHandler.h"

#include "EwsMessageChannel.h"
#include "nsIMsgIncomingServer.h"

NS_IMPL_ISUPPORTS(EwsProtocolHandler, nsIProtocolHandler)

EwsProtocolHandler::EwsProtocolHandler() = default;

EwsProtocolHandler::~EwsProtocolHandler() = default;

NS_IMETHODIMP EwsProtocolHandler::GetScheme(nsACString& aScheme) {
  aScheme.AssignLiteral("x-moz-ews");

  return NS_OK;
}

NS_IMETHODIMP EwsProtocolHandler::NewChannel(nsIURI* aURI,
                                             nsILoadInfo* aLoadinfo,
                                             nsIChannel** _retval) {
  RefPtr<EwsMessageChannel> channel = new EwsMessageChannel(aURI);

  nsresult rv = channel->SetLoadInfo(aLoadinfo);
  NS_ENSURE_SUCCESS(rv, rv);

  channel.forget(_retval);

  return NS_OK;
}

NS_IMETHODIMP EwsProtocolHandler::AllowPort(int32_t port, const char* scheme,
                                            bool* _retval) {
  // Because we control the entire lifetime of message URIs from creation to
  // loading, we should never encounter a port we don't expect.
  MOZ_ASSERT_UNREACHABLE("call to AllowPort on internal protocol");

  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = false;

  return NS_OK;
}
