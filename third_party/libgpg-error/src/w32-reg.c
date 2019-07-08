/* w32-reg.c - Windows registry support
 * Copyright (C) 2002, 2005, 2010, 2012, 2017 g10 Code GmbH
 *
 * This file is part of Libgpg-error.
 *
 * Libgpg-error is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public License
 * as published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * Libgpg-error is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this program; if not, see <https://www.gnu.org/licenses/>.
 * SPDX-License-Identifier: LGPL-2.1+
 */

#if HAVE_CONFIG_H
#include <config.h>
#endif

#ifndef HAVE_W32_SYSTEM
# error This module may only be build for Windows.
#endif

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <gpg-error.h>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "gpgrt-int.h"


/* Return a string from the W32 Registry or NULL in case of error.
 * Caller must release the return value.  A NULL for root is an alias
 * for HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE in turn.  The returned
 * string is UTF-8 encoded; ROOT, DIR, and NAME must be plain
 * ASCII. */
char *
_gpgrt_w32_reg_query_string (const char *root, const char *dir,
                             const char *name)
{
  HKEY root_key, key_handle;
  DWORD n1, nbytes, type;
  char *result = NULL;

  if (!root)
    root_key = HKEY_CURRENT_USER;
  else if (!strcmp( root, "HKEY_CLASSES_ROOT"))
    root_key = HKEY_CLASSES_ROOT;
  else if (!strcmp( root, "HKEY_CURRENT_USER"))
    root_key = HKEY_CURRENT_USER;
  else if (!strcmp( root, "HKEY_LOCAL_MACHINE"))
    root_key = HKEY_LOCAL_MACHINE;
  else if (!strcmp( root, "HKEY_USERS"))
    root_key = HKEY_USERS;
  else if (!strcmp( root, "HKEY_PERFORMANCE_DATA"))
    root_key = HKEY_PERFORMANCE_DATA;
  else if (!strcmp( root, "HKEY_CURRENT_CONFIG"))
    root_key = HKEY_CURRENT_CONFIG;
  else
    return NULL;

  if (RegOpenKeyExA (root_key, dir, 0, KEY_READ, &key_handle))
    {
      if (root)
        return NULL; /* No need for a RegClose, so return direct.  */
      /* It seems to be common practise to fall back to HKLM. */
      if (RegOpenKeyExA (HKEY_LOCAL_MACHINE, dir, 0, KEY_READ, &key_handle))
        return NULL; /* still no need for a RegClose, so return direct */
    }


  /* FIXME:  Use wide functions and convert to utf-8.  */
  nbytes = 1;
  if (RegQueryValueExA (key_handle, name, 0, NULL, NULL, &nbytes))
    {
      if (root)
        goto leave;
      /* Try to fallback to HKLM also for a missing value.  */
      RegCloseKey (key_handle);
      if (RegOpenKeyExA (HKEY_LOCAL_MACHINE, dir, 0, KEY_READ, &key_handle))
        return NULL; /* Nope.  */
      if (RegQueryValueExA (key_handle, name, 0, NULL, NULL, &nbytes))
        goto leave;
    }
  n1 = nbytes + 1;
  result = xtrymalloc (n1);
  if (!result)
    goto leave;
  if (RegQueryValueExA (key_handle, name, 0, &type, (LPBYTE) result, &n1))
    {
      xfree (result);
      result = NULL;
      goto leave;
    }
  result[nbytes] = 0; /* Make sure it is really a string.  */

#ifndef HAVE_W32CE_SYSTEM /* (Windows CE has no environment.)  */
  if (type == REG_EXPAND_SZ && strchr (result, '%'))
    {
      char *tmp;

      n1 += 1000;
      tmp = xtrymalloc (n1 + 1);
      if (!tmp)
        goto leave;
      nbytes = ExpandEnvironmentStrings (result, tmp, n1);
      if (nbytes && nbytes > n1)
        {
          xfree (tmp);
          n1 = nbytes;
          tmp = xtrymalloc (n1 + 1);
          if (!tmp)
            goto leave;
          nbytes = ExpandEnvironmentStrings (result, tmp, n1);
          if (nbytes && nbytes > n1) {
            xfree (tmp); /* Oops - truncated, better don't expand at all. */
            goto leave;
          }
          tmp[nbytes] = 0;
          xfree (result);
          result = tmp;
        }
      else if (nbytes)  /* Okay, reduce the length. */
        {
          tmp[nbytes] = 0;
          xfree (result);
          result = xtrymalloc (strlen (tmp)+1);
          if (!result)
            result = tmp;
          else
            {
              strcpy (result, tmp);
              xfree (tmp);
            }
        }
      else  /* Error - don't expand. */
        {
          xfree (tmp);
        }
    }
#endif

 leave:
  RegCloseKey (key_handle);
  return result;
}
