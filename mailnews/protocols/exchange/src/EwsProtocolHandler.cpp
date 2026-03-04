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
  nsCString spec;
  MOZ_TRY(aURI->GetSpec(spec));

  // During "normal" message display, `nsDocShell` takes care of running our own
  // RFC822 converter for us. However, in some cases, we might want to run it
  // ourselves, e.g. when displaying an attachment (inline, PDF, etc.).
  //
  // In the case of displaying an attachment, we need to run our own converter
  // first (before any that `nsDocShell` deems appropriate), because when e.g.
  // displaying a PDF, the message/rfc822->application/pdf conversion and the
  // application/pdf->text/html conversion are each handled by separate stream
  // converters (the former by our own, and the latter by PDF.js).
  //
  // Other cases (with `convert=true` in the query) likely originate from using
  // `EwsService::StreamMessage`. In theory we could run the stream converter
  // there directly, but we want to centralise calls to the stream converter
  // service as much as possible for maintainability.
  bool convert = false;
  if (spec.Find("part=") != kNotFound ||
      spec.Find("convert=true") != kNotFound) {
    convert = true;
  }

  RefPtr<EwsMessageChannel> channel = new EwsMessageChannel(aURI, convert);
  MOZ_TRY(channel->SetLoadInfo(aLoadinfo));

  // Add the attachment disposition. This forces docShell to open the
  // attachment instead of displaying it. Content types we have special
  // handlers for are white-listed. This white list also exists in
  // nsImapService::NewChannel, nsMailboxService::NewChannel and
  // nsNntpService::NewChannel, so if you're changing this, update those too.
  if (spec.Find("part=") >= 0 && spec.Find("type=message/rfc822") < 0 &&
      spec.Find("type=application/x-message-display") < 0 &&
      spec.Find("type=application/pdf") < 0) {
    MOZ_TRY(channel->SetContentDisposition(nsIChannel::DISPOSITION_ATTACHMENT));
  }

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
