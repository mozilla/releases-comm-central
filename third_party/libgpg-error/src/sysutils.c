/* sysutils.c - Platform specific helper functions
 * Copyright (C) 2017 g10 Code GmbH
 *
 * This file is part of libgpg-error.
 *
 * libgpg-error is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public License
 * as published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * libgpg-error is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this program; if not, see <https://www.gnu.org/licenses/>.
 * SPDX-License-Identifier: LGPL-2.1+
 */

#include <config.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#ifdef HAVE_W32_SYSTEM
# include <windows.h>
#endif
#ifdef HAVE_STAT
# include <sys/stat.h>
#endif
#include <sys/types.h>
#include <fcntl.h>
#ifdef HAVE_PWD_H
# include <pwd.h>
#endif

#include "gpgrt-int.h"


#ifdef HAVE_W32_SYSTEM
/* Return true if STRING has any 8 bit character.  */
static int
any8bitchar (const char *string)
{
  if (string)
    for ( ; *string; string++)
      if ((*string & 0x80))
        return 1;
  return 0;
}
#endif /*HAVE_W32_SYSTEM*/


/* Return true if FD is valid.  */
int
_gpgrt_fd_valid_p (int fd)
{
  int d = dup (fd);
  if (d < 0)
    return 0;
  close (d);
  return 1;
}


/* Our variant of getenv.  The returned string must be freed.  If the
 * environment variable does not exists NULL is returned and ERRNO set
 * to 0.  */
char *
_gpgrt_getenv (const char *name)
{
  if (!name || !*name || strchr (name, '='))
    {
      _gpg_err_set_errno (EINVAL);
      return NULL;
    }

#ifdef HAVE_W32_SYSTEM
  {
    int len, size;
    char *result;

    len = GetEnvironmentVariable (name, NULL, 0);
    if (!len && GetLastError () == ERROR_ENVVAR_NOT_FOUND)
      {
        _gpg_err_set_errno (0);
        return NULL;
      }
  again:
    size = len;
    result = _gpgrt_malloc (size);
    if (!result)
      return NULL;
    len = GetEnvironmentVariable (name, result, size);
    if (len >= size)
      {
        /* Changed in the meantime - retry.  */
        _gpgrt_free (result);
        goto again;
      }
    if (!len && GetLastError () == ERROR_ENVVAR_NOT_FOUND)
      {
        /* Deleted in the meantime.  */
        _gpgrt_free (result);
        _gpg_err_set_errno (0);
        return NULL;
      }
    if (!len)
      {
        /* Other error.  FIXME: We need mapping fucntion. */
        _gpgrt_free (result);
        _gpg_err_set_errno (EIO);
        return NULL;
      }

    return result;
  }
#else /*!HAVE_W32_SYSTEM*/
  {
    const char *s = getenv (name);
    if (!s)
      {
        _gpg_err_set_errno (0);
        return NULL;
      }
    return _gpgrt_strdup (s);
  }
#endif /*!HAVE_W32_SYSTEM*/
}


/* Wrapper around setenv so that we can have the same function in
 * Windows and Unix.  In contrast to the standard setenv passing a
 * VALUE as NULL and setting OVERWRITE will remove the envvar.  */
gpg_err_code_t
_gpgrt_setenv (const char *name, const char *value, int overwrite)
{
  if (!name || !*name || strchr (name, '='))
    return GPG_ERR_EINVAL;

#ifdef HAVE_W32_SYSTEM
  /* Windows maintains (at least) two sets of environment variables.
   * One set can be accessed by GetEnvironmentVariable and
   * SetEnvironmentVariable.  This set is inherited by the children.
   * The other set is maintained in the C runtime, and is accessed
   * using getenv and putenv.  We try to keep them in sync by
   * modifying both sets.  Note that gpgrt_getenv ignores the libc
   * values - however, too much existing code still uses getenv.  */
  {
    int exists;
    char tmpbuf[10];
    char *buf;

    if (!value && overwrite)
      {
        if (!SetEnvironmentVariable (name, NULL))
          return GPG_ERR_EINVAL;
        if (getenv (name))
          {
            /* Ugly: Leaking memory.  */
            buf = _gpgrt_strdup (name);
            if (!buf)
              return _gpg_err_code_from_syserror ();
            if (putenv (buf))
              return _gpg_err_code_from_syserror ();
          }
        return 0;
      }

    exists = GetEnvironmentVariable (name, tmpbuf, sizeof tmpbuf);
    if ((! exists || overwrite) && !SetEnvironmentVariable (name, value))
      return GPG_ERR_EINVAL; /* (Might also be ENOMEM.) */
    if (overwrite || !getenv (name))
      {
        /* Ugly: Leaking memory.  */
        buf = _gpgrt_strconcat (name, "=", value, NULL);
        if (!buf)
          return _gpg_err_code_from_syserror ();
        if (putenv (buf))
          return _gpg_err_code_from_syserror ();
      }
    return 0;
  }

#else /*!HAVE_W32_SYSTEM*/

# ifdef HAVE_SETENV

  {
    if (!value && overwrite)
      {
        if (unsetenv (name))
          return _gpg_err_code_from_syserror ();
      }
    else
      {
        if (setenv (name, value ? value : "", overwrite))
          return _gpg_err_code_from_syserror ();
      }

    return 0;
  }

# else /*!HAVE_SETENV*/

# if __GNUC__
#   warning no setenv - using putenv but leaking memory.
# endif
  {
    char *buf;

    if (!value && overwrite)
      {
        if (getenv (name))
          {
            buf = _gpgrt_strdup (name);
            if (!buf)
              return _gpg_err_code_from_syserror ();
            if (putenv (buf))
              return -1;
          }
      }
    else if (overwrite || !getenv (name))
      {
        buf = _gpgrt_strconcat (name, "=", value, NULL);
        if (!buf)
          return _gpg_err_code_from_syserror ();
        if (putenv (buf))
          return _gpg_err_code_from_syserror ();
      }

    return 0;
  }
# endif /*!HAVE_SETENV*/
#endif /*!HAVE_W32_SYSTEM*/
}


#ifndef HAVE_W32_SYSTEM
static mode_t
modestr_to_mode (const char *modestr)
{
  mode_t mode = 0;

  if (modestr && *modestr)
    {
      modestr++;
      if (*modestr && *modestr++ == 'r')
        mode |= S_IRUSR;
      if (*modestr && *modestr++ == 'w')
        mode |= S_IWUSR;
      if (*modestr && *modestr++ == 'x')
        mode |= S_IXUSR;
      if (*modestr && *modestr++ == 'r')
        mode |= S_IRGRP;
      if (*modestr && *modestr++ == 'w')
        mode |= S_IWGRP;
      if (*modestr && *modestr++ == 'x')
        mode |= S_IXGRP;
      if (*modestr && *modestr++ == 'r')
        mode |= S_IROTH;
      if (*modestr && *modestr++ == 'w')
        mode |= S_IWOTH;
      if (*modestr && *modestr++ == 'x')
        mode |= S_IXOTH;
    }

  return mode;
}
#endif


/* A wrapper around mkdir which takes a string for the mode argument.
 * This makes it easier to handle the mode argument which is not
 * defined on all systems.  The format of the modestring is
 *
 *    "-rwxrwxrwx"
 *
 * '-' is a don't care or not set.  'r', 'w', 'x' are read allowed,
 * write allowed, execution allowed with the first group for the user,
 * the second for the group and the third for all others.  If the
 * string is shorter than above the missing mode characters are meant
 * to be not set.
 *
 * Note that in addition to returning an gpg-error error code ERRNO is
 * also set by this function.
 */
gpg_err_code_t
_gpgrt_mkdir (const char *name, const char *modestr)
{
#ifdef HAVE_W32_SYSTEM
  wchar_t *wname;
  gpg_err_code_t ec;
  (void)modestr;

  /* Note: Fixme: We should set appropriate permissions.  */
  wname = _gpgrt_utf8_to_wchar (name);
  if (!wname)
    return _gpg_err_code_from_syserror ();
  if (!CreateDirectoryW (wname, NULL))
    {
      _gpgrt_w32_set_errno (-1);
      ec = _gpg_err_code_from_syserror ();
    }
  else
    ec = 0;
  _gpgrt_free_wchar (wname);
  return ec;
#elif MKDIR_TAKES_ONE_ARG
  (void)modestr;
  if (mkdir (name))
    return _gpg_err_code_from_syserror ();
  return 0;
#else
  if (mkdir (name, modestr_to_mode (modestr)))
    return _gpg_err_code_from_syserror ();
  return 0;
#endif
}


/* A simple wrapper around chdir.  NAME is expected to be utf8
 * encoded.
 * Note that in addition to returning an gpg-error error code ERRNO is
 * also set by this function.  */
gpg_err_code_t
_gpgrt_chdir (const char *name)
{
#ifdef HAVE_W32_SYSTEM
  wchar_t *wname;
  gpg_err_code_t ec;

  wname = _gpgrt_utf8_to_wchar (name);
  if (!wname)
    return _gpg_err_code_from_syserror ();
  if (!SetCurrentDirectoryW (wname))
    {
      _gpgrt_w32_set_errno (-1);
      ec = _gpg_err_code_from_syserror ();
    }
  else
    ec = 0;
  _gpgrt_free_wchar (wname);
  return ec;

#else /*!HAVE_W32_SYSTEM*/
  if (chdir (name))
    return _gpg_err_code_from_syserror ();
  return 0;
#endif /*!HAVE_W32_SYSTEM*/
}


/* Return the current working directory as a malloced string.  Return
 * NULL and sets ERRNO on error.  */
char *
_gpgrt_getcwd (void)
{
#ifdef HAVE_W32CE_SYSTEM

  return xtrystrdup ("/");

#elif defined(HAVE_W32_SYSTEM)
  wchar_t wbuffer[MAX_PATH + sizeof(wchar_t)];
  DWORD wlen;
  char *buf, *p;

  wlen = GetCurrentDirectoryW (MAX_PATH, wbuffer);
  if (!wlen)
    {
      _gpgrt_w32_set_errno (-1);
      return NULL;

    }
  else if (wlen > MAX_PATH)
    {
      _gpg_err_set_errno (ENAMETOOLONG);
      return NULL;
    }
  buf = _gpgrt_wchar_to_utf8 (wbuffer, wlen);
  if (buf)
    {
      for (p=buf; *p; p++)
        if (*p == '\\')
          *p = '/';
    }
  return buf;

#else /*Unix*/
  char *buffer;
  size_t size = 100;

  for (;;)
    {
      buffer = xtrymalloc (size+1);
      if (!buffer)
        return NULL;
      if (getcwd (buffer, size) == buffer)
        return buffer;
      xfree (buffer);
      if (errno != ERANGE)
        return NULL;
      size *= 2;
    }
#endif /*Unix*/
}


/* Wrapper around access to handle file name encoding under Windows.
 * Returns 0 if FNAME can be accessed in MODE or an error code.  ERRNO
 * is also set on error. */
gpg_err_code_t
_gpgrt_access (const char *fname, int mode)
{
  gpg_err_code_t ec;

#ifdef HAVE_W32_SYSTEM
  if (any8bitchar (fname))
    {
      wchar_t *wfname;

      wfname = _gpgrt_utf8_to_wchar (fname);
      if (!wfname)
        ec = _gpg_err_code_from_syserror ();
      else
        {
          ec = _waccess (wfname, mode)? _gpg_err_code_from_syserror () : 0;
          _gpgrt_free_wchar (wfname);
        }
    }
  else
#endif /*HAVE_W32_SYSTEM*/
    ec = access (fname, mode)? _gpg_err_code_from_syserror () : 0;

  return ec;
}



/* Get the standard home directory for user NAME. If NAME is NULL the
 * directory for the current user is returned.  Caller must release
 * the returned string.  */
char *
_gpgrt_getpwdir (const char *name)
{
  char *result = NULL;
#ifdef HAVE_PWD_H
  struct passwd *pwd = NULL;

  if (name)
    {
#ifdef HAVE_GETPWNAM
      /* Fixme: We should use getpwnam_r if available.  */
      pwd = getpwnam (name);
#endif
    }
  else
    {
#ifdef HAVE_GETPWUID
      /* Fixme: We should use getpwuid_r if available.  */
      pwd = getpwuid (getuid());
#endif
    }
  if (pwd)
    {
      result = _gpgrt_strdup (pwd->pw_dir);
    }
#else /*!HAVE_PWD_H*/
  /* No support at all.  */
  (void)name;
#endif /*HAVE_PWD_H*/
  return result;
}


/* Return a malloced copy of the current user's account name; this may
 * return NULL on memory failure.  */
char *
_gpgrt_getusername (void)
{
  char *result = NULL;

#ifdef HAVE_W32_SYSTEM
  wchar_t wtmp[1];
  wchar_t *wbuf;
  DWORD wsize = 1;
  char *buf;

  GetUserNameW (wtmp, &wsize);
  wbuf = _gpgrt_malloc (wsize * sizeof *wbuf);
  if (!wbuf)
    {
      _gpgrt_w32_set_errno (-1);
      return NULL;
    }
  if (!GetUserNameW (wbuf, &wsize))
    {
      _gpgrt_w32_set_errno (-1);
      xfree (wbuf);
      return NULL;
    }
  buf = _gpgrt_wchar_to_utf8 (wbuf, wsize);
  xfree (wbuf);
  return buf;

#else /* !HAVE_W32_SYSTEM */

# if defined(HAVE_PWD_H) && defined(HAVE_GETPWUID)
  struct passwd *pwd;

  pwd = getpwuid (getuid());
  if (pwd)
    {
      result = _gpgrt_strdup (pwd->pw_name);
    }

# endif /*HAVE_PWD_H*/

#endif /* !HAVE_W32_SYSTEM */

  return result;
}
