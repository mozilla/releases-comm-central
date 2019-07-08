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

#include <gcrypt.h>
#include <pthread.h>

#include <proto.h>
#include <sm.h>

#include <tap/tap.h>
#include <utils.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 23

/* Copied from sm.c */
static const int SM_MOD_LEN_BITS = 1536;
static const char *SM_GENERATOR_S = "0x02";
static gcry_mpi_t SM_GENERATOR = NULL;

static const int SM_MSG1_LEN = 6;
static const int SM_MSG2_LEN = 11;
static const int SM_MSG3_LEN = 8;
static const int SM_MSG4_LEN = 3;

/* Alice and Bob SM state for the SMP tests. */
static OtrlSMState *astate;
static OtrlSMState *bstate;
static const char *secret = "truie";
static unsigned char *alice_output;
static int alice_output_len;
static unsigned char *bob_output;
static int bob_output_len;

/* Stub. */
void otrl_sm_msg1_init(gcry_mpi_t **msg1);
void otrl_sm_msg2_init(gcry_mpi_t **msg2);
void otrl_sm_msg3_init(gcry_mpi_t **msg3);
void otrl_sm_msg4_init(gcry_mpi_t **msg4);
void otrl_sm_msg_free(gcry_mpi_t **message, int msglen);

static OtrlSMState *alloc_sm_state(void)
{
	OtrlSMState *smst = malloc(sizeof(*smst));
	ok(smst, "SM State allocated");

	return smst;
}

static void test_sm_state_new(void)
{
	OtrlSMState *smst;

	smst = alloc_sm_state();

	otrl_sm_state_new(smst);
	ok(!smst->secret &&
			!smst->x2 &&
			!smst->x3 &&
			!smst->g1 &&
			!smst->g2 &&
			!smst->g3 &&
			!smst->g3o &&
			!smst->p &&
			!smst->q &&
			!smst->pab &&
			!smst->qab &&
			smst->nextExpected == OTRL_SMP_EXPECT1 &&
			smst->received_question == 0 &&
			smst->sm_prog_state == OTRL_SMP_PROG_OK,
			"SM state new");

	otrl_sm_state_free(smst);
	free(smst);
}

static void test_sm_state_init(void)
{
	OtrlSMState *smst;

	smst = alloc_sm_state();

	otrl_sm_state_new(smst);
	otrl_sm_state_init(smst);
	ok(!gcry_mpi_cmp(smst->secret, gcry_mpi_snew(SM_MOD_LEN_BITS)) &&
			!smst->x2 &&
			!smst->x3 &&
			!gcry_mpi_cmp(smst->g1, gcry_mpi_copy(SM_GENERATOR)) &&
			!gcry_mpi_cmp(smst->g2, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->g3, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->g3o, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->p, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->q, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->pab, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(smst->qab, gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			smst->nextExpected == OTRL_SMP_EXPECT1 &&
			smst->received_question == 0 &&
			smst->sm_prog_state == OTRL_SMP_PROG_OK,
			"SM state init");

	otrl_sm_state_free(smst);
	free(smst);
}

static void test_sm_msg1_init(void)
{
	gcry_mpi_t *msg;

	otrl_sm_msg1_init(&msg);
	ok(msg &&
			!gcry_mpi_cmp(msg[0], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[1] &&
			!gcry_mpi_cmp(msg[2], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[3], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[4] &&
			!gcry_mpi_cmp(msg[5], gcry_mpi_new(SM_MOD_LEN_BITS)),
			"SM msg1 initialized");
	otrl_sm_msg_free(&msg, SM_MSG1_LEN);
	/* Test once here. */
	ok(!msg, "SM msg1 freed");
}

static void test_sm_msg2_init(void)
{
	gcry_mpi_t *msg;

	otrl_sm_msg2_init(&msg);
	ok(msg &&
			!gcry_mpi_cmp(msg[0], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[1] &&
			!gcry_mpi_cmp(msg[2], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[3], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[4] &&
			!gcry_mpi_cmp(msg[5], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[6], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[7], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[8] &&
			!gcry_mpi_cmp(msg[9], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[10], gcry_mpi_new(SM_MOD_LEN_BITS)),
			"SM msg2 initialized");
	otrl_sm_msg_free(&msg, SM_MSG2_LEN);
}

static void test_sm_msg3_init(void)
{
	gcry_mpi_t *msg;

	otrl_sm_msg3_init(&msg);
	ok(msg &&
			!gcry_mpi_cmp(msg[0], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[1], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[2] &&
			!gcry_mpi_cmp(msg[3], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[4], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!gcry_mpi_cmp(msg[5], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[6] &&
			!gcry_mpi_cmp(msg[7], gcry_mpi_new(SM_MOD_LEN_BITS)),
			"SM msg3 initialized");
	otrl_sm_msg_free(&msg, SM_MSG3_LEN);
}

static void test_sm_msg4_init(void)
{
	gcry_mpi_t *msg;

	otrl_sm_msg4_init(&msg);
	ok(msg &&
			!gcry_mpi_cmp(msg[0], gcry_mpi_new(SM_MOD_LEN_BITS)) &&
			!msg[1] &&
			!gcry_mpi_cmp(msg[2], gcry_mpi_new(SM_MOD_LEN_BITS)),
			"SM msg4 initialized");
	otrl_sm_msg_free(&msg, SM_MSG4_LEN);
}

static void test_sm_step1(void)
{
	gcry_error_t err;
	unsigned char hash_secret[SM_DIGEST_SIZE];

	astate = alloc_sm_state();
	otrl_sm_state_new(astate);
	otrl_sm_state_init(astate);

	gcry_md_hash_buffer(SM_HASH_ALGORITHM, hash_secret, secret,
			strlen(secret));

	err = otrl_sm_step1(astate, hash_secret, sizeof(hash_secret),
			&alice_output, &alice_output_len);
	ok(err == GPG_ERR_NO_ERROR, "SMP step1 success");

	gcry_mpi_t secret_mpi;
	gcry_mpi_scan(&secret_mpi, GCRYMPI_FMT_USG, hash_secret,
			sizeof(hash_secret), NULL);
	ok(!gcry_mpi_cmp(astate->secret, secret_mpi) &&
			astate->received_question == 0 &&
			astate->x2 &&
			astate->x3 &&
			astate->sm_prog_state == OTRL_SMP_PROG_OK &&
			alice_output && alice_output_len > 0,
			"SMP step 1 validated");
	gcry_mpi_release(secret_mpi);
}

static void test_sm_step2a(void)
{
	gcry_error_t err;

	bstate = alloc_sm_state();
	otrl_sm_state_new(bstate);
	otrl_sm_state_init(bstate);

	err = otrl_sm_step2a(bstate, alice_output, alice_output_len, 1);
	ok(err == GPG_ERR_NO_ERROR, "SMP step2a success");

	ok(bstate->received_question == 1 &&
			bstate->sm_prog_state == OTRL_SMP_PROG_OK &&
			bstate->g3o &&
			bstate->x2 &&
			bstate->x3,
			"SMP step2a validate");
}

static void test_sm_step2b(void)
{
	gcry_error_t err;
	unsigned char hash_secret[SM_DIGEST_SIZE];

	gcry_md_hash_buffer(SM_HASH_ALGORITHM, hash_secret, secret,
			strlen(secret));

	err = otrl_sm_step2b(bstate, hash_secret, sizeof(hash_secret), &bob_output,
			&bob_output_len);
	ok(err == GPG_ERR_NO_ERROR, "SMP step2b success");

	/* Generate expected data. */
	gcry_mpi_t secret_mpi;
	gcry_mpi_scan(&secret_mpi, GCRYMPI_FMT_USG, hash_secret,
			sizeof(hash_secret), NULL);
	ok(bob_output && bob_output_len > 0 &&
			!gcry_mpi_cmp(bstate->secret, secret_mpi) &&
			bstate->p &&
			bstate->q,
			"SMP step2b validate");
	gcry_mpi_release(secret_mpi);
}

static void test_sm_step3(void)
{
	gcry_error_t err;

	free(alice_output);

	err = otrl_sm_step3(astate, bob_output, bob_output_len, &alice_output,
			&alice_output_len);
	ok(err == GPG_ERR_NO_ERROR, "SMP step3 success");

	ok(alice_output && alice_output_len > 0 &&
			astate->sm_prog_state == OTRL_SMP_PROG_OK &&
			astate->g3o &&
			astate->g2 &&
			astate->g3 &&
			astate->p &&
			astate->q &&
			astate->qab &&
			astate->pab,
			"SMP step3 validate");
}

static void test_sm_step4(void)
{
	gcry_error_t err;

	free(bob_output);

	err = otrl_sm_step4(bstate, alice_output, alice_output_len, &bob_output,
			&bob_output_len);
	ok(err == gcry_error(GPG_ERR_NO_ERROR), "SMP step4 success");

	ok(bob_output && bob_output_len > 0 &&
			bstate->sm_prog_state == OTRL_SMP_PROG_SUCCEEDED &&
			bstate->pab &&
			bstate->qab,
			"SMP step4 validate");
}

static void test_sm_step5(void)
{
	gcry_error_t err;

	err = otrl_sm_step5(astate, bob_output, bob_output_len);
	ok(err == gcry_error(GPG_ERR_NO_ERROR), "SMP step5 success");

	ok(astate && astate->sm_prog_state == OTRL_SMP_PROG_SUCCEEDED,
			"SMP step5 validate");
}

int main(int argc, char **argv)
{
	/* Libtap call for the number of tests planned. */
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	/* Initialize sm subsystem. We can't really unit test that because every
	 * value that is being initialized is static to sm.c. */
	otrl_sm_init();

	/* Init variables we need for testing. */
	gcry_mpi_scan(&SM_GENERATOR, GCRYMPI_FMT_HEX,
			(const unsigned char *)SM_GENERATOR_S, 0, NULL);

	test_sm_state_new();
	test_sm_state_init();
	test_sm_msg1_init();
	test_sm_msg2_init();
	test_sm_msg3_init();
	test_sm_msg4_init();

	test_sm_step1();
	test_sm_step2a();
	test_sm_step2b();
	test_sm_step3();
	test_sm_step4();
	test_sm_step5();

	return 0;
}
