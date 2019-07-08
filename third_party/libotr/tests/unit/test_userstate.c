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

#include <userstate.h>
#include <proto.h>

#include <tap/tap.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 1

static void test_otrl_userstate_create()
{
	OtrlUserState us = otrl_userstate_create();
	ok(us->context_root == NULL &&
			us->privkey_root == NULL &&
			us->instag_root == NULL &&
			us->pending_root == NULL &&
			us->timer_running == 0,
			"OtrlUserState ok");
	otrl_userstate_free(us);
}

int main(int argc, char** argv)
{
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	test_otrl_userstate_create();

	return 0;
}
