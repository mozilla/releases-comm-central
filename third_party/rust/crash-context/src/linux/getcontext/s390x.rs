std::arch::global_asm! {
    ".text",
    ".global crash_context_getcontext",
    ".hidden crash_context_getcontext",
    ".type crash_context_getcontext, @function",
    ".align 8",
    ".cfi_startproc",
    "crash_context_getcontext:",

    "lgr     %r0,%r2",

    /* rt_sigprocmask (SIG_BLOCK, NULL, &sc->sc_mask, sigsetsize).  */
    "la      %r4,384(%r2)",
    "la      %r2,0",
    "slgr    %r3,%r3",
    "lghi    %r5,8",
    "lghi    %r1,175",
    "svc     0",

    /* Store fpu context.  */
    "lgr     %r1,%r0",
    "stfpc   248(%r1)",
    "std     %f0,256(%r1)",
    "std     %f1,264(%r1)",
    "std     %f2,272(%r1)",
    "std     %f3,280(%r1)",
    "std     %f4,288(%r1)",
    "std     %f5,296(%r1)",
    "std     %f6,304(%r1)",
    "std     %f7,312(%r1)",
    "std     %f8,320(%r1)",
    "std     %f9,328(%r1)",
    "std     %f10,336(%r1)",
    "std     %f11,344(%r1)",
    "std     %f12,352(%r1)",
    "std     %f13,360(%r1)",
    "std     %f14,368(%r1)",
    "std     %f15,376(%r1)",

    /* Set __getcontext return value to 0.  */
    "slgr    %r2,%r2",

    /* Store access registers.  */
    "stam    %a0,%a15,184(%r1)",

    /* Store general purpose registers.  */
    "stmg    %r0,%r15,56(%r1)",

    /* Store psw mask to 0x0 and addr to return address.  Then the address
    can be retrieved from the ucontext structure in the same way as if it
    is created by kernel and passed to a signal-handler. */
    "stg     %r2,40(%r1)",
    "stg     %r14,48(%r1)",
    "br      %r14",

    ".cfi_endproc",
    ".size crash_context_getcontext, . - crash_context_getcontext",
}
