fn main() {
    cc::Build::new().file("src/log.c").compile("cubeb_log_wrap");
}
