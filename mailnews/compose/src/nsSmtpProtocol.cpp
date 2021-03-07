/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsSmtpProtocol.h"
#include "nscore.h"
#include "nsIStreamListener.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsISocketTransport.h"
#include "nsITransportSecurityInfo.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsMsgBaseCID.h"
#include "nsMsgCompCID.h"
#include "nsIPrompt.h"
#include "nsIAuthPrompt.h"
#include "nsString.h"
#include "nsTextFormatter.h"
#include "nsIMsgIdentity.h"
#include "nsISmtpServer.h"
#include "prtime.h"
#include "mozilla/Logging.h"
#include "nsPrintfCString.h"
#include "prerror.h"
#include "prprf.h"
#include "prmem.h"
#include "plbase64.h"
#include "prnetdb.h"
#include "prsystem.h"
#include "nsMsgUtils.h"
#include "nsIPipe.h"
#include "nsNetUtil.h"
#include "nsIPrefService.h"
#include "nsISSLSocketControl.h"
#include "nsComposeStrings.h"
#include "nsIStringBundle.h"
#include "nsMsgCompUtils.h"
#include "nsIMsgWindow.h"
#include "MailNewsTypes2.h"  // for nsMsgSocketType and nsMsgAuthMethod
#include "nsIIDNService.h"
#include "nsICancelable.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/Services.h"
#include "mozilla/Attributes.h"
#include "mozilla/Preferences.h"
#include "nsINetAddr.h"
#include "nsIProxyInfo.h"

#ifndef XP_UNIX
#  include <stdarg.h>
#endif /* !XP_UNIX */

#undef PostMessage  // avoid to collision with WinUser.h

static mozilla::LazyLogModule SMTPLogModule("SMTP");

using namespace mozilla::mailnews;

/* the output_buffer_size must be larger than the largest possible line
 * 2000 seems good for news
 *
 * jwz: I increased this to 4k since it must be big enough to hold the
 * entire button-bar HTML, and with the new "mailto" format, that can
 * contain arbitrarily long header fields like "references".
 *
 * fortezza: proxy auth is huge, buffer increased to 8k (sigh).
 */
#define OUTPUT_BUFFER_SIZE (4096 * 2)

////////////////////////////////////////////////////////////////////////////////////////////
// TEMPORARY HARD CODED FUNCTIONS
///////////////////////////////////////////////////////////////////////////////////////////

/* based on in NET_ExplainErrorDetails in mkmessag.c */
nsresult nsExplainErrorDetails(nsISmtpUrl* aSmtpUrl, nsresult aCode,
                               const char* arg1, const char* arg2) {
  NS_ENSURE_ARG(aSmtpUrl);

  nsCOMPtr<nsIPrompt> dialog;
  aSmtpUrl->GetPrompt(getter_AddRefs(dialog));
  NS_ENSURE_TRUE(dialog, NS_ERROR_FAILURE);

  nsAutoString msg;
  nsAutoString eMsg;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::services::GetStringBundleService();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv = bundleService->CreateBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties",
      getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  const char* exitString;
#ifdef __GNUC__
// Temporary workaround until bug 783526 is fixed.
#  pragma GCC diagnostic push
#  pragma GCC diagnostic ignored "-Wswitch"
#endif
  switch (aCode) {
    case NS_ERROR_ILLEGAL_LOCALPART:
    case NS_ERROR_SMTP_SERVER_ERROR:
    case NS_ERROR_SMTP_SEND_NOT_ALLOWED:
    case NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED:
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_1:
    case NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2:
    case NS_ERROR_SENDING_FROM_COMMAND:
    case NS_ERROR_SENDING_RCPT_COMMAND:
    case NS_ERROR_SENDING_DATA_COMMAND:
    case NS_ERROR_SENDING_MESSAGE:
    case NS_ERROR_SMTP_GREETING:
    case NS_ERROR_CLIENTID:
    case NS_ERROR_CLIENTID_PERMISSION:
      exitString = errorStringNameForErrorCode(aCode);
      bundle->GetStringFromName(exitString, eMsg);
      if (aCode == NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_1) {
        // Convert the error message argument back to integer since the error
        // message string smtpPermSizeExceeded1 contains a %d.
        // (The special case can be removed if that string ever changes, then
        // %d should be changed to %S.)
        nsTextFormatter::ssprintf(msg, eMsg.get(), atoi(arg1), (void*)nullptr);
      } else {
        // Some error strings contain %s. We're supplying 16-bit strings,
        // so replace those with %S. It's a bit hacky. but it saves
        // us tweaking some pretty old message strings.
        eMsg.ReplaceSubstring(u"%s"_ns, u"%S"_ns);
        nsTextFormatter::ssprintf(
            msg, eMsg.get(), NS_ConvertUTF8toUTF16(arg1).get(),
            arg2 ? NS_ConvertUTF8toUTF16(arg2).get() : nullptr);
      }
      break;
    default:
      NS_WARNING("falling to default error code");
      bundle->GetStringFromName("communicationsError", eMsg);
      nsTextFormatter::ssprintf(msg, eMsg.get(), static_cast<uint32_t>(aCode));
      break;
  }
#ifdef __GNUC__
#  pragma GCC diagnostic pop
#endif

  rv = dialog->Alert(nullptr, msg.get());

  return rv;
}

/* RFC 1891 -- extended smtp value encoding scheme

  5. Additional parameters for RCPT and MAIL commands

  The extended RCPT and MAIL commands are issued by a client when it wishes
  to request a DSN from the server, under certain conditions, for a particular
  recipient. The extended RCPT and MAIL commands are identical to the RCPT and
  MAIL commands defined in [1], except that one or more of the following
  parameters appear after the sender or recipient address, respectively. The
  general syntax for extended SMTP commands is defined in [4].

  NOTE: Although RFC 822 ABNF is used to describe the syntax of these
  parameters, they are not, in the language of that document, "structured field
  bodies". Therefore, while parentheses MAY appear within an emstp-value, they
  are not recognized as comment delimiters.

  The syntax for "esmtp-value" in [4] does not allow SP, "=", control
  characters, or characters outside the traditional ASCII range of 1- 127
  decimal to be transmitted in an esmtp-value. Because the ENVID and ORCPT
  parameters may need to convey values outside this range, the esmtp-values for
  these parameters are encoded as "xtext". "xtext" is formally defined as
  follows:

  xtext = *( xchar / hexchar )

  xchar = any ASCII CHAR between "!" (33) and "~" (126) inclusive, except for
          "+" and "=".

  ; "hexchar"s are intended to encode octets that cannot appear
  ; as ASCII characters within an esmtp-value.

  hexchar = ASCII "+" immediately followed by two upper case hexadecimal digits

  When encoding an octet sequence as xtext:

  + Any ASCII CHAR between "!" and "~" inclusive, except for "+" and "=",
    MAY be encoded as itself. (A CHAR in this range MAY instead be encoded
    as a "hexchar", at the implementor's discretion.)

  + ASCII CHARs that fall outside the range above must be encoded as "hexchar".

 */
/* caller must free the return buffer */
static char* esmtp_value_encode(const char* addr) {
  char* buffer = (char*)PR_Malloc(
      512); /* esmtp ORCPT allow up to 500 chars encoded addresses */
  char *bp = buffer, *bpEnd = buffer + 500;
  int len, i;

  if (!buffer) return NULL;

  *bp = 0;
  if (!addr || *addr == 0) /* this will never happen */
    return buffer;

  for (i = 0, len = PL_strlen(addr); i < len && bp < bpEnd; i++) {
    if (*addr >= 0x21 && *addr <= 0x7E && *addr != '+' && *addr != '=') {
      *bp++ = *addr++;
    } else {
      PR_snprintf(bp, bpEnd - bp, "+%.2X", ((int)*addr++));
      bp += PL_strlen(bp);
    }
  }
  *bp = 0;
  return buffer;
}

////////////////////////////////////////////////////////////////////////////////////////////
// END OF TEMPORARY HARD CODED FUNCTIONS
///////////////////////////////////////////////////////////////////////////////////////////

NS_IMPL_ISUPPORTS_INHERITED(nsSmtpProtocol, nsMsgAsyncWriteProtocol,
                            msgIOAuth2ModuleListener, nsIProtocolProxyCallback)

nsSmtpProtocol::nsSmtpProtocol(nsIURI* aURL)
    : nsMsgAsyncWriteProtocol(aURL), m_dataBuf(nullptr) {}

nsSmtpProtocol::~nsSmtpProtocol() {
  // free our local state
  PR_FREEIF(m_dataBuf);
}

nsresult nsSmtpProtocol::Initialize(nsIURI* aURL) {
  NS_ASSERTION(aURL, "invalid URL passed into Smtp Protocol");
  nsresult rv = NS_OK;

  m_flags = 0;
  m_prefAuthMethods = 0;
  m_failedAuthMethods = 0;
  m_currentAuthMethod = 0;
  m_usernamePrompted = false;
  m_prefSocketType = nsMsgSocketType::trySTARTTLS;
  m_tlsInitiated = false;
  m_clientIDInitialized = false;

  m_url = aURL;  // Needed in nsMsgAsyncWriteProtocol::UpdateProgress().
  m_urlErrorState = NS_ERROR_FAILURE;

  if (aURL) m_runningURL = do_QueryInterface(aURL);

  // extract out message feedback if there is any.
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl = do_QueryInterface(aURL);
  if (mailnewsUrl)
    mailnewsUrl->GetStatusFeedback(getter_AddRefs(m_statusFeedback));

  m_dataBuf = (char*)PR_Malloc(sizeof(char) * OUTPUT_BUFFER_SIZE);
  m_dataBufSize = OUTPUT_BUFFER_SIZE;

  m_nextState = SMTP_START_CONNECT;
  m_nextStateAfterResponse = SMTP_START_CONNECT;
  m_responseCode = 0;
  m_responseCodeEnhanced = 0;
  m_previousResponseCode = 0;
  m_continuationResponse = -1;
  m_tlsEnabled = false;
  m_addressesLeft = 0;

  m_sendDone = false;

  m_sizelimit = 0;
  m_totalMessageSize = 0;
  nsCOMPtr<nsIFile> file;
  m_runningURL->GetPostMessageFile(getter_AddRefs(file));
  if (file) file->GetFileSize(&m_totalMessageSize);

  m_originalContentLength = 0;
  m_totalAmountRead = 0;
  m_DataCommandWasSent = false;

  m_lineStreamBuffer = new nsMsgLineStreamBuffer(OUTPUT_BUFFER_SIZE, true);
  // ** may want to consider caching the server capability to save lots of
  // round trip communication between the client and server
  int32_t authMethod = 0;
  nsCOMPtr<nsISmtpServer> smtpServer;
  m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
  if (smtpServer) {
    smtpServer->GetAuthMethod(&authMethod);
    smtpServer->GetSocketType(&m_prefSocketType);
    smtpServer->GetHelloArgument(m_helloArgument);
    bool clientidEnabled = false;
    if (NS_SUCCEEDED(smtpServer->GetClientidEnabled(&clientidEnabled)) &&
        clientidEnabled)
      smtpServer->GetClientid(m_clientId);
    else
      m_clientId.Truncate();

    // Query for OAuth2 support. If the SMTP server preferences don't allow
    // for OAuth2, then don't carry around the OAuth2 module any longer
    // since we won't need it.
    mOAuth2Support = do_CreateInstance(MSGIOAUTH2MODULE_CONTRACTID);
    if (mOAuth2Support) {
      bool supportsOAuth = false;
      mOAuth2Support->InitFromSmtp(smtpServer, &supportsOAuth);
      if (!supportsOAuth) mOAuth2Support = nullptr;
    }
  }
  InitPrefAuthMethods(authMethod);

  nsAutoCString hostName;
  int32_t port = 0;

  aURL->GetPort(&port);
  aURL->GetAsciiHost(hostName);

  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
          ("SMTP Connecting to: %s:%d", hostName.get(), port));

  bool postMessage = false;
  m_runningURL->GetPostMessage(&postMessage);

  if (postMessage) {
    m_nextState = SMTP_RESPONSE;
    m_nextStateAfterResponse = SMTP_EXTN_LOGIN_RESPONSE;
  }  // if post message

  rv = MsgExamineForProxyAsync(this, this, getter_AddRefs(m_proxyRequest));
  if (NS_FAILED(rv)) {
    rv = InitializeInternal(nullptr);
  }

  return rv;
}

// nsIProtocolProxyCallback
NS_IMETHODIMP
nsSmtpProtocol::OnProxyAvailable(nsICancelable* aRequest, nsIChannel* aChannel,
                                 nsIProxyInfo* aProxyInfo, nsresult aStatus) {
  // No checking of 'aStatus' here, see nsHttpChannel::OnProxyAvailable().
  // Status is non-fatal and we just kick on.
  return InitializeInternal(aProxyInfo);
}

nsresult nsSmtpProtocol::InitializeInternal(nsIProxyInfo* proxyInfo) {
  m_proxyRequest = nullptr;

  // When we are making a secure connection, we need to make sure that we
  // pass an interface requestor down to the socket transport so that PSM can
  // retrieve a nsIPrompt instance if needed.
  nsCOMPtr<nsIInterfaceRequestor> callbacks;
  nsCOMPtr<nsISmtpUrl> smtpUrl(do_QueryInterface(m_url));
  if (smtpUrl) smtpUrl->GetNotificationCallbacks(getter_AddRefs(callbacks));

  int32_t port = 0;
  m_url->GetPort(&port);

  nsAutoCString hostName;
  m_url->GetAsciiHost(hostName);

  nsresult rv;
  if (m_prefSocketType == nsMsgSocketType::SSL)
    rv = OpenNetworkSocketWithInfo(hostName.get(), port, "ssl", proxyInfo,
                                   callbacks);
  else if (m_prefSocketType != nsMsgSocketType::plain) {
    rv = OpenNetworkSocketWithInfo(hostName.get(), port, "starttls", proxyInfo,
                                   callbacks);
    if (NS_FAILED(rv) && m_prefSocketType == nsMsgSocketType::trySTARTTLS) {
      m_prefSocketType = nsMsgSocketType::plain;
      rv = OpenNetworkSocketWithInfo(hostName.get(), port, nullptr, proxyInfo,
                                     callbacks);
    }
  } else
    rv = OpenNetworkSocketWithInfo(hostName.get(), port, nullptr, proxyInfo,
                                   callbacks);

  return LoadUrlInternal(m_url, m_consumer);
}

void nsSmtpProtocol::AppendHelloArgument(nsACString& aResult) {
  nsresult rv;

  // is a custom EHLO/HELO argument configured for the transport to be used?
  if (!m_helloArgument.IsEmpty()) {
    aResult += m_helloArgument;
  } else {
    // is a FQDN known for this system?
    char hostName[256];
    PR_GetSystemInfo(PR_SI_HOSTNAME_UNTRUNCATED, hostName, sizeof hostName);
    if ((hostName[0] != '\0') && (strchr(hostName, '.') != NULL)) {
      nsDependentCString cleanedHostName(hostName);
      // avoid problems with hostnames containing newlines/whitespace
      cleanedHostName.StripWhitespace();
      aResult += cleanedHostName;
    } else {
      nsCOMPtr<nsINetAddr> iaddr;  // IP address for this connection
      // our transport is always a nsISocketTransport
      nsCOMPtr<nsISocketTransport> socketTransport =
          do_QueryInterface(m_transport);
      // should return the interface ip of the SMTP connection
      // minimum case - see bug 68877 and RFC 2821, chapter 4.1.1.1
      rv = socketTransport->GetScriptableSelfAddr(getter_AddRefs(iaddr));

      if (NS_SUCCEEDED(rv)) {
        // turn it into a string
        nsCString ipAddressString;
        rv = iaddr->GetAddress(ipAddressString);
        if (NS_SUCCEEDED(rv)) {
#ifdef DEBUG
          bool v4mapped = false;
          iaddr->GetIsV4Mapped(&v4mapped);
          NS_ASSERTION(!v4mapped, "unexpected IPv4-mapped IPv6 address");
#endif

          uint16_t family = nsINetAddr::FAMILY_INET;
          iaddr->GetFamily(&family);

          if (family == nsINetAddr::FAMILY_INET6)  // IPv6 style address?
            aResult.AppendLiteral("[IPv6:");
          else
            aResult.Append('[');

          aResult.Append(ipAddressString);
          aResult.Append(']');
        }
      }
    }
  }
}

/////////////////////////////////////////////////////////////////////////////////////////////
// we support the nsIStreamListener interface
////////////////////////////////////////////////////////////////////////////////////////////

// stop binding is a "notification" informing us that the stream
// associated with aURL is going away.
NS_IMETHODIMP nsSmtpProtocol::OnStopRequest(nsIRequest* request,
                                            nsresult aStatus) {
  if (NS_FAILED(aStatus)) {
    // Stash the socket transport's securityInfo on the url, in case we need
    // it later (e.g. to help the user set up an exception for a self-signed
    // certificate).
    nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl = do_QueryInterface(m_runningURL);
    nsCOMPtr<nsISocketTransport> strans = do_QueryInterface(m_transport);
    if (strans && mailNewsUrl) {
      nsCOMPtr<nsISupports> secInfo;
      if (NS_SUCCEEDED(strans->GetSecurityInfo(getter_AddRefs(secInfo)))) {
        nsCOMPtr<nsITransportSecurityInfo> transportSecInfo =
            do_QueryInterface(secInfo);
        if (transportSecInfo) {
          mailNewsUrl->SetFailedSecInfo(transportSecInfo);
        }
      }
    }
  }

  bool connDroppedDuringAuth =
      NS_SUCCEEDED(aStatus) && !m_sendDone &&
      (m_nextStateAfterResponse == SMTP_AUTH_LOGIN_STEP0_RESPONSE ||
       m_nextStateAfterResponse == SMTP_AUTH_LOGIN_RESPONSE);
  // Ignore errors handling the QUIT command so fcc can continue. However, if
  // QUIT occurred before DATA command even occurred, allow the error to still
  // inhibit fcc (copy to Sent) since message send was never even attempted.
  if (m_sendDone && NS_FAILED(aStatus) && m_DataCommandWasSent) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
            ("SMTP connection error quitting %" PRIx32 ", ignoring ",
             static_cast<uint32_t>(aStatus)));
    aStatus = NS_OK;
  }
  if (NS_SUCCEEDED(aStatus) && !m_sendDone) {
    // if we are getting OnStopRequest() with NS_OK,
    // but we haven't finished clean, that's spells trouble.
    // it means that the server has dropped us before we could send the whole
    // mail for example, see bug #200647
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
            ("SMTP connection dropped after %d total bytes read",
             m_totalAmountRead));
    if (!connDroppedDuringAuth)
      nsMsgAsyncWriteProtocol::OnStopRequest(nullptr, NS_ERROR_NET_INTERRUPT);
  } else
    nsMsgAsyncWriteProtocol::OnStopRequest(nullptr, aStatus);

  // okay, we've been told that the send is done and the connection is going
  // away. So we need to release all of our state
  nsresult rv = nsMsgAsyncWriteProtocol::CloseSocket();
  // If the server dropped the connection when we were expecting
  // a login response, reprompt for password, and if the user asks,
  // retry the url.
  if (connDroppedDuringAuth) {
    nsCOMPtr<nsIURI> runningURI = do_QueryInterface(m_runningURL);
    nsresult rv = AuthLoginResponse(nullptr, 0);
    if (NS_FAILED(rv)) return rv;
    return LoadUrl(runningURI, nullptr);
  }

  return rv;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// End of nsIStreamListenerSupport
//////////////////////////////////////////////////////////////////////////////////////////////

void nsSmtpProtocol::UpdateStatus(const char* aStatusName) {
  if (m_statusFeedback) {
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::services::GetStringBundleService();
    if (!bundleService) return;
    nsCOMPtr<nsIStringBundle> bundle;
    nsresult rv = bundleService->CreateBundle(
        "chrome://messenger/locale/messengercompose/composeMsgs.properties",
        getter_AddRefs(bundle));
    if (NS_FAILED(rv)) return;
    nsString msg;
    bundle->GetStringFromName(aStatusName, msg);
    UpdateStatusWithString(msg.get());
  }
}

void nsSmtpProtocol::UpdateStatusWithString(const char16_t* aStatusString) {
  if (m_statusFeedback && aStatusString)
    m_statusFeedback->ShowStatusString(nsDependentString(aStatusString));
}

/////////////////////////////////////////////////////////////////////////////////////////////
// Begin protocol state machine functions...
//////////////////////////////////////////////////////////////////////////////////////////////

/*
 * gets the response code from the SMTP server and the
 * response line
 */
nsresult nsSmtpProtocol::SmtpResponse(nsIInputStream* inputStream,
                                      uint32_t length) {
  char* line = nullptr;
  char cont_char;
  uint32_t ln = 0;
  bool pauseForMoreData = false;

  if (!m_lineStreamBuffer)
    // this will force an error and at least we won't crash
    return NS_ERROR_NULL_POINTER;

  line = m_lineStreamBuffer->ReadNextLine(inputStream, ln, pauseForMoreData);

  if (pauseForMoreData || !line) {
    SetFlag(SMTP_PAUSE_FOR_READ); /* pause */
    PR_Free(line);
    return NS_OK;
  }

  m_totalAmountRead += ln;

  // The expected response is in the format:
  // <SMTP code><continuation char>(<optional ESMTP code> )<response text>
  // e.g.: 123 1.2.3 Text
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info, ("SMTP Response: %s", line));
  cont_char = ' '; /* default */
  int chars_read = 0;
  // sscanf() doesn't update m_responseCode if line doesn't start
  // with a number. That can be dangerous. So be sure to set
  // m_responseCode to 0 if no items read.
  if (PR_sscanf(line, "%d%c%n", &m_responseCode, &cont_char, &chars_read) <= 0)
    m_responseCode = 0;
  else if (cont_char != '-') {
    m_responseCodeEnhanced = 0;
    unsigned int codeClass, codeSubject, codeDetail;
    if (PR_sscanf(line + chars_read, "%1u.%1u.%1u ", &codeClass, &codeSubject,
                  &codeDetail) == 3)
      m_responseCodeEnhanced = codeClass * 100 + codeSubject * 10 + codeDetail;
  }

  if (m_continuationResponse == -1) {
    if (cont_char == '-') /* begin continuation */
      m_continuationResponse = m_responseCode;

    // display the whole message if no valid response code or
    // message shorter than 4 chars (chars_read)
    // For now we intentionally leave the ESMTP code in the message text
    // as we do not handle that code so let it for the user to get some clue.
    m_responseText = (m_responseCode >= 100 && PL_strlen(line) > 3)
                         ? line + chars_read
                         : line;
  } else { /* have to continue */
    if (m_continuationResponse == m_responseCode && cont_char == ' ')
      m_continuationResponse = -1; /* ended */

    if (m_responseText.IsEmpty() || m_responseText.Last() != '\n')
      m_responseText += "\n";

    m_responseText += (PL_strlen(line) > 3) ? line + chars_read : line;
  }

  if (m_responseCode == 220 && m_responseText.Length() && !m_tlsInitiated &&
      !m_sendDone)
    m_nextStateAfterResponse = SMTP_EXTN_LOGIN_RESPONSE;

  if (m_continuationResponse == -1) /* all done with this response? */
  {
    m_nextState = m_nextStateAfterResponse;
    ClearFlag(SMTP_PAUSE_FOR_READ); /* don't pause */
  }

  PR_Free(line);
  return NS_OK;
}

nsresult nsSmtpProtocol::ExtensionLoginResponse(nsIInputStream* inputStream,
                                                uint32_t length) {
  nsresult status = NS_OK;

  if (m_responseCode != 220) {
#ifdef DEBUG
    nsresult rv =
#endif
        nsExplainErrorDetails(m_runningURL, NS_ERROR_SMTP_GREETING,
                              m_responseText.get(), nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return NS_ERROR_SMTP_AUTH_FAILURE;
  }

  nsAutoCString buffer("EHLO ");
  AppendHelloArgument(buffer);
  buffer += CRLF;

  status = SendData(buffer.get());

  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_SEND_EHLO_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);

  return (status);
}

nsresult nsSmtpProtocol::SendHeloResponse(nsIInputStream* inputStream,
                                          uint32_t length) {
  nsresult status = NS_OK;
  nsAutoCString buffer;
  nsresult rv;

  if (m_responseCode != 250) {
#ifdef DEBUG
    rv =
#endif
        nsExplainErrorDetails(m_runningURL, NS_ERROR_SMTP_SERVER_ERROR,
                              m_responseText.get(), nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return NS_ERROR_SMTP_AUTH_FAILURE;
  }

  // check if we're just verifying the ability to logon
  nsCOMPtr<nsISmtpUrl> smtpUrl = m_runningURL;
  bool verifyingLogon = false;
  smtpUrl->GetVerifyLogon(&verifyingLogon);
  if (verifyingLogon) return SendQuit();

  // Now that we know whether SMTPUTF8 capability is available
  // compile a minimal list of valid target addresses by
  // - looking only at mailboxes
  // - dropping addresses with invalid localparts (until we implement RFC
  // 6532)
  // - using ACE for IDN domainparts
  // - stripping duplicates
  nsCString addresses;
  m_runningURL->GetRecipients(getter_Copies(addresses));

  ExtractEmails(EncodedHeader(addresses), UTF16ArrayAdapter<>(m_addresses));

  nsCOMPtr<nsIIDNService> converter = do_GetService(NS_IDNSERVICE_CONTRACTID);
  addresses.Truncate();
  uint32_t count = m_addresses.Length();
  for (uint32_t i = 0; i < count; i++) {
    if (TestFlag(SMTP_EHLO_SMTPUTF8_ENABLED) &&
        mozilla::IsUtf8(m_addresses[i])) {
      // UTF-8 address string is allowed and string appears to be valid UTF-8.
      // Skip checks below and use m_addresses[i] as-is.
      continue;
    }
    const char* start = m_addresses[i].get();
    // Location of the @ character
    const char* lastAt = nullptr;
    const char* ch = start;
    for (; *ch; ch++) {
      if (*ch == '@') lastAt = ch;
      // Check for first illegal character (outside 0x09,0x20-0x7e)
      else if ((*ch < ' ' || *ch > '~') && (*ch != '\t')) {
        break;
      }
    }
    // validate the just parsed address
    if (*ch || m_addresses[i].IsEmpty()) {
      // Fortunately, we will always have an @ in each mailbox address unless
      // it is an empty string. (Attempts to send to addresses without the @
      // arrive here as empty.)  We try to fix non-ascii characters in the
      // domain part by converting that to ACE (a.k.a., punycode). Non-ascii
      // characters in the local part are not fixable so we error out in that
      // case as well. Note: non-ascii but legal UTF-8 characters on both side
      // of the @ are OK when SMTPUTF8 is in effect (see above).
      nsresult rv = NS_ERROR_FAILURE;  // anything but NS_OK
      if (lastAt) {
        // Illegal char in the domain part, hence convert to ACE
        nsAutoCString domain;
        domain.Assign(lastAt + 1);
        rv = converter->ConvertUTF8toACE(domain, domain);
        if (NS_SUCCEEDED(rv)) {
          m_addresses[i].SetLength(lastAt - start + 1);
          m_addresses[i] += domain;
        }
      }
      if (NS_FAILED(rv)) {
        // Throw an error, including the broken address
        m_nextState = SMTP_ERROR_DONE;
        ClearFlag(SMTP_PAUSE_FOR_READ);
        // Unfortunately, nsExplainErrorDetails will show the error above
        // the mailnews main window, because we don't necessarily get
        // passed down a compose window - we might be sending in the
        // background!
        rv = nsExplainErrorDetails(m_runningURL, NS_ERROR_ILLEGAL_LOCALPART,
                                   start, nullptr);
        NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain illegal localpart");
        m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
        return NS_OK;
      }
    }
  }

  // final cleanup
  m_addressesLeft = m_addresses.Length();

  // hmm no addresses to send message to...
  if (m_addressesLeft == 0) {
    m_nextState = SMTP_ERROR_DONE;
    ClearFlag(SMTP_PAUSE_FOR_READ);
    m_urlErrorState = NS_MSG_NO_RECIPIENTS;
    return NS_MSG_NO_RECIPIENTS;
  }

  nsCOMPtr<nsIPrefService> prefs =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefs->GetBranch(nullptr, getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  bool useSenderForSmtpMailFrom = false;
  prefBranch->GetBoolPref("mail.smtp.useSenderForSmtpMailFrom",
                          &useSenderForSmtpMailFrom);
  nsCString fullAddress;

  if (useSenderForSmtpMailFrom) {
    // Extract the email address from the mail headers.
    nsCString from;
    m_runningURL->GetSender(getter_Copies(from));

    ExtractEmail(EncodedHeader(from), fullAddress);
    if (fullAddress.IsEmpty()) {
      m_urlErrorState = NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS;
      return (NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS);
    }
  } else {
    // Extract the email address from the identity.
    nsCString emailAddress;
    nsCOMPtr<nsIMsgIdentity> senderIdentity;
    rv = m_runningURL->GetSenderIdentity(getter_AddRefs(senderIdentity));
    if (NS_FAILED(rv) || !senderIdentity) {
      m_urlErrorState = NS_ERROR_COULD_NOT_GET_SENDERS_IDENTITY;
      return (NS_ERROR_COULD_NOT_GET_SENDERS_IDENTITY);
    }
    senderIdentity->GetEmail(emailAddress);
    if (emailAddress.IsEmpty()) {
      m_urlErrorState = NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS;
      return (NS_ERROR_COULD_NOT_GET_USERS_MAIL_ADDRESS);
    }

    // Quote the email address before passing it to the SMTP server.
    MakeMimeAddress(EmptyCString(), emailAddress, fullAddress);
  }
  buffer = "MAIL FROM:<";
  buffer += fullAddress;
  buffer += ">";

  if (TestFlag(SMTP_EHLO_DSN_ENABLED)) {
    bool requestDSN = false;
    rv = m_runningURL->GetRequestDSN(&requestDSN);

    if (requestDSN) {
      bool requestRetFull = false;
      rv = prefBranch->GetBoolPref("mail.dsn.ret_full_on", &requestRetFull);

      buffer += requestRetFull ? " RET=FULL" : " RET=HDRS";

      nsCString dsnEnvid;

      // get the envid from the smtpUrl
      rv = m_runningURL->GetDsnEnvid(dsnEnvid);

      if (dsnEnvid.IsEmpty()) {
        nsCOMPtr<nsIMsgIdentity> senderIdentity;
        rv = m_runningURL->GetSenderIdentity(getter_AddRefs(senderIdentity));
        if (NS_FAILED(rv) || !senderIdentity) {
          m_urlErrorState = NS_ERROR_COULD_NOT_GET_SENDERS_IDENTITY;
          return (NS_ERROR_COULD_NOT_GET_SENDERS_IDENTITY);
        }
        dsnEnvid.Adopt(msg_generate_message_id(senderIdentity));
      }
      buffer += " ENVID=";
      buffer += dsnEnvid;
    }
  }

  if (TestFlag(SMTP_EHLO_8BITMIME_ENABLED)) {
    bool strictlyMime = false;
    rv = prefBranch->GetBoolPref("mail.strictly_mime", &strictlyMime);

    if (!strictlyMime) buffer.AppendLiteral(" BODY=8BITMIME");
  }

  if (TestFlag(SMTP_EHLO_SMTPUTF8_ENABLED)) buffer.AppendLiteral(" SMTPUTF8");

  if (TestFlag(SMTP_EHLO_SIZE_ENABLED)) {
    buffer.AppendLiteral(" SIZE=");
    buffer.AppendInt(m_totalMessageSize);
  }
  buffer += CRLF;

  status = SendData(buffer.get());

  m_nextState = SMTP_RESPONSE;

  m_nextStateAfterResponse = SMTP_SEND_MAIL_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);
  return (status);
}

nsresult nsSmtpProtocol::SendEhloResponse(nsIInputStream* inputStream,
                                          uint32_t length) {
  nsresult status = NS_OK;

  if (m_responseCode != 250) {
    /* EHLO must not be implemented by the server, so fall back to the HELO case
     * if command is unrecognized or unimplemented.
     */
    if (m_responseCode == 500 || m_responseCode == 502) {
      /* If STARTTLS is requested by the user, EHLO is required to advertise it.
       * But only if TLS handshake is not already accomplished.
       */
      if (m_prefSocketType == nsMsgSocketType::alwaysSTARTTLS &&
          !m_tlsEnabled) {
        m_nextState = SMTP_ERROR_DONE;
        m_urlErrorState = NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS;
        return (NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS);
      }

      nsAutoCString buffer("HELO ");
      AppendHelloArgument(buffer);
      buffer += CRLF;

      status = SendData(buffer.get());

      m_nextState = SMTP_RESPONSE;
      m_nextStateAfterResponse = SMTP_SEND_HELO_RESPONSE;
      SetFlag(SMTP_PAUSE_FOR_READ);
      return (status);
    }
    /* e.g. getting 421 "Server says unauthorized, bye" or
     * 501 "Syntax error in EHLOs parameters or arguments"
     */
    else {
#ifdef DEBUG
      nsresult rv =
#endif
          nsExplainErrorDetails(m_runningURL, NS_ERROR_SMTP_SERVER_ERROR,
                                m_responseText.get(), nullptr);
      NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

      m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
      return NS_ERROR_SMTP_AUTH_FAILURE;
    }
  }

  int32_t responseLength = m_responseText.Length();
  int32_t startPos = 0;
  int32_t endPos;
  do {
    endPos = m_responseText.FindChar('\n', startPos + 1);
    nsAutoCString responseLine;
    responseLine.Assign(
        Substring(m_responseText, startPos,
                  (endPos >= 0 ? endPos : responseLength) - startPos));

    responseLine.CompressWhitespace();
    if (responseLine.LowerCaseEqualsLiteral("starttls")) {
      SetFlag(SMTP_EHLO_STARTTLS_ENABLED);
    } else if (responseLine.LowerCaseEqualsLiteral("dsn")) {
      SetFlag(SMTP_EHLO_DSN_ENABLED);
    } else if (responseLine.LowerCaseEqualsLiteral("clientid")) {
      SetFlag(SMTP_EHLO_CLIENTID_ENABLED);
      // If we have "clientid" in the ehlo response, then TLS must be present.
      if (m_prefSocketType == nsMsgSocketType::SSL) m_tlsEnabled = true;
    } else if (StringBeginsWith(responseLine, "AUTH"_ns,
                                nsCaseInsensitiveCStringComparator)) {
      SetFlag(SMTP_AUTH);

      if (responseLine.Find("GSSAPI"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_GSSAPI_ENABLED);

      if (responseLine.Find("CRAM-MD5"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_CRAM_MD5_ENABLED);

      if (responseLine.Find("NTLM"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_NTLM_ENABLED);

      if (responseLine.Find("MSN"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_MSN_ENABLED);

      if (responseLine.Find("PLAIN"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_PLAIN_ENABLED);

      if (responseLine.Find("LOGIN"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_LOGIN_ENABLED);

      if (responseLine.Find("EXTERNAL"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_EXTERNAL_ENABLED);

      if (responseLine.Find("XOAUTH2"_ns,
                            /* ignoreCase = */ true) >= 0)
        SetFlag(SMTP_AUTH_OAUTH2_ENABLED);
    } else if (StringBeginsWith(responseLine, "SIZE"_ns,
                                nsCaseInsensitiveCStringComparator)) {
      SetFlag(SMTP_EHLO_SIZE_ENABLED);

      m_sizelimit = atol((responseLine.get()) + 4);
    } else if (StringBeginsWith(responseLine, "8BITMIME"_ns,
                                nsCaseInsensitiveCStringComparator)) {
      SetFlag(SMTP_EHLO_8BITMIME_ENABLED);
    } else if (StringBeginsWith(responseLine, "SMTPUTF8"_ns,
                                nsCaseInsensitiveCStringComparator)) {
      SetFlag(SMTP_EHLO_SMTPUTF8_ENABLED);
    }

    startPos = endPos + 1;
  } while (endPos >= 0);

  if (TestFlag(SMTP_EHLO_SIZE_ENABLED) && m_sizelimit > 0 &&
      (int32_t)m_totalMessageSize > m_sizelimit) {
#ifdef DEBUG
    nsresult rv =
#endif
        nsExplainErrorDetails(m_runningURL, NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_1,
                              nsPrintfCString("%" PRId32, m_sizelimit).get(),
                              nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return (NS_ERROR_SENDING_FROM_COMMAND);
  }

  m_nextState = SMTP_AUTH_PROCESS_STATE;
  return status;
}

nsresult nsSmtpProtocol::SendTLSResponse() {
  // only tear down our existing connection and open a new one if we received a
  // 220 response from the smtp server after we issued the STARTTLS
  nsresult rv = NS_OK;
  if (m_responseCode == 220) {
    nsCOMPtr<nsISupports> secInfo;
    nsCOMPtr<nsISocketTransport> strans = do_QueryInterface(m_transport, &rv);
    if (NS_FAILED(rv)) return rv;

    rv = strans->GetSecurityInfo(getter_AddRefs(secInfo));

    if (NS_SUCCEEDED(rv) && secInfo) {
      nsCOMPtr<nsISSLSocketControl> sslControl =
          do_QueryInterface(secInfo, &rv);

      if (NS_SUCCEEDED(rv) && sslControl) rv = sslControl->StartTLS();
    }

    if (NS_SUCCEEDED(rv)) {
      m_nextState = SMTP_EXTN_LOGIN_RESPONSE;
      m_nextStateAfterResponse = SMTP_EXTN_LOGIN_RESPONSE;
      m_tlsEnabled = true;
      m_flags = 0;  // resetting the flags
      return rv;
    }
  }

  ClearFlag(SMTP_EHLO_STARTTLS_ENABLED);
  m_tlsInitiated = false;
  m_nextState = SMTP_AUTH_PROCESS_STATE;

  return rv;
}

nsresult nsSmtpProtocol::SendClientIDResponse() {
  if (m_responseCode / 10 == 25) {
    // ClientID success!
    m_clientIDInitialized = true;
    ClearFlag(SMTP_EHLO_CLIENTID_ENABLED);
    m_nextState = SMTP_AUTH_PROCESS_STATE;
    return NS_OK;
  }
  // ClientID failed
  nsresult errorCode;
  if (m_responseCode == 550) {
    // 'You are not permitted to access this'
    // 'Access Denied' + server response
    errorCode = NS_ERROR_CLIENTID_PERMISSION;
  } else {
    if (MOZ_LOG_TEST(SMTPLogModule, mozilla::LogLevel::Error)) {
      if (m_responseCode != 501 && m_responseCode != 503 &&
          m_responseCode != 504 && m_responseCode / 100 != 4) {
        // If not 501, 503, 504 or 4xx, log an error.
        MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
                ("SendClientIDResponse: Unexpected error occurred, server "
                 "responded: %s\n",
                 m_responseText.get()));
      }
    }
    errorCode = NS_ERROR_CLIENTID;
  }
  nsExplainErrorDetails(m_runningURL, errorCode, m_responseText.get(), nullptr);
  m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
  return NS_ERROR_SMTP_AUTH_FAILURE;
}

void nsSmtpProtocol::InitPrefAuthMethods(int32_t authMethodPrefValue) {
  // for m_prefAuthMethods, using the same flags as server capabilities.
  switch (authMethodPrefValue) {
    case nsMsgAuthMethod::none:
      m_prefAuthMethods = SMTP_AUTH_NONE_ENABLED;
      break;
    // case nsMsgAuthMethod::old -- no such thing for SMTP
    case nsMsgAuthMethod::passwordCleartext:
      m_prefAuthMethods = SMTP_AUTH_LOGIN_ENABLED | SMTP_AUTH_PLAIN_ENABLED;
      break;
    case nsMsgAuthMethod::passwordEncrypted:
      m_prefAuthMethods = SMTP_AUTH_CRAM_MD5_ENABLED;
      break;
    case nsMsgAuthMethod::NTLM:
      m_prefAuthMethods = SMTP_AUTH_NTLM_ENABLED | SMTP_AUTH_MSN_ENABLED;
      break;
    case nsMsgAuthMethod::GSSAPI:
      m_prefAuthMethods = SMTP_AUTH_GSSAPI_ENABLED;
      break;
    case nsMsgAuthMethod::OAuth2:
      m_prefAuthMethods = SMTP_AUTH_OAUTH2_ENABLED;
      break;
    case nsMsgAuthMethod::secure:
      m_prefAuthMethods =
          SMTP_AUTH_CRAM_MD5_ENABLED | SMTP_AUTH_GSSAPI_ENABLED |
          SMTP_AUTH_NTLM_ENABLED | SMTP_AUTH_MSN_ENABLED |
          SMTP_AUTH_EXTERNAL_ENABLED;  // TODO: Expose EXTERNAL? How?
      break;
    default:
      NS_ASSERTION(false, "SMTP: authMethod pref invalid");
      // TODO log to error console
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
              ("SMTP: bad pref authMethod = %d\n", authMethodPrefValue));
      // fall to any
      [[fallthrough]];
    case nsMsgAuthMethod::anything:
      m_prefAuthMethods = SMTP_AUTH_LOGIN_ENABLED | SMTP_AUTH_PLAIN_ENABLED |
                          SMTP_AUTH_CRAM_MD5_ENABLED |
                          SMTP_AUTH_GSSAPI_ENABLED | SMTP_AUTH_NTLM_ENABLED |
                          SMTP_AUTH_MSN_ENABLED | SMTP_AUTH_OAUTH2_ENABLED |
                          SMTP_AUTH_EXTERNAL_ENABLED;
      break;
  }

  // Only enable OAuth2 support if we can do the lookup.
  if ((m_prefAuthMethods & SMTP_AUTH_OAUTH2_ENABLED) && !mOAuth2Support)
    m_prefAuthMethods &= ~SMTP_AUTH_OAUTH2_ENABLED;

  NS_ASSERTION(m_prefAuthMethods != 0, "SMTP:InitPrefAuthMethods() failed");
}

/**
 * Changes m_currentAuthMethod to pick the next-best one
 * which is allowed by server and prefs and not marked failed.
 * The order of preference and trying of auth methods is encoded here.
 */
nsresult nsSmtpProtocol::ChooseAuthMethod() {
  int32_t serverCaps = m_flags;  // from nsMsgProtocol::TestFlag()
  int32_t availCaps = serverCaps & m_prefAuthMethods & ~m_failedAuthMethods;

  // clang-format off
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP auth: server caps 0x%X, pref 0x%X, failed 0x%X, avail caps 0x%X",
           serverCaps, m_prefAuthMethods, m_failedAuthMethods, availCaps));
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("(GSSAPI = 0x%X, CRAM = 0x%X, NTLM = 0x%X, "
           "MSN =  0x%X, PLAIN = 0x%X, LOGIN = 0x%X, EXTERNAL = 0x%X)",
           SMTP_AUTH_GSSAPI_ENABLED, SMTP_AUTH_CRAM_MD5_ENABLED,
           SMTP_AUTH_NTLM_ENABLED, SMTP_AUTH_MSN_ENABLED, SMTP_AUTH_PLAIN_ENABLED,
           SMTP_AUTH_LOGIN_ENABLED, SMTP_AUTH_EXTERNAL_ENABLED));
  // clang-format on

  if (SMTP_AUTH_GSSAPI_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_GSSAPI_ENABLED;
  else if (SMTP_AUTH_CRAM_MD5_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_CRAM_MD5_ENABLED;
  else if (SMTP_AUTH_NTLM_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_NTLM_ENABLED;
  else if (SMTP_AUTH_MSN_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_MSN_ENABLED;
  else if (SMTP_AUTH_OAUTH2_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_OAUTH2_ENABLED;
  else if (SMTP_AUTH_PLAIN_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_PLAIN_ENABLED;
  else if (SMTP_AUTH_LOGIN_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_LOGIN_ENABLED;
  else if (SMTP_AUTH_EXTERNAL_ENABLED & availCaps)
    m_currentAuthMethod = SMTP_AUTH_EXTERNAL_ENABLED;
  else {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
            ("no auth method remaining"));
    m_currentAuthMethod = 0;
    return NS_ERROR_SMTP_AUTH_FAILURE;
  }
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("trying auth method 0x%X", m_currentAuthMethod));
  return NS_OK;
}

void nsSmtpProtocol::MarkAuthMethodAsFailed(int32_t failedAuthMethod) {
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("marking auth method 0x%X failed", failedAuthMethod));
  m_failedAuthMethods |= failedAuthMethod;
}

/**
 * Start over, trying all auth methods again
 */
void nsSmtpProtocol::ResetAuthMethods() {
  m_currentAuthMethod = 0;
  m_failedAuthMethods = 0;
}

nsresult nsSmtpProtocol::ProcessAuth() {
  nsresult status = NS_OK;
  nsAutoCString buffer;

  if (!m_tlsEnabled) {
    if (TestFlag(SMTP_EHLO_STARTTLS_ENABLED)) {
      // Do not try to combine SMTPS with STARTTLS.
      // If nsMsgSocketType::SSL is set,
      // we are already using a secure connection.
      // Do not attempt to do STARTTLS,
      // even if server offers it.
      if (m_prefSocketType == nsMsgSocketType::trySTARTTLS ||
          m_prefSocketType == nsMsgSocketType::alwaysSTARTTLS) {
        buffer = "STARTTLS";
        buffer += CRLF;

        status = SendData(buffer.get());

        m_tlsInitiated = true;

        m_nextState = SMTP_RESPONSE;
        m_nextStateAfterResponse = SMTP_TLS_RESPONSE;
        SetFlag(SMTP_PAUSE_FOR_READ);
        return status;
      }
    } else if (m_prefSocketType == nsMsgSocketType::alwaysSTARTTLS) {
      m_nextState = SMTP_ERROR_DONE;
      m_urlErrorState = NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS;
      return NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS;
    }
  }

  if (!m_clientIDInitialized && m_tlsEnabled && !m_clientId.IsEmpty()) {
    if (TestFlag(SMTP_EHLO_CLIENTID_ENABLED)) {
      buffer = "CLIENTID UUID ";
      buffer += m_clientId;
      buffer += CRLF;
      status = SendData(buffer.get());
      m_nextState = SMTP_RESPONSE;
      m_nextStateAfterResponse = SMTP_CLIENTID_RESPONSE;
      SetFlag(SMTP_PAUSE_FOR_READ);
      return status;
    }
  }

  (void)ChooseAuthMethod();  // advance m_currentAuthMethod

  // We don't need to auth, per pref, or the server doesn't advertise AUTH,
  // so skip auth and try to send message.
  if (m_prefAuthMethods == SMTP_AUTH_NONE_ENABLED || !TestFlag(SMTP_AUTH)) {
    m_nextState = SMTP_SEND_HELO_RESPONSE;
    // fake to 250 because SendHeloResponse() tests for this
    m_responseCode = 250;
  } else if (m_currentAuthMethod == SMTP_AUTH_EXTERNAL_ENABLED) {
    buffer = "AUTH EXTERNAL =";
    buffer += CRLF;
    SendData(buffer.get());
    m_nextState = SMTP_RESPONSE;
    m_nextStateAfterResponse = SMTP_AUTH_EXTERNAL_RESPONSE;
    SetFlag(SMTP_PAUSE_FOR_READ);
    return NS_OK;
  } else if (m_currentAuthMethod == SMTP_AUTH_GSSAPI_ENABLED) {
    m_nextState = SMTP_SEND_AUTH_GSSAPI_FIRST;
  } else if (m_currentAuthMethod == SMTP_AUTH_CRAM_MD5_ENABLED ||
             m_currentAuthMethod == SMTP_AUTH_PLAIN_ENABLED ||
             m_currentAuthMethod == SMTP_AUTH_NTLM_ENABLED) {
    m_nextState = SMTP_SEND_AUTH_LOGIN_STEP1;
  } else if (m_currentAuthMethod == SMTP_AUTH_LOGIN_ENABLED ||
             m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED) {
    m_nextState = SMTP_SEND_AUTH_LOGIN_STEP0;
  } else if (m_currentAuthMethod == SMTP_AUTH_OAUTH2_ENABLED) {
    m_nextState = SMTP_AUTH_OAUTH2_STEP;
  } else  // All auth methods failed
  {
    // show an appropriate error msg
    if (m_failedAuthMethods == 0) {
      // we didn't even try anything, so we had a non-working config:
      // pref doesn't match server
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
              ("no working auth mech - pref doesn't match server capas"));

      // pref has encrypted pw & server claims to support plaintext pw
      if (m_prefAuthMethods == SMTP_AUTH_CRAM_MD5_ENABLED &&
          m_flags & (SMTP_AUTH_LOGIN_ENABLED | SMTP_AUTH_PLAIN_ENABLED)) {
        // have SSL
        if (m_prefSocketType == nsMsgSocketType::SSL ||
            m_prefSocketType == nsMsgSocketType::alwaysSTARTTLS)
          // tell user to change to plaintext pw
          m_urlErrorState = NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL;
        else
          // tell user to change to plaintext pw, with big warning
          m_urlErrorState = NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL;
      }
      // pref has plaintext pw & server claims to support encrypted pw
      else if (m_prefAuthMethods ==
                   (SMTP_AUTH_LOGIN_ENABLED | SMTP_AUTH_PLAIN_ENABLED) &&
               m_flags & SMTP_AUTH_CRAM_MD5_ENABLED)
        // tell user to change to encrypted pw
        m_urlErrorState = NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT;
      else {
        // just "change auth method"
        m_urlErrorState = NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED;
      }
    } else if (m_failedAuthMethods == SMTP_AUTH_GSSAPI_ENABLED) {
      // We have only GSSAPI, and it failed, so nothing left to do.
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
              ("GSSAPI only and it failed"));
      m_urlErrorState = NS_ERROR_SMTP_AUTH_GSSAPI;
    } else {
      // we tried to login, but it all failed
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
              ("All auth attempts failed"));
      m_urlErrorState = NS_ERROR_SMTP_AUTH_FAILURE;
    }
    m_nextState = SMTP_ERROR_DONE;
    return NS_ERROR_SMTP_AUTH_FAILURE;
  }

  return NS_OK;
}

nsresult nsSmtpProtocol::AuthLoginResponse(nsIInputStream* stream,
                                           uint32_t length) {
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP Login response, code %d", m_responseCode));
  nsresult status = NS_OK;

  switch (m_responseCode / 100) {
    case 2:
      m_nextState = SMTP_SEND_HELO_RESPONSE;
      // fake to 250 because SendHeloResponse() tests for this
      m_responseCode = 250;
      break;
    case 3:
      m_nextState = SMTP_SEND_AUTH_LOGIN_STEP2;
      break;
    case 5:
    default:
      nsCOMPtr<nsISmtpServer> smtpServer;
      m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
      if (smtpServer) {
        // If one authentication failed, mark it failed, so that we're going to
        // fall back on a less secure login method.
        MarkAuthMethodAsFailed(m_currentAuthMethod);

        bool allFailed = NS_FAILED(ChooseAuthMethod());
        if (allFailed && m_failedAuthMethods > 0 &&
            m_failedAuthMethods != SMTP_AUTH_GSSAPI_ENABLED &&
            m_failedAuthMethods != SMTP_AUTH_EXTERNAL_ENABLED) {
          // We've tried all avail. methods, and they all failed, and we have no
          // mechanism left. Ask user to try with a new password.
          MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Warning,
                  ("SMTP: ask user what to do (after login failed): new "
                   "password, retry or cancel"));

          nsCOMPtr<nsISmtpServer> smtpServer;
          nsresult rv = m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
          NS_ENSURE_SUCCESS(rv, rv);

          nsCString hostname;
          rv = smtpServer->GetHostname(hostname);
          NS_ENSURE_SUCCESS(rv, rv);

          nsCString username;
          rv = smtpServer->GetUsername(username);
          NS_ENSURE_SUCCESS(rv, rv);

          nsCString accountname;
          rv = smtpServer->GetDescription(accountname);
          NS_ENSURE_SUCCESS(rv, rv);
          NS_ConvertUTF8toUTF16 accountNameUTF16(accountname);

          int32_t buttonPressed = 1;
          if (NS_SUCCEEDED(MsgPromptLoginFailed(nullptr, hostname, username,
                                                accountNameUTF16,
                                                &buttonPressed))) {
            if (buttonPressed == 1)  // Cancel button
            {
              MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Warning,
                      ("cancel button pressed"));
              // abort and get out of here
              status = NS_ERROR_ABORT;
              break;
            } else if (buttonPressed == 2)  // 'New password' button
            {
              MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Warning,
                      ("new password button pressed"));
              // Change password was pressed. For now, forget the stored
              // password and we'll prompt for a new one next time around.
              smtpServer->ForgetPassword();
              if (m_usernamePrompted) smtpServer->SetUsername(EmptyCString());

              // Let's restore the original auth flags from SendEhloResponse
              // so we can try them again with new password and username
              ResetAuthMethods();
              // except for GSSAPI and EXTERNAL, which don't care about
              // passwords.
              MarkAuthMethodAsFailed(SMTP_AUTH_GSSAPI_ENABLED);
              MarkAuthMethodAsFailed(SMTP_AUTH_EXTERNAL_ENABLED);
            } else if (buttonPressed == 0)  // Retry button
            {
              MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Warning,
                      ("retry button pressed"));
              // try all again, including GSSAPI
              ResetAuthMethods();
            }
          }
        }
        MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
                ("SMTP: login failed: failed %X, current %X",
                 m_failedAuthMethods, m_currentAuthMethod));

        m_nextState = SMTP_AUTH_PROCESS_STATE;  // try auth (ProcessAuth())
                                                // again, with other method
      } else
        status = NS_ERROR_SMTP_PASSWORD_UNDEFINED;
      break;
  }

  return (status);
}

nsresult nsSmtpProtocol::AuthGSSAPIFirst() {
  NS_ASSERTION(m_currentAuthMethod == SMTP_AUTH_GSSAPI_ENABLED,
               "called in invalid state");
  nsAutoCString command("AUTH GSSAPI ");
  nsAutoCString resp;
  nsAutoCString service("smtp@");
  nsCString hostName;
  nsCString userName;
  nsresult rv;
  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
  if (NS_FAILED(rv)) return NS_ERROR_FAILURE;

  rv = smtpServer->GetUsername(userName);
  if (NS_FAILED(rv)) return NS_ERROR_FAILURE;

  rv = smtpServer->GetHostname(hostName);
  if (NS_FAILED(rv)) return NS_ERROR_FAILURE;
  service.Append(hostName);
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP: GSSAPI step 1 for user %s at server %s, service %s",
           userName.get(), hostName.get(), service.get()));

  rv = DoGSSAPIStep1(service.get(), userName.get(), resp);
  if (NS_FAILED(rv)) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
            ("SMTP: GSSAPI step 1 failed early"));
    MarkAuthMethodAsFailed(SMTP_AUTH_GSSAPI_ENABLED);
    m_nextState = SMTP_AUTH_PROCESS_STATE;
    return NS_OK;
  } else
    command.Append(resp);
  command.Append(CRLF);
  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_SEND_AUTH_GSSAPI_STEP;
  SetFlag(SMTP_PAUSE_FOR_READ);
  return SendData(command.get());
}

// GSSAPI may consist of multiple round trips

nsresult nsSmtpProtocol::AuthGSSAPIStep() {
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP: GSSAPI auth step 2"));
  NS_ASSERTION(m_currentAuthMethod == SMTP_AUTH_GSSAPI_ENABLED,
               "called in invalid state");
  nsresult rv;
  nsAutoCString cmd;

  // Check to see what the server said
  if (m_responseCode / 100 != 3) {
    m_nextState = SMTP_AUTH_LOGIN_RESPONSE;
    return NS_OK;
  }

  rv = DoGSSAPIStep2(m_responseText, cmd);
  if (NS_FAILED(rv)) cmd = "*";
  cmd += CRLF;

  m_nextStateAfterResponse = (rv == NS_SUCCESS_AUTH_FINISHED)
                                 ? SMTP_AUTH_LOGIN_RESPONSE
                                 : SMTP_SEND_AUTH_GSSAPI_STEP;
  m_nextState = SMTP_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);

  return SendData(cmd.get());
}

// LOGIN and MSN consist of three steps (MSN not through the mechanism
// but by non-RFC2821 compliant implementation in MS servers) not two as
// PLAIN or CRAM-MD5, so we've to start here and continue with AuthStep1
// if the server responds with with a 3xx code to "AUTH LOGIN" or "AUTH MSN"
nsresult nsSmtpProtocol::AuthLoginStep0() {
  NS_ASSERTION(m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED ||
                   m_currentAuthMethod == SMTP_AUTH_LOGIN_ENABLED,
               "called in invalid state");
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP: MSN or LOGIN auth, step 0"));
  nsAutoCString command(m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED
                            ? "AUTH MSN" CRLF
                            : "AUTH LOGIN" CRLF);
  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_AUTH_LOGIN_STEP0_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);

  return SendData(command.get());
}

void nsSmtpProtocol::AuthLoginStep0Response() {
  NS_ASSERTION(m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED ||
                   m_currentAuthMethod == SMTP_AUTH_LOGIN_ENABLED,
               "called in invalid state");
  // need the test to be here instead in AuthLoginResponse() to
  // continue with step 1 instead of 2 in case of a code 3xx
  m_nextState = (m_responseCode / 100 == 3) ? SMTP_SEND_AUTH_LOGIN_STEP1
                                            : SMTP_AUTH_LOGIN_RESPONSE;
}

nsresult nsSmtpProtocol::AuthLoginStep1() {
  // The longest message we are going to send is:
  // "AUTH PLAIN " followed by 684 bytes (base64 encoding of 512 bytes of
  // username/password) followed by CRLF: 11 + 684 + 2 + 1 = 698.
  char buffer[698];
  nsresult rv;
  nsresult status = NS_OK;
  nsCString username;
  char* base64Str = nullptr;
  nsAutoString password;
  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
  if (NS_FAILED(rv)) return NS_ERROR_FAILURE;

  rv = smtpServer->GetUsername(username);
  if (username.IsEmpty()) {
    rv = GetUsernamePassword(username, password);
    m_usernamePrompted = true;
    if (username.IsEmpty() || password.IsEmpty())
      return NS_ERROR_SMTP_PASSWORD_UNDEFINED;
  }

  nsCString hostname;
  smtpServer->GetHostname(hostname);

  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("SMTP AuthLoginStep1() for %s@%s", username.get(), hostname.get()));

  GetPassword(password);
  if (password.IsEmpty()) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error,
            ("SMTP: password undefined"));
    m_urlErrorState = NS_ERROR_SMTP_PASSWORD_UNDEFINED;
    return NS_ERROR_SMTP_PASSWORD_UNDEFINED;
  }
  NS_ConvertUTF16toUTF8 passwordUTF8(password);

  if (m_currentAuthMethod == SMTP_AUTH_CRAM_MD5_ENABLED) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Error, ("CRAM auth, step 1"));
    PR_snprintf(buffer, sizeof(buffer), "AUTH CRAM-MD5" CRLF);
  } else if (m_currentAuthMethod == SMTP_AUTH_NTLM_ENABLED ||
             m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("NTLM/MSN auth, step 1"));
    nsAutoCString response;
    rv = DoNtlmStep1(username, password, response);
    PR_snprintf(buffer, sizeof(buffer),
                TestFlag(SMTP_AUTH_NTLM_ENABLED) ? "AUTH NTLM %.512s" CRLF
                                                 : "%.512s" CRLF,
                response.get());
  } else if (m_currentAuthMethod == SMTP_AUTH_PLAIN_ENABLED) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("PLAIN auth"));
    // Up to 255 octets.
    if (username.Length() > 255)  // RFC 4616: authcid; up to 255 octets
      username.Truncate(255);
    if (passwordUTF8.Length() > 255)  // RFC 4616: passwd; up to 255 octets
      passwordUTF8.Truncate(255);

    // RFC 4616: UTF8NUL authcid UTF8NUL passwd
    char plain_string[513];
    memset(plain_string, 0, 513);
    PR_snprintf(&plain_string[1], 256, "%s", username.get());
    int len = username.Length() + 2;  // We include two <NUL> characters.
    PR_snprintf(&plain_string[len], 256, "%s", passwordUTF8.get());
    len += passwordUTF8.Length();

    base64Str = PL_Base64Encode(plain_string, len, nullptr);
    PR_snprintf(buffer, sizeof(buffer), "AUTH PLAIN %s" CRLF, base64Str);
  } else if (m_currentAuthMethod == SMTP_AUTH_LOGIN_ENABLED) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("LOGIN auth"));
    if (username.Length() > 255) username.Truncate(255);
    base64Str = PL_Base64Encode(username.get(), username.Length(), nullptr);
    // Base64 encoding of 255 bytes gives 340 bytes.
    PR_snprintf(buffer, sizeof(buffer), "%s" CRLF, base64Str);
  } else
    return (NS_ERROR_COMMUNICATIONS_ERROR);

  status = SendData(buffer, true);
  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_AUTH_LOGIN_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);
  free(base64Str);

  return (status);
}

nsresult nsSmtpProtocol::AuthLoginStep2() {
  /* use cached smtp password first
   * if not then use cached pop password
   * if pop password undefined
   * sync with smtp password
   */
  nsresult status = NS_OK;
  nsresult rv;
  nsAutoString password;

  GetPassword(password);
  if (password.IsEmpty()) {
    m_urlErrorState = NS_ERROR_SMTP_PASSWORD_UNDEFINED;
    return NS_ERROR_SMTP_PASSWORD_UNDEFINED;
  }
  nsAutoCString passwordUTF8 = NS_ConvertUTF16toUTF8(password);
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("SMTP AuthLoginStep2"));

  if (!passwordUTF8.IsEmpty()) {
    // We use 515 characters here so we can transmit a 512 byte response
    // followed by CRLF. User name and encoded digest, currently 255 + 1 + 2*16
    // bytes, will need 4 * (255 + 1 + 32) / 3 = 384 bytes when base64 encoded.
    char buffer[515];
    if (m_currentAuthMethod == SMTP_AUTH_CRAM_MD5_ENABLED) {
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("CRAM auth, step 2"));
      unsigned char digest[DIGEST_LENGTH];
      char* decodedChallenge = PL_Base64Decode(
          m_responseText.get(), m_responseText.Length(), nullptr);

      if (decodedChallenge)
        rv = MSGCramMD5(decodedChallenge, strlen(decodedChallenge),
                        passwordUTF8.get(), passwordUTF8.Length(), digest);
      else
        rv = NS_ERROR_FAILURE;

      PR_Free(decodedChallenge);
      if (NS_SUCCEEDED(rv)) {
        // The encoded digest is the hexadecimal representation of
        // DIGEST_LENGTH characters, so it will be twice that length.
        nsAutoCStringN<2 * DIGEST_LENGTH> encodedDigest;

        for (uint32_t j = 0; j < DIGEST_LENGTH; j++) {
          char hexVal[3];
          PR_snprintf(hexVal, 3, "%.2x", 0x0ff & (unsigned short)digest[j]);
          encodedDigest.Append(hexVal);
        }

        nsCOMPtr<nsISmtpServer> smtpServer;
        rv = m_runningURL->GetSmtpServer(getter_AddRefs(smtpServer));
        if (NS_FAILED(rv)) return NS_ERROR_FAILURE;

        nsCString userName;
        rv = smtpServer->GetUsername(userName);

        if (userName.Length() > 255) userName.Truncate(255);
        PR_snprintf(buffer, sizeof(buffer), "%s %s", userName.get(),
                    encodedDigest.get());
        char* base64Str = PL_Base64Encode(buffer, strlen(buffer), nullptr);
        PR_snprintf(buffer, sizeof(buffer), "%s" CRLF, base64Str);
        free(base64Str);
      }
      if (NS_FAILED(rv)) PR_snprintf(buffer, sizeof(buffer), "*" CRLF);
    } else if (m_currentAuthMethod == SMTP_AUTH_NTLM_ENABLED ||
               m_currentAuthMethod == SMTP_AUTH_MSN_ENABLED) {
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
              ("NTLM/MSN auth, step 2"));
      nsAutoCString response;
      rv = DoNtlmStep2(m_responseText, response);
      PR_snprintf(buffer, sizeof(buffer), "%.512s" CRLF, response.get());
    } else if (m_currentAuthMethod == SMTP_AUTH_PLAIN_ENABLED) {
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("PLAIN auth, step 2"));
      if (passwordUTF8.Length() > 255) passwordUTF8.Truncate(255);
      char* base64Str =
          PL_Base64Encode(passwordUTF8.get(), passwordUTF8.Length(), nullptr);
      // Base64 encoding of 255 bytes gives 340 bytes.
      PR_snprintf(buffer, sizeof(buffer), "%s" CRLF, base64Str);
      free(base64Str);
    } else if (m_currentAuthMethod == SMTP_AUTH_LOGIN_ENABLED) {
      MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug, ("LOGIN auth, step 2"));
      bool useLatin1 = mozilla::Preferences::GetBool(
          "mail.smtp_login_pop3_user_pass_auth_is_latin1", true);
      if (useLatin1)
        passwordUTF8 = NS_LossyConvertUTF16toASCII(
            password);  // Don't use UTF-8 after all.
      if (passwordUTF8.Length() > 255) passwordUTF8.Truncate(255);
      char* base64Str =
          PL_Base64Encode(passwordUTF8.get(), passwordUTF8.Length(), nullptr);
      // Base64 encoding of 255 bytes gives 340 bytes.
      PR_snprintf(buffer, sizeof(buffer), "%s" CRLF, base64Str);
      free(base64Str);
    } else
      return NS_ERROR_COMMUNICATIONS_ERROR;

    status = SendData(buffer, true);
    m_nextState = SMTP_RESPONSE;
    m_nextStateAfterResponse = SMTP_AUTH_LOGIN_RESPONSE;
    SetFlag(SMTP_PAUSE_FOR_READ);
    return (status);
  }

  // XXX -1 is not a valid nsresult
  return static_cast<nsresult>(-1);
}

nsresult nsSmtpProtocol::AuthOAuth2Step1() {
  MOZ_ASSERT(mOAuth2Support, "Can't do anything without OAuth2 support");

  nsresult rv = mOAuth2Support->Connect(true, this);
  NS_ENSURE_SUCCESS(rv, rv);

  m_nextState = SMTP_SUSPENDED;
  return NS_OK;
}

nsresult nsSmtpProtocol::OnSuccess(const nsACString& aOAuth2String) {
  MOZ_ASSERT(mOAuth2Support, "Can't do anything without OAuth2 support");

  // Send the AUTH XOAUTH2 command, and then siphon us back to the regular
  // authentication login stream.
  nsAutoCString buffer;
  buffer.AppendLiteral("AUTH XOAUTH2 ");
  buffer += aOAuth2String;
  buffer += CRLF;
  nsresult rv = SendData(buffer.get(), true);
  if (NS_FAILED(rv)) {
    m_nextState = SMTP_ERROR_DONE;
  } else {
    m_nextState = SMTP_RESPONSE;
    m_nextStateAfterResponse = SMTP_AUTH_LOGIN_RESPONSE;
  }

  SetFlag(SMTP_PAUSE_FOR_READ);

  ProcessProtocolState(nullptr, nullptr, 0, 0);
  return NS_OK;
}

nsresult nsSmtpProtocol::OnFailure(nsresult aError) {
  MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Debug,
          ("OAuth2 login error %08x", (uint32_t)aError));
  m_urlErrorState = aError;
  m_nextState = SMTP_ERROR_DONE;
  return ProcessProtocolState(nullptr, nullptr, 0, 0);
}

nsresult nsSmtpProtocol::SendMailResponse() {
  nsresult status = NS_OK;
  nsAutoCString buffer;
  nsresult rv;

  if (m_responseCode / 10 != 25) {
    nsresult errorcode;
    if ((m_responseCodeEnhanced == 570) || (m_responseCodeEnhanced == 571))
      errorcode = NS_ERROR_SMTP_SEND_NOT_ALLOWED;
    else if (TestFlag(SMTP_EHLO_SIZE_ENABLED))
      errorcode = (m_responseCode == 452)   ? NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED
                  : (m_responseCode == 552) ? NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2
                                            : NS_ERROR_SENDING_FROM_COMMAND;
    else
      errorcode = NS_ERROR_SENDING_FROM_COMMAND;

    rv = nsExplainErrorDetails(m_runningURL, errorcode, m_responseText.get(),
                               nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return (NS_ERROR_SENDING_FROM_COMMAND);
  }

  /* Send the RCPT TO: command */
  bool requestDSN = false;
  rv = m_runningURL->GetRequestDSN(&requestDSN);

  nsCOMPtr<nsIPrefService> prefs =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefs->GetBranch(nullptr, getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  bool requestOnSuccess = false;
  rv = prefBranch->GetBoolPref("mail.dsn.request_on_success_on",
                               &requestOnSuccess);

  bool requestOnFailure = false;
  rv = prefBranch->GetBoolPref("mail.dsn.request_on_failure_on",
                               &requestOnFailure);

  bool requestOnDelay = false;
  rv = prefBranch->GetBoolPref("mail.dsn.request_on_delay_on", &requestOnDelay);

  bool requestOnNever = false;
  rv = prefBranch->GetBoolPref("mail.dsn.request_never_on", &requestOnNever);
  nsCString& address = m_addresses[m_addressesLeft - 1];
  if (TestFlag(SMTP_EHLO_DSN_ENABLED) && requestDSN &&
      (requestOnSuccess || requestOnFailure || requestOnDelay ||
       requestOnNever)) {
    char* encodedAddress = esmtp_value_encode(address.get());
    nsAutoCString dsnBuffer;

    if (encodedAddress) {
      buffer = "RCPT TO:<";
      buffer += address;
      buffer += "> NOTIFY=";

      if (requestOnNever)
        dsnBuffer += "NEVER";
      else {
        if (requestOnSuccess) dsnBuffer += "SUCCESS";

        if (requestOnFailure)
          dsnBuffer += dsnBuffer.IsEmpty() ? "FAILURE" : ",FAILURE";

        if (requestOnDelay)
          dsnBuffer += dsnBuffer.IsEmpty() ? "DELAY" : ",DELAY";
      }

      buffer += dsnBuffer;
      buffer += " ORCPT=rfc822;";
      buffer += encodedAddress;
      buffer += CRLF;
      PR_FREEIF(encodedAddress);
    } else {
      m_urlErrorState = NS_ERROR_OUT_OF_MEMORY;
      return (NS_ERROR_OUT_OF_MEMORY);
    }
  } else {
    buffer = "RCPT TO:<";
    buffer += address;
    buffer += ">";
    buffer += CRLF;
  }
  status = SendData(buffer.get());

  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_SEND_RCPT_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);

  return (status);
}

nsresult nsSmtpProtocol::SendRecipientResponse() {
  nsresult status = NS_OK;
  nsAutoCString buffer;
  nsresult rv;

  if (m_responseCode / 10 != 25) {
    nsresult errorcode;
    if ((m_responseCodeEnhanced == 570) || (m_responseCodeEnhanced == 571))
      errorcode = NS_ERROR_SMTP_SEND_NOT_ALLOWED;
    else if (TestFlag(SMTP_EHLO_SIZE_ENABLED))
      errorcode = (m_responseCode == 452)   ? NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED
                  : (m_responseCode == 552) ? NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2
                                            : NS_ERROR_SENDING_RCPT_COMMAND;
    else
      errorcode = NS_ERROR_SENDING_RCPT_COMMAND;

    rv = nsExplainErrorDetails(m_runningURL, errorcode, m_responseText.get(),
                               m_addresses[m_addressesLeft - 1].get());

    if (!NS_SUCCEEDED(rv)) NS_ASSERTION(false, "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return (NS_ERROR_SENDING_RCPT_COMMAND);
  }

  if (--m_addressesLeft > 0) {
    // more senders to RCPT to
    // fake to 250 because SendMailResponse() can't handle 251
    m_responseCode = 250;
    m_nextState = SMTP_SEND_MAIL_RESPONSE;
    return NS_OK;
  }

  /* else send the DATA command */
  buffer = "DATA";
  buffer += CRLF;
  status = SendData(buffer.get());

  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_SEND_DATA_RESPONSE;
  SetFlag(SMTP_PAUSE_FOR_READ);

  m_DataCommandWasSent = true;
  return (status);
}

nsresult nsSmtpProtocol::SendData(const char* dataBuffer,
                                  bool aSuppressLogging) {
  // XXX -1 is not a valid nsresult
  if (!dataBuffer) return static_cast<nsresult>(-1);

  if (!aSuppressLogging) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
            ("SMTP Send: %s", dataBuffer));
  } else {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
            ("Logging suppressed for this command (it probably contained "
             "authentication information)"));
  }
  return nsMsgAsyncWriteProtocol::SendData(dataBuffer);
}

nsresult nsSmtpProtocol::SendDataResponse() {
  nsresult status = NS_OK;

  if (m_responseCode != 354) {
    mozilla::DebugOnly<nsresult> rv =
        nsExplainErrorDetails(m_runningURL, NS_ERROR_SENDING_DATA_COMMAND,
                              m_responseText.get(), nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return (NS_ERROR_SENDING_DATA_COMMAND);
  }

  m_nextState = SMTP_SEND_POST_DATA;
  ClearFlag(SMTP_PAUSE_FOR_READ); /* send data directly */

  UpdateStatus("smtpDeliveringMail");
  //  m_runningURL->GetBodySize(&m_totalMessageSize);
  return (status);
}

void nsSmtpProtocol::SendMessageInFile() {
  nsCOMPtr<nsIFile> file;
  nsCOMPtr<nsIURI> url = do_QueryInterface(m_runningURL);
  m_runningURL->GetPostMessageFile(getter_AddRefs(file));
  if (url && file)
    // need to fully qualify to avoid getting overwritten by a #define
    // in some windows header file
    nsMsgAsyncWriteProtocol::PostMessage(url, file);

  SetFlag(SMTP_PAUSE_FOR_READ);

  // for now, we are always done at this point..we aren't making multiple calls
  // to post data...

  UpdateStatus("smtpDeliveringMail");
  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = SMTP_SEND_MESSAGE_RESPONSE;
}

void nsSmtpProtocol::SendPostData() {
  // mscott: as a first pass, I'm writing everything at once and am not
  // doing it in chunks...

  /* returns 0 on done and negative on error
   * positive if it needs to continue.
   */

  // check to see if url is a file..if it is...call our file handler...
  bool postMessageInFile = true;
  m_runningURL->GetPostMessage(&postMessageInFile);
  if (postMessageInFile) {
    SendMessageInFile();
  }

  /* Update the thermo and the status bar.  This is done by hand, rather
     than using the FE_GraphProgress* functions, because there seems to be
     no way to make FE_GraphProgress shut up and not display anything more
     when all the data has arrived.  At the end, we want to show the
     "message sent; waiting for reply" status; FE_GraphProgress gets in
     the way of that.  See bug #23414. */
}

nsresult nsSmtpProtocol::SendMessageResponse() {
  if ((m_responseCode / 10 != 25)) {
    mozilla::DebugOnly<nsresult> rv = nsExplainErrorDetails(
        m_runningURL, NS_ERROR_SENDING_MESSAGE, m_responseText.get(), nullptr);
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to explain SMTP error");

    m_urlErrorState = NS_ERROR_BUT_DONT_SHOW_ALERT;
    return (NS_ERROR_SENDING_MESSAGE);
  }

  UpdateStatus("smtpMailSent");

  /* else */
  return SendQuit();
}

nsresult nsSmtpProtocol::SendQuit(SmtpState aNextStateAfterResponse) {
  m_sendDone = true;
  m_nextState = SMTP_RESPONSE;
  m_nextStateAfterResponse = aNextStateAfterResponse;

  return SendData("QUIT" CRLF);  // send a quit command to close the connection
                                 // with the server.
}

nsresult nsSmtpProtocol::LoadUrl(nsIURI* aURL, nsISupports* aConsumer) {
  if (!aURL) return NS_OK;

  m_consumer = aConsumer;
  return Initialize(aURL);
}

nsresult nsSmtpProtocol::LoadUrlInternal(nsIURI* aURL, nsISupports* aConsumer) {
  m_continuationResponse = -1; /* init */
  m_runningURL = do_QueryInterface(aURL);
  if (!m_runningURL) return NS_ERROR_FAILURE;

  // we had a bug where we failed to bring up an alert if the host
  // name was empty....so throw up an alert saying we don't have
  // a host name and inform the caller that we are not going to
  // run the url...
  nsAutoCString hostName;
  aURL->GetHost(hostName);
  if (hostName.IsEmpty()) {
    nsCOMPtr<nsIMsgMailNewsUrl> aMsgUrl = do_QueryInterface(aURL);
    if (aMsgUrl) {
      aMsgUrl->SetUrlState(true, NS_OK);
      // set the url as a url currently being run...
      aMsgUrl->SetUrlState(false /* we aren't running the url */,
                           NS_ERROR_SMTP_AUTH_FAILURE);
    }
    return NS_ERROR_BUT_DONT_SHOW_ALERT;
  }

  return nsMsgProtocol::LoadUrl(aURL, aConsumer);
}

/*
 * returns negative if the transfer is finished or error'd out
 *
 * returns zero or more if the transfer needs to be continued.
 */
nsresult nsSmtpProtocol::ProcessProtocolState(nsIURI* url,
                                              nsIInputStream* inputStream,
                                              uint64_t sourceOffset,
                                              uint32_t length) {
  nsresult status = NS_OK;
  ClearFlag(SMTP_PAUSE_FOR_READ); /* already paused; reset */

  while (!TestFlag(SMTP_PAUSE_FOR_READ)) {
    MOZ_LOG(SMTPLogModule, mozilla::LogLevel::Info,
            ("SMTP entering state: %d", m_nextState));
    switch (m_nextState) {
      case SMTP_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SmtpResponse(inputStream, length);
        break;

      case SMTP_START_CONNECT:
        SetFlag(SMTP_PAUSE_FOR_READ);
        m_nextState = SMTP_RESPONSE;
        m_nextStateAfterResponse = SMTP_EXTN_LOGIN_RESPONSE;
        break;
      case SMTP_FINISH_CONNECT:
        SetFlag(SMTP_PAUSE_FOR_READ);
        break;
      case SMTP_TLS_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendTLSResponse();
        break;
      case SMTP_EXTN_LOGIN_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = ExtensionLoginResponse(inputStream, length);
        break;

      case SMTP_SEND_HELO_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendHeloResponse(inputStream, length);
        break;
      case SMTP_SEND_EHLO_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendEhloResponse(inputStream, length);
        break;
      case SMTP_CLIENTID_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendClientIDResponse();
        break;
      case SMTP_AUTH_PROCESS_STATE:
        status = ProcessAuth();
        break;

      case SMTP_SEND_AUTH_GSSAPI_FIRST:
        status = AuthGSSAPIFirst();
        break;

      case SMTP_SEND_AUTH_GSSAPI_STEP:
        status = AuthGSSAPIStep();
        break;

      case SMTP_SEND_AUTH_LOGIN_STEP0:
        status = AuthLoginStep0();
        break;

      case SMTP_AUTH_LOGIN_STEP0_RESPONSE:
        AuthLoginStep0Response();
        status = NS_OK;
        break;

      case SMTP_AUTH_EXTERNAL_RESPONSE:
      case SMTP_AUTH_LOGIN_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = AuthLoginResponse(inputStream, length);
        break;

      case SMTP_SEND_AUTH_LOGIN_STEP1:
        status = AuthLoginStep1();
        break;

      case SMTP_SEND_AUTH_LOGIN_STEP2:
        status = AuthLoginStep2();
        break;

      case SMTP_AUTH_OAUTH2_STEP:
        status = AuthOAuth2Step1();
        break;

      case SMTP_SEND_MAIL_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendMailResponse();
        break;

      case SMTP_SEND_RCPT_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendRecipientResponse();
        break;

      case SMTP_SEND_DATA_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendDataResponse();
        break;

      case SMTP_SEND_POST_DATA:
        SendPostData();
        status = NS_OK;
        break;

      case SMTP_SEND_MESSAGE_RESPONSE:
        if (inputStream == nullptr)
          SetFlag(SMTP_PAUSE_FOR_READ);
        else
          status = SendMessageResponse();
        break;
      case SMTP_DONE: {
        nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl =
            do_QueryInterface(m_runningURL);
        mailNewsUrl->SetUrlState(false, NS_OK);
      }

        m_nextState = SMTP_FREE;
        break;

      case SMTP_ERROR_DONE: {
        nsCOMPtr<nsIMsgMailNewsUrl> mailNewsUrl =
            do_QueryInterface(m_runningURL);
        // propagate the right error code
        mailNewsUrl->SetUrlState(false, m_urlErrorState);
      }

        m_nextState = SMTP_FREE;
        break;

      case SMTP_FREE:
        // smtp is a one time use connection so kill it if we get here...
        nsMsgAsyncWriteProtocol::CloseSocket();
        return NS_OK; /* final end */

      // This state means we're going into an async loop and waiting for
      // something (say auth) to happen. ProcessProtocolState will be
      // retriggered when necessary.
      case SMTP_SUSPENDED:
        return NS_OK;

      default: /* should never happen !!! */
        m_nextState = SMTP_ERROR_DONE;
        break;
    }

    /* check for errors during load and call error
     * state if found
     */
    if (NS_FAILED(status) && m_nextState != SMTP_FREE) {
      // send a quit command to close the connection with the server.
      if (NS_FAILED(SendQuit(SMTP_ERROR_DONE))) {
        m_nextState = SMTP_ERROR_DONE;
        // Don't exit - loop around again and do the free case
        ClearFlag(SMTP_PAUSE_FOR_READ);
      }
    }
  } /* while(!SMTP_PAUSE_FOR_READ) */

  return NS_OK;
}

nsresult nsSmtpProtocol::GetPassword(nsString& aPassword) {
  nsresult rv;
  nsCOMPtr<nsISmtpUrl> smtpUrl = m_runningURL;

  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = smtpUrl->GetSmtpServer(getter_AddRefs(smtpServer));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = smtpServer->GetPassword(aPassword);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!aPassword.IsEmpty()) return rv;
  // empty password

  nsCOMPtr<nsIPrefService> prefs =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefs->GetBranch(nullptr, getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString username;
  rv = smtpServer->GetUsername(username);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString hostname;
  rv = smtpServer->GetHostname(hostname);
  NS_ENSURE_SUCCESS(rv, rv);

  AutoTArray<nsString, 2> formatStrings;
  CopyASCIItoUTF16(hostname, *formatStrings.AppendElement());
  CopyASCIItoUTF16(username, *formatStrings.AppendElement());

  rv = PromptForPassword(smtpServer, smtpUrl, formatStrings, aPassword);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

/**
 * formatStrings is an array for the prompts, item 0 is the hostname, item 1
 * is the username.
 */
nsresult nsSmtpProtocol::PromptForPassword(nsISmtpServer* aSmtpServer,
                                           nsISmtpUrl* aSmtpUrl,
                                           nsTArray<nsString>& formatStrings,
                                           nsAString& aPassword) {
  nsCOMPtr<nsIStringBundleService> stringService =
      mozilla::services::GetStringBundleService();
  NS_ENSURE_TRUE(stringService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> composeStringBundle;
  nsresult rv = stringService->CreateBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties",
      getter_AddRefs(composeStringBundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString passwordPromptString;
  if (formatStrings.Length() > 1)
    rv = composeStringBundle->FormatStringFromName(
        "smtpEnterPasswordPromptWithUsername", formatStrings,
        passwordPromptString);
  else
    rv = composeStringBundle->FormatStringFromName(
        "smtpEnterPasswordPrompt", formatStrings, passwordPromptString);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAuthPrompt> netPrompt;
  rv = aSmtpUrl->GetAuthPrompt(getter_AddRefs(netPrompt));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString passwordTitle;
  rv = composeStringBundle->FormatStringFromName(
      "smtpEnterPasswordPromptTitleWithHostname", formatStrings, passwordTitle);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = aSmtpServer->GetPasswordWithUI(
      passwordPromptString.get(), passwordTitle.get(), netPrompt, aPassword);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

nsresult nsSmtpProtocol::GetUsernamePassword(nsACString& aUsername,
                                             nsAString& aPassword) {
  nsresult rv;
  nsCOMPtr<nsISmtpUrl> smtpUrl = m_runningURL;

  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = smtpUrl->GetSmtpServer(getter_AddRefs(smtpServer));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = smtpServer->GetPassword(aPassword);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!aPassword.IsEmpty()) {
    rv = smtpServer->GetUsername(aUsername);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!aUsername.IsEmpty()) return rv;
  }
  // empty password

  aPassword.Truncate();

  nsCString hostname;
  rv = smtpServer->GetHostname(hostname);
  NS_ENSURE_SUCCESS(rv, rv);

  AutoTArray<nsString, 1> formatStrings;
  CopyASCIItoUTF16(hostname, *formatStrings.AppendElement());

  rv = PromptForPassword(smtpServer, smtpUrl, formatStrings, aPassword);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}
