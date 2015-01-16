/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"    // precompiled header...
#include "nsNNTPNewsgroupPost.h"

NS_IMPL_ISUPPORTS(nsNNTPNewsgroupPost, nsINNTPNewsgroupPost)

nsNNTPNewsgroupPost::nsNNTPNewsgroupPost()
{
  m_isControl=false;
}

nsNNTPNewsgroupPost::~nsNNTPNewsgroupPost()
{
}

#define IMPL_GETSET(attribute, member) \
  NS_IMETHODIMP nsNNTPNewsgroupPost::Get##attribute(char **result) \
  { \
    NS_ENSURE_ARG_POINTER(result); \
    *result = ToNewCString(member); \
    return NS_OK; \
  } \
  NS_IMETHODIMP nsNNTPNewsgroupPost::Set##attribute(const char *aValue) \
  { \
    member.Assign(aValue); \
    return NS_OK; \
  }

IMPL_GETSET(RelayVersion, m_header[IDX_HEADER_RELAYVERSION])
IMPL_GETSET(PostingVersion, m_header[IDX_HEADER_POSTINGVERSION])
IMPL_GETSET(From, m_header[IDX_HEADER_FROM])
IMPL_GETSET(Date, m_header[IDX_HEADER_DATE])
IMPL_GETSET(Subject, m_header[IDX_HEADER_SUBJECT])
IMPL_GETSET(Path, m_header[IDX_HEADER_PATH])
IMPL_GETSET(ReplyTo, m_header[IDX_HEADER_REPLYTO])
IMPL_GETSET(Sender, m_header[IDX_HEADER_SENDER])
IMPL_GETSET(FollowupTo, m_header[IDX_HEADER_FOLLOWUPTO])
IMPL_GETSET(DateReceived, m_header[IDX_HEADER_DATERECEIVED])
IMPL_GETSET(Expires, m_header[IDX_HEADER_EXPIRES])
IMPL_GETSET(Control, m_header[IDX_HEADER_CONTROL])
IMPL_GETSET(Distribution, m_header[IDX_HEADER_DISTRIBUTION])
IMPL_GETSET(Organization, m_header[IDX_HEADER_ORGANIZATION])
IMPL_GETSET(Body, m_body)

NS_IMETHODIMP nsNNTPNewsgroupPost::GetNewsgroups(char **result)
{
  NS_ENSURE_ARG_POINTER(result);
  *result = ToNewCString(m_header[IDX_HEADER_NEWSGROUPS]);
  return NS_OK;
}

NS_IMETHODIMP nsNNTPNewsgroupPost::GetReferences(char **result)
{
  NS_ENSURE_ARG_POINTER(result);
  *result = ToNewCString(m_header[IDX_HEADER_REFERENCES]);
  return NS_OK;
}

NS_IMETHODIMP nsNNTPNewsgroupPost::GetIsControl(bool *result)
{
  NS_ENSURE_ARG_POINTER(result);
  *result = m_isControl;
  return NS_OK;
}

nsresult
nsNNTPNewsgroupPost::AddNewsgroup(const char *newsgroup)
{
    m_header[IDX_HEADER_NEWSGROUPS].AppendLiteral(", ");
    m_header[IDX_HEADER_NEWSGROUPS].Append(newsgroup);
    return NS_OK;
}


// the message can be stored in a file....allow accessors for getting and setting
// the file name to post...
nsresult
nsNNTPNewsgroupPost::SetPostMessageFile(nsIFile * aPostMessageFile)
{
  m_postMessageFile = aPostMessageFile;
  return NS_OK;
}

nsresult 
nsNNTPNewsgroupPost::GetPostMessageFile(nsIFile ** aPostMessageFile)
{
  if (aPostMessageFile)
    NS_IF_ADDREF(*aPostMessageFile = m_postMessageFile);
  return NS_OK;
}
