/* t-argparse.c - Check the argparse API
 * Copyright (C) 2018 g10 Code GmbH
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
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, see <https://www.gnu.org/licenses/>.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#ifdef HAVE_CONFIG_H
#include <config.h>
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "../src/gpg-error.h"


static struct {
    int verbose;
    int debug;
    char *outfile;
    char *crf;
    int myopt;
    int echo;
    int a_long_one;
} opt;



static const char *
my_strusage (int level)
{
  const char *p;

  switch (level)
    {
    case 9: p = "GPL-2.0-or-later"; break;

    case 11: p = "t-argparse"; break;

    default: p = NULL;
    }
  return p;
}



int
main (int argc, char **argv)
{
  gpgrt_opt_t opts[] = {
    ARGPARSE_x  ('v', "verbose", NONE, 0, "Laut sein"),
    ARGPARSE_s_n('e', "echo"   , ("Zeile ausgeben, damit wir sehen, "
                                  "was wir eingegeben haben")),
    ARGPARSE_s_n('d', "debug", "Debug\nfalls mal etwas\nschief geht"),
    ARGPARSE_s_s('o', "output", 0 ),
    ARGPARSE_o_s('c', "cross-ref", "cross-reference erzeugen\n" ),
    /* Note that on a non-utf8 terminal the ß might garble the output. */
    ARGPARSE_s_n('s', "street","|Straße|set the name of the street to Straße"),
    ARGPARSE_o_i('m', "my-option", 0),
    ARGPARSE_s_n(500, "a-long-option", 0 ),
    ARGPARSE_end()
  };
  gpgrt_argparse_t pargs = { &argc, &argv, (ARGPARSE_FLAG_ALL
                                            | ARGPARSE_FLAG_MIXED
                                            | ARGPARSE_FLAG_ONEDASH) };
  int i;

  gpgrt_set_strusage (my_strusage);


  while (gpgrt_argparse  (NULL, &pargs, opts))
    {
      switch (pargs.r_opt)
        {
        case ARGPARSE_IS_ARG :
          printf ("arg='%s'\n", pargs.r.ret_str);
          break;
        case 'v': opt.verbose++; break;
        case 'e': opt.echo++; break;
        case 'd': opt.debug++; break;
        case 'o': opt.outfile = pargs.r.ret_str; break;
        case 'c': opt.crf = pargs.r_type? pargs.r.ret_str:"a.crf"; break;
        case 'm': opt.myopt = pargs.r_type? pargs.r.ret_int : 1; break;
        case 500: opt.a_long_one++;  break;
        default : pargs.err = ARGPARSE_PRINT_ERROR; break;
	}
    }
  for (i=0; i < argc; i++ )
    printf ("%3d -> (%s)\n", i, argv[i] );
  if (opt.verbose)
    puts ("Options:");
  if (opt.verbose)
    printf ("  verbose=%d\n", opt.verbose );
  if (opt.debug)
    printf ("  debug=%d\n", opt.debug );
  if (opt.outfile)
    printf ("  outfile='%s'\n", opt.outfile );
  if (opt.crf)
    printf ("  crffile='%s'\n", opt.crf );
  if (opt.myopt)
    printf ("  myopt=%d\n", opt.myopt );
  if (opt.a_long_one)
    printf ("  a-long-one=%d\n", opt.a_long_one );
  if (opt.echo)
    printf ("  echo=%d\n", opt.echo );

  gpgrt_argparse (NULL, &pargs, NULL);

  return 0;
}
