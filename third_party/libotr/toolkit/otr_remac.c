/*
 *  Off-the-Record Messaging Toolkit
 *  Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,
 *                           Nikita Borisov
 *                           <otr@cypherpunks.ca>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of version 2 of the GNU General Public License as
 *  published by the Free Software Foundation.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */

/* system headers */
#include <stdio.h>
#include <stdlib.h>

/* libgcrypt headers */
#include <gcrypt.h>

/* toolkit headers */
#include "parse.h"
#include "sha1hmac.h"

static void usage(const char *progname)
{
    fprintf(stderr, "Usage: %s mackey sender_instance receiver_instance "
	"flags snd_keyid rcp_keyid pubkey counter encdata revealed_mackeys\n"
"Make a new Data message, with the given pieces (note that the\n"
"data part is already encrypted).  MAC it with the given mackey.\n"
"mackey, pubkey, counter, encdata, and revealed_mackeys are given\n"
"as strings of hex chars.  snd_keyid and rcp_keyid are decimal integers.\n",
	progname);
    exit(1);
}

int main(int argc, char **argv)
{
    unsigned char *mackey;
    size_t mackeylen;
    unsigned int snd_keyid, rcp_keyid;
    int flags;
    unsigned char version = 3;
    unsigned int sender_instance;
    unsigned int receiver_instance;
    unsigned char *pubkey;
    size_t pubkeylen;
    gcry_mpi_t pubv;
    unsigned char *ctr;
    size_t ctrlen;
    unsigned char *encdata;
    size_t encdatalen;
    unsigned char *mackeys;
    size_t mackeyslen;
    char *newdatamsg;

    if (argc != 11) {
	usage(argv[0]);
    }

    argv_to_buf(&mackey, &mackeylen, argv[1]);
    if (!mackey) {
	usage(argv[0]);
    }

    if (mackeylen != 20) {
	fprintf(stderr, "The MAC key must be 40 hex chars long.\n");
	usage(argv[0]);
    }

    if (sscanf(argv[2], "%u", &sender_instance) != 1) {
	fprintf(stderr, "Unparseable sender_instance given.\n");
	usage(argv[0]);
    }

    if (sscanf(argv[3], "%u", &receiver_instance) != 1) {
	fprintf(stderr, "Unparseable receiver_instance given.\n");
	usage(argv[0]);
    }

    if (sscanf(argv[4], "%d", &flags) != 1) {
	fprintf(stderr, "Unparseable flags given.\n");
	usage(argv[0]);
    }

    if (sscanf(argv[5], "%u", &snd_keyid) != 1) {
	fprintf(stderr, "Unparseable snd_keyid given.\n");
	usage(argv[0]);
    }

    if (sscanf(argv[6], "%u", &rcp_keyid) != 1) {
	fprintf(stderr, "Unparseable rcp_keyid given.\n");
	usage(argv[0]);
    }

    argv_to_buf(&pubkey, &pubkeylen, argv[7]);
    if (!pubkey) {
	usage(argv[0]);
    }
    gcry_mpi_scan(&pubv, GCRYMPI_FMT_USG, pubkey, pubkeylen, NULL);
    free(pubkey);

    argv_to_buf(&ctr, &ctrlen, argv[8]);
    if (!ctr) {
	usage(argv[0]);
    }

    if (ctrlen != 8) {
	fprintf(stderr, "The counter must be 16 hex chars long.\n");
	usage(argv[0]);
    }

    argv_to_buf(&encdata, &encdatalen, argv[9]);
    if (!encdata) {
	usage(argv[0]);
    }

    argv_to_buf(&mackeys, &mackeyslen, argv[10]);
    if (!mackeys) {
	usage(argv[0]);
    }

    newdatamsg = assemble_datamsg(mackey, version, sender_instance,
	    receiver_instance, flags, snd_keyid, rcp_keyid, pubv, ctr, encdata,
	    encdatalen, mackeys, mackeyslen);
    printf("%s\n", newdatamsg);
    free(newdatamsg);

    free(mackey);
    gcry_mpi_release(pubv);
    free(ctr);
    free(encdata);
    free(mackeys);
    fflush(stdout);
    return 0;
}
