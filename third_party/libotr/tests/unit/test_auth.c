/*
 * Copyright (C) 2014 - David Goulet <dgoulet@ev0ke.net>
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

#include <auth.h>
#include <context.h>
#include <gcrypt.h>
#include <pthread.h>

#include <tap/tap.h>
#include <utils.h>
#include <proto.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 5

static void test_auth_new(void)
{
	struct context ctx;
	OtrlAuthInfo *auth = &ctx.auth;

	/* API call. */
	otrl_auth_new(&ctx);

	ok(auth->authstate == OTRL_AUTHSTATE_NONE &&
		auth->our_keyid == 0 &&
		auth->encgx == NULL &&
		auth->encgx_len == 0 &&
		utils_is_zeroed(auth->r, 16) &&
		utils_is_zeroed(auth->hashgx, 32) &&
		auth->their_pub == NULL &&
		auth->their_keyid == 0 &&
		auth->enc_c == NULL &&
		auth->enc_cp == NULL &&
		auth->mac_m1 == NULL &&
		auth->mac_m1p == NULL &&
		auth->mac_m2 == NULL &&
		auth->mac_m2p == NULL &&
		utils_is_zeroed(auth->their_fingerprint, 20) &&
		auth->initiated == 0 &&
		auth->protocol_version == 0 &&
		utils_is_zeroed(auth->secure_session_id, 20) &&
		auth->secure_session_id_len == 0 &&
		auth->lastauthmsg == NULL &&
		auth->commit_sent_time == 0 &&
		auth->context == &ctx,
		"OTR auth info init is valid");
}

static void test_auth_clear(void)
{
	struct context ctx;
	OtrlAuthInfo *auth = &ctx.auth;

	/* API call. */
	otrl_auth_clear(auth);

	ok(auth->authstate == OTRL_AUTHSTATE_NONE &&
		auth->our_keyid == 0 &&
		auth->encgx == NULL &&
		auth->encgx_len == 0 &&
		utils_is_zeroed(auth->r, 16) &&
		utils_is_zeroed(auth->hashgx, 32) &&
		auth->their_pub == NULL &&
		auth->their_keyid == 0 &&
		auth->enc_c == NULL &&
		auth->enc_cp == NULL &&
		auth->mac_m1 == NULL &&
		auth->mac_m1p == NULL &&
		auth->mac_m2 == NULL &&
		auth->mac_m2p == NULL &&
		utils_is_zeroed(auth->their_fingerprint, 20) &&
		auth->initiated == 0 &&
		auth->protocol_version == 0 &&
		utils_is_zeroed(auth->secure_session_id, 20) &&
		auth->secure_session_id_len == 0 &&
		auth->lastauthmsg == NULL &&
		auth->commit_sent_time == 0 &&
		auth->context == &ctx,
		"OTR auth info clear is valid");
}

static void test_auth_start_v23(void)
{
	unsigned int version = 3;
	gcry_error_t err;
	struct context ctx;
	OtrlAuthInfo *auth = &ctx.auth;

	/* API call. */
	otrl_auth_new(&ctx);
	err = otrl_auth_start_v23(auth, version);

	ok(err == gcry_error(GPG_ERR_NO_ERROR) &&
		auth->initiated == 1 &&
		auth->protocol_version == version &&
		auth->context->protocol_version == version &&
		auth->our_keyid == 1 &&
		!utils_is_zeroed(auth->r, sizeof(auth->r)) &&
		auth->encgx != NULL &&
		auth->encgx_len > 0 &&
		!utils_is_zeroed(auth->hashgx, sizeof(auth->hashgx)) &&
		auth->lastauthmsg != NULL &&
		auth->authstate == OTRL_AUTHSTATE_AWAITING_DHKEY,
		"OTR auth start v23 is valid");
}

static void test_otrl_auth_copy_on_key()
{
	struct context m_ctx, ctx;
	OtrlAuthInfo *auth = &ctx.auth;
	OtrlAuthInfo *m_auth = &m_ctx.auth;

	otrl_auth_new(&ctx);
	otrl_auth_new(&m_ctx);

	otrl_auth_start_v23(auth, 3);
	otrl_auth_start_v23(m_auth, 3);

	m_auth->authstate = OTRL_AUTHSTATE_NONE;
	auth->authstate = OTRL_AUTHSTATE_AWAITING_REVEALSIG,
	otrl_auth_copy_on_key(m_auth, auth);

	ok(gcry_mpi_cmp((m_auth->our_dh.priv), (auth->our_dh.priv)) != 0 &&
		gcry_mpi_cmp((m_auth->our_dh.pub), (auth->our_dh.pub)) != 0 &&
		m_auth->our_keyid == auth->our_keyid &&
		memcmp(m_auth->r, auth->r, 16) != 0 &&
		memcmp(m_auth->encgx, auth->encgx, 16) != 0 &&
		memcmp(m_auth->hashgx, auth->hashgx, 16) != 0 &&
		auth->authstate == OTRL_AUTHSTATE_AWAITING_REVEALSIG,
		"Copy not done");

	auth->authstate = OTRL_AUTHSTATE_AWAITING_DHKEY;
	m_auth->authstate = OTRL_AUTHSTATE_AWAITING_DHKEY;
	otrl_auth_copy_on_key(m_auth, auth);

	ok(m_auth->initiated == auth->initiated &&
		m_auth->our_keyid == auth->our_keyid &&
		m_auth->our_dh.groupid == auth->our_dh.groupid &&
		gcry_mpi_cmp((m_auth->our_dh.priv), (auth->our_dh.priv)) == 0 &&
		gcry_mpi_cmp((m_auth->our_dh.pub), (auth->our_dh.pub)) == 0 &&
		m_auth->our_keyid == auth->our_keyid &&
		memcmp(m_auth->r, auth->r, 16) == 0 &&
		memcmp(m_auth->encgx, auth->encgx, 16) == 0 &&
		memcmp(m_auth->hashgx, auth->hashgx, 16) == 0 &&
		auth->authstate == OTRL_AUTHSTATE_AWAITING_DHKEY,
		"Copy OK");
}

int main(int argc, char **argv)
{
	/* Libtap call for the number of tests planned. */
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	/* Initialize libotr. */
	otrl_dh_init();

	test_auth_new();
	test_auth_clear();
	test_auth_start_v23();
	test_otrl_auth_copy_on_key();

	return 0;
}
