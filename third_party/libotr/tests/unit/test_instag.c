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
#include <limits.h>
#include <pthread.h>
#include <unistd.h>

#include <proto.h>
#include <auth.h>
#include <context.h>

#include <tap/tap.h>
#include <utils.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 13

/* Current directory of this executable. */
static char curdir[PATH_MAX];
static char instag_filepath[PATH_MAX];

static void test_otrl_instag_forget(void)
{
	OtrlInsTag *instag1 = calloc(1, sizeof(OtrlInsTag));
	OtrlInsTag *instag2 = calloc(1, sizeof(OtrlInsTag));

	instag1->tous = &instag1;
	instag1->accountname = strdup("name one");
	instag1->protocol = strdup("protocol one");
	instag1->next = instag2;
	instag1->next->tous = &(instag1->next);
	instag2->accountname = strdup("name two");
	instag2->protocol = strdup("protocol two");

	otrl_instag_forget(NULL);
	ok(1, "Forget on NULL didn't segfault");

	otrl_instag_forget(instag2);
	ok(instag1->next == NULL, "Instag forgotten without segfault");
}

static void test_otrl_instag_forget_all(void)
{
	OtrlUserState us = otrl_userstate_create();
	OtrlInsTag *p = malloc(sizeof(OtrlInsTag));
	p->accountname = strdup("account name");
	p->protocol = strdup("protocol name");
	p->instag = otrl_instag_get_new();

	otrl_instag_forget_all(us);
	ok(1, "Forget all on empty user state");

	p->next = us->instag_root;
	p->tous = &(us->instag_root);
	us->instag_root = p;

	otrl_instag_forget_all(us);
	ok(1, "Forget all on a non-empty user state");
}

static void test_otrl_instag_find(void)
{
	OtrlUserState us = otrl_userstate_create();
	OtrlInsTag *p1 = malloc(sizeof(OtrlInsTag));
	OtrlInsTag *p2 = malloc(sizeof(OtrlInsTag));

	p1->accountname = strdup("account one");
	p1->protocol = strdup("protocol one");
	p1->instag = otrl_instag_get_new();
	p1->next = us->instag_root;
	p1->tous = &(us->instag_root);
	us->instag_root = p1;

	p2->accountname = strdup("account two");
	p2->protocol = strdup("protocol two");
	p2->instag = otrl_instag_get_new();
	p2->next = us->instag_root;
	p2->next->tous = &(p2->next);
	p2->tous = &(us->instag_root);
	us->instag_root = p2;

	ok(otrl_instag_find(us, "account two", "protocol two") == p2,
			"Found instag");
	ok(otrl_instag_find(us, "account one", "protocol two") == NULL,
			"Instag not found");
	ok(otrl_instag_find(us, "account three", "protocol three") == NULL,
			"Instag not found");
}

static void test_otrl_instag_read(void)
{
	OtrlUserState us = otrl_userstate_create();
	OtrlInsTag *one, *two, *three, *four;
	char sone[9] = {0}, stwo[9] = {0}, sfour[9] = {0};
	one = two = three = four = NULL;
	ok(otrl_instag_read(us, "/non_existent_file") ==
			gcry_error_from_errno(ENOENT),
			"Non-existent file detected");

	ok(otrl_instag_read(us, instag_filepath) == GPG_ERR_NO_ERROR,
			"Instag called with success");

	one = otrl_instag_find(us, "alice_xmpp", "XMPP");
	snprintf(sone, sizeof(sone), "%08x", one->instag);

	two = otrl_instag_find(us, "alice_irc", "IRC");
	snprintf(stwo, sizeof(stwo), "%08x", two->instag);

	three = otrl_instag_find(us, "alice_inv", "IRC");

	four = otrl_instag_find(us, "alice_icq", "ICQ");
	snprintf(sfour, sizeof(sfour), "%08x", four->instag);

	ok(one && two && !three && four &&
			strcmp(sone, "01234567") == 0 &&
			strcmp(stwo, "9abcdef0") == 0 &&
			strcmp(sfour, "98765432") == 0,
			"Instag succesfully read");
}

static void test_otrl_instag_read_FILEp(void)
{
	FILE* instf = fopen(instag_filepath, "rb");
	OtrlUserState us = otrl_userstate_create();
	OtrlInsTag* one, *two, *three, *four;
	char sone[9] = {0}, stwo[9] = {0}, sfour[9] = {0};
	one = two = three = four = NULL;

	ok(otrl_instag_read_FILEp(us, instf) == gcry_error(GPG_ERR_NO_ERROR),
			"Instead read from FILEp");
	fclose(instf);

	one = otrl_instag_find(us, "alice_xmpp", "XMPP");
	snprintf(sone, sizeof(sone), "%08x", one->instag);

	two = otrl_instag_find(us, "alice_irc", "IRC");
	snprintf(stwo, sizeof(stwo), "%08x", two->instag);

	three = otrl_instag_find(us, "alice_inv", "IRC");

	four = otrl_instag_find(us, "alice_icq", "ICQ");
	snprintf(sfour, sizeof(sfour), "%08x", four->instag);

	ok(one && two && !three && four &&
			strcmp(sone, "01234567") == 0 &&
			strcmp(stwo, "9abcdef0") == 0 &&
			strcmp(sfour, "98765432") == 0,
			"Instag succesfully read");
}

static void test_otrl_instag_get_new(void)
{
	ok(otrl_instag_get_new() != 0, "New instag generated");
}

static ssize_t get_exe_path(char *buf, size_t len)
{
	char *path_end;

	if (readlink("/proc/self/exe", buf, len) < 0) {
		return -ENOMEM;
	}

	/*
	 * Workaround to handle libtool path of the binary that is actually in the
	 * $(buildir)/.libs. This is to make sure unit test works outside of tree.
	 */
	path_end = strstr(buf, ".libs/");
	if (!path_end) {
		path_end = strrchr(buf, '/');
		if (!path_end) {
			return -errno;
		}
		*(++path_end) = '\0';
	} else {
		*path_end = '\0';
	}

	return path_end - buf;
}

int main(int argc, char **argv)
{
	/* Libtap call for the number of tests planned. */
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	if (get_exe_path(curdir, sizeof(curdir)) < 0) {
		return -ENOMEM;
	}

	/* Build the full path of the instag.txt file. */
	(void) snprintf(instag_filepath, sizeof(instag_filepath), "%s%s", curdir,
			"instag.txt");

	test_otrl_instag_forget();
	test_otrl_instag_forget_all();
	test_otrl_instag_find();
	test_otrl_instag_read();
	test_otrl_instag_read_FILEp();
	test_otrl_instag_get_new();

	return 0;
}
