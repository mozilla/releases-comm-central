/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MimeHeaderParser_h__
#define MimeHeaderParser_h__

#include "nsStringGlue.h"

namespace mozilla {
namespace mailnews {

/**
 * Given a name and an email, both encoded in UTF-8, produce a string suitable
 * for writing in an email header by quoting where necessary.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email. Note that this DOES NOT do any RFC 2047
 * encoding.
 */
void MakeMimeAddress(const nsACString &aName, const nsACString &aEmail,
                     nsACString &full);

/**
 * Given a name and an email, produce a string suitable for writing in an email
 * header by quoting where necessary.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email. Note that this DOES NOT do any RFC 2047
 * encoding.
 */
void MakeMimeAddress(const nsAString &aName, const nsAString &aEmail,
                     nsAString &full);

/**
 * Given a name and an email, both encoded in UTF-8, produce a string suitable
 * for displaying in UI.
 *
 * If name is not empty, the output string will be name <email>. If it is empty,
 * the output string is just the email.
 */
void MakeDisplayAddress(const nsAString &aName, const nsAString &aEmail,
                        nsAString &full);

} // namespace mailnews
} // namespace mozilla

#endif
