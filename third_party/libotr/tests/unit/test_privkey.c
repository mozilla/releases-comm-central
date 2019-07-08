/*
 * Copyright (C) 2014 - Julien Voisin <julien.voisin@dustri.org>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License, version 2 only, as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to the Free Software Foundation, Inc., 51
 * Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

#include <gcrypt.h>
#include <pthread.h>
#include <unistd.h>

#include <privkey.h>
#include <proto.h>

#include <tap/tap.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 13

static OtrlUserState us = NULL;
static char filename[] = "/tmp/libotr-testing-XXXXXX";
static FILE* f = NULL;

/*
 * Create a public key block from a private key
 */
static void make_pubkey(unsigned char **pubbufp, size_t *publenp,
		gcry_sexp_t privkey)
{
	gcry_mpi_t p,q,g,y;
	gcry_sexp_t dsas,ps,qs,gs,ys;
	size_t np,nq,ng,ny;
	enum gcry_mpi_format format = GCRYMPI_FMT_USG;

	*pubbufp = NULL;
	*publenp = 0;

	/* Extract the public parameters */
	dsas = gcry_sexp_find_token(privkey, "dsa", 0);
	ps = gcry_sexp_find_token(dsas, "p", 0);
	qs = gcry_sexp_find_token(dsas, "q", 0);
	gs = gcry_sexp_find_token(dsas, "g", 0);
	ys = gcry_sexp_find_token(dsas, "y", 0);
	gcry_sexp_release(dsas);

	p = gcry_sexp_nth_mpi(ps, 1, GCRYMPI_FMT_USG);
	gcry_sexp_release(ps);
	q = gcry_sexp_nth_mpi(qs, 1, GCRYMPI_FMT_USG);
	gcry_sexp_release(qs);
	g = gcry_sexp_nth_mpi(gs, 1, GCRYMPI_FMT_USG);
	gcry_sexp_release(gs);
	y = gcry_sexp_nth_mpi(ys, 1, GCRYMPI_FMT_USG);
	gcry_sexp_release(ys);

	*publenp = 0;
	gcry_mpi_print(format, NULL, 0, &np, p);
	*publenp += np + 4;
	gcry_mpi_print(format, NULL, 0, &nq, q);
	*publenp += nq + 4;
	gcry_mpi_print(format, NULL, 0, &ng, g);
	*publenp += ng + 4;
	gcry_mpi_print(format, NULL, 0, &ny, y);
	*publenp += ny + 4;

	*pubbufp = malloc(*publenp);

	gcry_mpi_release(p);
	gcry_mpi_release(q);
	gcry_mpi_release(g);
	gcry_mpi_release(y);
}

static void test_otrl_privkey_generate_FILEp(void)
{
	int fd = mkstemp(filename);
	f = fdopen(fd, "w+b");

	unlink(filename); // The file will be removed on close
	us = otrl_userstate_create();
	ok(otrl_privkey_generate_FILEp(us, f, "alice", "irc")
		== gcry_error(GPG_ERR_NO_ERROR) &&
		us->privkey_root != NULL,
		"key generated");
}

static void test_otrl_privkey_hash_to_human(void)
{
	int i;
	char human[OTRL_PRIVKEY_FPRINT_HUMAN_LEN];
	unsigned char hash[20];

	for(i = 0; i < 20; i++) {
		hash[i] = 'A' + i;
	}

	otrl_privkey_hash_to_human(human, hash);
	ok(strcmp("41424344 45464748 494A4B4C 4D4E4F50 51525354", human) == 0,
			"Hash to human ok");
}

static void test_otrl_privkey_fingerprint(void)
{
	char fingerprint[OTRL_PRIVKEY_FPRINT_HUMAN_LEN] = {0};
	char expected_fingerprint[OTRL_PRIVKEY_FPRINT_HUMAN_LEN] = {0};
	unsigned char hash[20] = {0};
	char *fp = otrl_privkey_fingerprint(us, fingerprint, "alice", "irc");
	const OtrlPrivKey *p = otrl_privkey_find(us, "alice", "irc");

	gcry_md_hash_buffer(GCRY_MD_SHA1, hash, p->pubkey_data, p->pubkey_datalen);
	otrl_privkey_hash_to_human(expected_fingerprint, hash);

	ok(fp == fingerprint &&
		memcmp(fingerprint, expected_fingerprint,
			OTRL_PRIVKEY_FPRINT_HUMAN_LEN) == 0,
		"Privkey fingerprint ok");
}

static void test_otrl_privkey_fingerprint_raw(void)
{
	unsigned char hash[20] = {0};
	unsigned char expected_hash[20] = {0};
	unsigned char *h = otrl_privkey_fingerprint_raw(us, hash, "alice", "irc");

	const OtrlPrivKey *p = otrl_privkey_find(us, "alice", "irc");
	gcry_md_hash_buffer(GCRY_MD_SHA1, expected_hash, p->pubkey_data,
			p->pubkey_datalen);

	ok(h == hash && memcmp(hash, expected_hash, 20) == 0,
		"Raw privkey fingerprint ok");
}

static void test_otrl_privkey_find(void)
{
	OtrlPrivKey *p = NULL;

	ok(otrl_privkey_find(us, "bob", "xmpp") == NULL,
			"Privkey not found");

	ok(otrl_privkey_find(us, "alice", "xmpp") == NULL,
			"Privkey not found because of wrong protocol");

	ok(otrl_privkey_find(us, "bob", "irc") == NULL,
			"Privkey not found because of wrong name");

	p = otrl_privkey_find(us, "alice", "irc");
	ok(p != NULL && strcmp(p->accountname, "alice") == 0 &&
		strcmp(p->protocol, "irc") == 0,
		"Privkey found");
}

static void test_otrl_privkey_sign(void)
{
	unsigned char *sig = NULL;
	size_t siglen;
	const char *data = "Some data to sign.";
	size_t len = strlen(data);
	OtrlPrivKey *p = otrl_privkey_find(us, "alice", "irc");

	p->pubkey_type = OTRL_PUBKEY_TYPE_DSA + 1;

	ok(otrl_privkey_sign(&sig, &siglen, p,
			(unsigned char *) data, len) == gcry_error(GPG_ERR_INV_VALUE),
			"Wrong pubkey type detected");
	free(sig);

	p->pubkey_type = OTRL_PUBKEY_TYPE_DSA;

	ok(otrl_privkey_sign(&sig, &siglen, p,
			(unsigned char *) data, len) == gcry_error(GPG_ERR_NO_ERROR),
			"data signed");
	free(sig);

	ok(otrl_privkey_sign(&sig, &siglen, p, (unsigned char*)data, 0) ==
			gcry_error(GPG_ERR_NO_ERROR), "data with len 0 signed");
	free(sig);
}

static void test_otrl_privkey_verify(void)
{
	unsigned char *sigbuf = NULL;
	size_t siglen;
	const char *data = "Some data to sign.";
	OtrlPrivKey *privkey = otrl_privkey_find(us, "alice", "irc");
	gcry_mpi_t p,q,g,y;
	gcry_sexp_t dsas, ps, qs, gs, ys;
	gcry_sexp_t pubs = NULL;
	gcry_error_t ret;

	/* Extract pubkey */
	dsas = gcry_sexp_find_token(privkey->privkey, "dsa", 0);
	ps = gcry_sexp_find_token(dsas, "p", 0);
	qs = gcry_sexp_find_token(dsas, "q", 0);
	gs = gcry_sexp_find_token(dsas, "g", 0);
	ys = gcry_sexp_find_token(dsas, "y", 0);
	gcry_sexp_release(dsas);
	p = gcry_sexp_nth_mpi(ps, 1, GCRYMPI_FMT_USG);
	q = gcry_sexp_nth_mpi(qs, 1, GCRYMPI_FMT_USG);
	g = gcry_sexp_nth_mpi(gs, 1, GCRYMPI_FMT_USG);
	y = gcry_sexp_nth_mpi(ys, 1, GCRYMPI_FMT_USG);
	gcry_sexp_release(ps);
	gcry_sexp_release(qs);
	gcry_sexp_release(gs);
	gcry_sexp_release(ys);

	gcry_sexp_build(&pubs, NULL, "(public-key (dsa (p %m)(q %m)(g %m)(y %m)))",
			p, q, g, y);

	gcry_mpi_release(p);
	gcry_mpi_release(q);
	gcry_mpi_release(g);
	gcry_mpi_release(y);

	otrl_privkey_sign(&sigbuf, &siglen, privkey, (unsigned char*)data,
			strlen(data));

	ok(otrl_privkey_verify(sigbuf, siglen, OTRL_PUBKEY_TYPE_DSA, pubs,
				(unsigned char *) data, strlen(data)) == 0, "Signature ok");

	ret = otrl_privkey_verify(sigbuf, siglen, OTRL_PUBKEY_TYPE_DSA, pubs,
			(unsigned char *) data + 1, strlen(data) - 1);
	ok(gcry_error(ret) == gcry_error(GPG_ERR_BAD_SIGNATURE),
			"Wrong signature");

	free(sigbuf);
}

int main(int argc, char **argv)
{
	OtrlPrivKey *p;
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	/* Set to quick random so we don't wait on /dev/random. */
	gcry_control(GCRYCTL_ENABLE_QUICK_RANDOM, 0);

	test_otrl_privkey_generate_FILEp(); //This must be the first one
	p = otrl_privkey_find(us, "alice", "irc");
	make_pubkey(&(p->pubkey_data), &(p->pubkey_datalen), p->privkey);

	test_otrl_privkey_hash_to_human();
	test_otrl_privkey_fingerprint();
	test_otrl_privkey_fingerprint_raw();
	test_otrl_privkey_sign();
	test_otrl_privkey_verify();
	test_otrl_privkey_find();

	fclose(f);
	otrl_userstate_free(us);

	return 0;
}
