std::arch::global_asm! {
    ".text",
    ".global crash_context_getcontext",
    ".hidden crash_context_getcontext",
    ".type crash_context_getcontext, @function",
    ".align 4",
    ".cfi_startproc",
"crash_context_getcontext:",

    // Save general registers
    "st.d $ra, $a0, 176",
    "st.d $zero, $a0, 184",
    "st.d $ra, $a0, 192",
    "st.d $tp, $a0, 200",
    "st.d $sp, $a0, 208",
    "st.d $a0, $a0, 216",
    "st.d $a1, $a0, 224",
    "st.d $a2, $a0, 232",
    "st.d $a3, $a0, 240",
    "st.d $a4, $a0, 248",
    "st.d $a5, $a0, 256",
    "st.d $a6, $a0, 264",
    "st.d $a7, $a0, 272",
    "st.d $t0, $a0, 280",
    "st.d $t1, $a0, 288",
    "st.d $t2, $a0, 296",
    "st.d $t3, $a0, 304",
    "st.d $t4, $a0, 312",
    "st.d $t5, $a0, 320",
    "st.d $t6, $a0, 328",
    "st.d $t7, $a0, 336",
    "st.d $t8, $a0, 344",
    "st.d $r21, $a0, 352",
    "st.d $fp, $a0, 360",
    "st.d $s0, $a0, 368",
    "st.d $s1, $a0, 376",
    "st.d $s2, $a0, 384",
    "st.d $s3, $a0, 392",
    "st.d $s4, $a0, 400",
    "st.d $s5, $a0, 408",
    "st.d $s6, $a0, 416",
    "st.d $s7, $a0, 424",
    "st.d $s8, $a0, 432",

    "li.w $t0, 0",         // mcontext_t.__flags
    "st.w $t0, $a0, 440",
    "li.w $t0, 0",         // sctx_info.magic
    "st.w $t0, $a0, 448",
    "li.w $t0, 0",         // sctx_info.size
    "st.w $t0, $a0, 452",

    "move $a1, $zero",     // NULL
    "addi.d $a2, $a0, 40", // UCONTEXT_SIGMASK_OFFSET
    "li.w $a3, 8",         // _NSIG8
    "move $a0, $zero",     // SIG_BLOCK
    "li.w $a7, 135",       // __NR_rt_sigprocmask
    "syscall 0",

    "move $a0, $zero",
    "ret",

    ".cfi_endproc",
    ".size crash_context_getcontext, . - crash_context_getcontext",
}
