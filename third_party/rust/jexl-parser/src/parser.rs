// auto-generated: "lalrpop 0.19.0"
// sha256: efc4df38bc31b7278bcd45bde0d529da1f2989ba671c4751704f5690ca305b
use crate::ast::{Expression, OpCode};
use crate::lexer::Token;
#[allow(unused_extern_crates)]
extern crate lalrpop_util as __lalrpop_util;
#[allow(unused_imports)]
use self::__lalrpop_util::state_machine as __state_machine;

#[cfg_attr(rustfmt, rustfmt_skip)]
mod __parse__Expression {
    #![allow(non_snake_case, non_camel_case_types, unused_mut, unused_variables, unused_imports, unused_parens)]

    use crate::ast::{Expression, OpCode};
    use crate::lexer::Token;
    #[allow(unused_extern_crates)]
    extern crate lalrpop_util as __lalrpop_util;
    #[allow(unused_imports)]
    use self::__lalrpop_util::state_machine as __state_machine;
    use super::__ToTriple;
    #[allow(dead_code)]
    pub enum __Symbol<'input>
     {
        Variant0(Token<'input>),
        Variant1(bool),
        Variant2(&'input str),
        Variant3(f64),
        Variant4((String, Box<Expression>)),
        Variant5(::std::vec::Vec<(String, Box<Expression>)>),
        Variant6(Box<Expression>),
        Variant7(::std::vec::Vec<Box<Expression>>),
        Variant8(::std::option::Option<(String, Box<Expression>)>),
        Variant9(Vec<Box<Expression>>),
        Variant10(::std::option::Option<Vec<Box<Expression>>>),
        Variant11(Vec<(String, Box<Expression>)>),
        Variant12(::std::option::Option<Box<Expression>>),
        Variant13(String),
        Variant14(OpCode),
    }
    const __ACTION: &[i8] = &[
        // State 0
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 1
        50, 0, -27, 0, -27, 0, 0, -27, 0, 0, 0, 0, 0, 51, 52, 53, 54, 55, 0, 0, -27, 0, 56, 0, 0, -27, -27, 0, 0, 0, 0, 0, 0,
        // State 2
        -29, 0, -29, 0, -29, 0, 57, -29, 58, 0, 0, 0, 0, -29, -29, -29, -29, -29, 0, 0, -29, 0, -29, 0, 0, -29, -29, 0, 0, 0, 0, 0, 0,
        // State 3
        -31, 0, -31, 0, -31, 59, -31, -31, -31, 0, 60, 61, 0, -31, -31, -31, -31, -31, 0, 0, -31, 0, -31, 0, 0, -31, -31, 0, 0, 0, 0, 0, 0,
        // State 4
        -33, 62, -33, 0, -33, -33, -33, -33, -33, 0, -33, -33, 0, -33, -33, -33, -33, -33, 0, 0, -33, 63, -33, 0, 0, -33, -33, 0, 0, 0, 0, 0, 0,
        // State 5
        -40, -40, -40, 0, -40, -40, -40, -40, -40, 66, -40, -40, -40, -40, -40, -40, -40, -40, -40, 16, -40, -40, -40, 0, -40, -40, -40, 0, 0, 0, 0, 0, 0,
        // State 6
        0, 0, 67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0,
        // State 7
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 8
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, -23, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 9
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -19, 0, 45, 73, 0, 0, 49,
        // State 10
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 11
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 12
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 13
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 14
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 15
        0, 0, 0, 8, 0, 0, 0, 0, 0, 77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 16
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 17
        0, 0, 67, 0, 78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0,
        // State 18
        0, 0, 0, 8, -25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, -25, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 19
        0, 0, 67, 0, -22, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -22, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0,
        // State 20
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -21, 0, 45, 73, 0, 0, 49,
        // State 21
        -28, 0, -28, 0, -28, 0, 57, -28, 58, 0, 0, 0, 0, -28, -28, -28, -28, -28, 0, 0, -28, 0, -28, 0, 0, -28, -28, 0, 0, 0, 0, 0, 0,
        // State 22
        -30, 0, -30, 0, -30, 59, -30, -30, -30, 0, 60, 61, 0, -30, -30, -30, -30, -30, 0, 0, -30, 0, -30, 0, 0, -30, -30, 0, 0, 0, 0, 0, 0,
        // State 23
        -32, 62, -32, 0, -32, -32, -32, -32, -32, 0, -32, -32, 0, -32, -32, -32, -32, -32, 0, 0, -32, 63, -32, 0, 0, -32, -32, 0, 0, 0, 0, 0, 0,
        // State 24
        -39, -39, -39, 31, -39, -39, -39, -39, -39, 0, -39, -39, -39, -39, -39, -39, -39, -39, -39, 0, -39, -39, -39, 0, -39, -39, -39, 0, 0, 0, 0, 0, 0,
        // State 25
        0, 0, 67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0,
        // State 26
        50, 0, -26, 0, -26, 0, 0, -26, 0, 0, 0, 0, 0, 51, 52, 53, 54, 55, 0, 0, -26, 0, 56, 0, 0, -26, -26, 0, 0, 0, 0, 0, 0,
        // State 27
        0, 0, 67, 0, -24, 0, 0, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -24, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0,
        // State 28
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 29
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 30
        0, 0, 0, 8, -23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 31
        50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 51, 52, 53, 54, 55, 0, 0, 0, 0, 56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 32
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 33
        0, 0, 67, 0, 0, 0, 0, 88, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, -18, 0, 0, 0, 0, 0, 0,
        // State 34
        0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 44, 45, 46, 47, 48, 49,
        // State 35
        0, 0, 67, 0, 0, 0, 0, 91, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, -20, 0, 0, 0, 0, 0, 0,
        // State 36
        -47, -47, -47, 0, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, -47, 0, -47, -47, -47, 0, 0, 0, 0, 0, 0,
        // State 37
        0, 0, -52, 0, -52, 0, 0, -52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -52, 0, 0, 0, 0, -52, -52, 0, 0, 0, 0, 0, 0,
        // State 38
        -35, -35, -35, 0, -35, -35, -35, -35, -35, 0, -35, -35, 0, -35, -35, -35, -35, -35, 15, 0, -35, -35, -35, 0, 0, -35, -35, 0, 0, 0, 0, 0, 0,
        // State 39
        -37, -37, -37, 0, -37, -37, -37, -37, -37, 0, -37, -37, 0, -37, -37, -37, -37, -37, -37, 0, -37, -37, -37, 0, 64, -37, -37, 0, 0, 0, 0, 0, 0,
        // State 40
        -43, -43, -43, 0, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, -43, 0, -43, -43, -43, 0, 0, 0, 0, 0, 0,
        // State 41
        -48, -48, -48, 0, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, -48, 0, -48, -48, -48, 0, 0, 0, 0, 0, 0,
        // State 42
        -46, -46, -46, 0, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, -46, 0, -46, -46, -46, 0, 0, 0, 0, 0, 0,
        // State 43
        -45, -45, -45, 0, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, -45, 0, -45, -45, -45, 0, 0, 0, 0, 0, 0,
        // State 44
        -76, -76, -76, 0, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, -76, 0, -76, -76, -76, 0, 0, 0, 0, 0, 0,
        // State 45
        -50, -50, -50, 0, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, 0, -50, -50, -50, 0, 0, 0, 0, 0, 0,
        // State 46
        -49, -49, -49, 0, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, -49, 0, -49, -49, -49, 0, 0, 0, 0, 0, 0,
        // State 47
        -44, -44, -44, 0, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, -44, 0, -44, -44, -44, 0, 0, 0, 0, 0, 0,
        // State 48
        -77, -77, -77, 0, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, -77, 0, -77, -77, -77, 0, 0, 0, 0, 0, 0,
        // State 49
        0, 0, 0, -63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -63, 0, 0, 0, -63, 0, 0, 0, -63, -63, -63, -63, -63, -63,
        // State 50
        0, 0, 0, -67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -67, 0, 0, 0, -67, 0, 0, 0, -67, -67, -67, -67, -67, -67,
        // State 51
        0, 0, 0, -65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -65, 0, 0, 0, -65, 0, 0, 0, -65, -65, -65, -65, -65, -65,
        // State 52
        0, 0, 0, -62, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -62, 0, 0, 0, -62, 0, 0, 0, -62, -62, -62, -62, -62, -62,
        // State 53
        0, 0, 0, -66, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -66, 0, 0, 0, -66, 0, 0, 0, -66, -66, -66, -66, -66, -66,
        // State 54
        0, 0, 0, -64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -64, 0, 0, 0, -64, 0, 0, 0, -64, -64, -64, -64, -64, -64,
        // State 55
        0, 0, 0, -68, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -68, 0, 0, 0, -68, 0, 0, 0, -68, -68, -68, -68, -68, -68,
        // State 56
        0, 0, 0, -69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -69, 0, 0, 0, -69, 0, 0, 0, -69, -69, -69, -69, -69, -69,
        // State 57
        0, 0, 0, -70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -70, 0, 0, 0, -70, 0, 0, 0, -70, -70, -70, -70, -70, -70,
        // State 58
        0, 0, 0, -71, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -71, 0, 0, 0, -71, 0, 0, 0, -71, -71, -71, -71, -71, -71,
        // State 59
        0, 0, 0, -73, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -73, 0, 0, 0, -73, 0, 0, 0, -73, -73, -73, -73, -73, -73,
        // State 60
        0, 0, 0, -72, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -72, 0, 0, 0, -72, 0, 0, 0, -72, -72, -72, -72, -72, -72,
        // State 61
        0, 0, 0, -74, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -74, 0, 0, 0, -74, 0, 0, 0, -74, -74, -74, -74, -74, -74,
        // State 62
        0, 0, 0, -75, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -75, 0, 0, 0, -75, 0, 0, 0, -75, -75, -75, -75, -75, -75,
        // State 63
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0,
        // State 64
        -41, -41, -41, 0, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, -41, 0, -41, -41, -41, 0, 0, 0, 0, 0, 0,
        // State 65
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 76, 0, 0, 0,
        // State 66
        0, 0, 0, -60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -60, 0, 0, 0, -60, 0, 0, 0, -60, -60, -60, -60, -60, -60,
        // State 67
        0, 0, 0, -61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -61, 0, 0, 0, -61, 0, 0, 0, -61, -61, -61, -61, -61, -61,
        // State 68
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 69
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 82, 0, 0, 0, 0, 0, 0,
        // State 70
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 71
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 72
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -59, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 73
        -34, -34, -34, 0, -34, -34, -34, -34, -34, 0, -34, -34, 0, -34, -34, -34, -34, -34, 15, 0, -34, -34, -34, 0, 0, -34, -34, 0, 0, 0, 0, 0, 0,
        // State 74
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 75
        -42, -42, -42, 0, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, -42, 0, -42, -42, -42, 0, 0, 0, 0, 0, 0,
        // State 76
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0,
        // State 77
        -51, -51, -51, 0, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, -51, 0, -51, -51, -51, 0, 0, 0, 0, 0, 0,
        // State 78
        -17, -17, -17, 0, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, -17, 0, -17, -17, -17, 0, 0, 0, 0, 0, 0,
        // State 79
        0, 0, 0, -9, -9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -9, -9, 0, 0, -9, 0, 0, 0, -9, -9, -9, -9, -9, -9,
        // State 80
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 81
        -57, -57, -57, 0, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, -57, 0, -57, -57, -57, 0, 0, 0, 0, 0, 0,
        // State 82
        -38, -38, -38, 0, -38, -38, -38, -38, -38, 0, -38, -38, -38, -38, -38, -38, -38, -38, -38, 0, -38, -38, -38, 0, -38, -38, -38, 0, 0, 0, 0, 0, 0,
        // State 83
        -56, -56, -56, 0, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, -56, 0, -56, -56, -56, 0, 0, 0, 0, 0, 0,
        // State 84
        0, 0, 0, -10, -10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -10, -10, 0, 0, -10, 0, 0, 0, -10, -10, -10, -10, -10, -10,
        // State 85
        -36, -36, -36, 0, -36, -36, -36, -36, -36, 0, -36, -36, 0, -36, -36, -36, -36, -36, -36, 0, -36, -36, -36, 0, 64, -36, -36, 0, 0, 0, 0, 0, 0,
        // State 86
        0, 0, 0, 0, 89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 87
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -4, 0, -4, -4, 0, 0, -4,
        // State 88
        -14, -14, -14, 0, -14, -14, -14, -14, -14, 0, -14, -14, -14, -14, -14, -14, -14, -14, -14, 0, -14, -14, -14, 0, -14, -14, -14, 0, 0, 0, 0, 0, 0,
        // State 89
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 92, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // State 90
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -5, 0, -5, -5, 0, 0, -5,
        // State 91
        -55, -55, -55, 0, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, -55, 0, -55, -55, -55, 0, 0, 0, 0, 0, 0,
    ];
    fn __action(state: i8, integer: usize) -> i8 {
        __ACTION[(state as usize) * 33 + integer]
    }
    const __EOF_ACTION: &[i8] = &[
        // State 0
        0,
        // State 1
        -27,
        // State 2
        -29,
        // State 3
        -31,
        // State 4
        -33,
        // State 5
        -40,
        // State 6
        -78,
        // State 7
        0,
        // State 8
        0,
        // State 9
        0,
        // State 10
        0,
        // State 11
        0,
        // State 12
        0,
        // State 13
        0,
        // State 14
        0,
        // State 15
        0,
        // State 16
        0,
        // State 17
        0,
        // State 18
        0,
        // State 19
        0,
        // State 20
        0,
        // State 21
        -28,
        // State 22
        -30,
        // State 23
        -32,
        // State 24
        -39,
        // State 25
        0,
        // State 26
        -26,
        // State 27
        0,
        // State 28
        0,
        // State 29
        0,
        // State 30
        0,
        // State 31
        0,
        // State 32
        0,
        // State 33
        0,
        // State 34
        0,
        // State 35
        0,
        // State 36
        -47,
        // State 37
        -52,
        // State 38
        -35,
        // State 39
        -37,
        // State 40
        -43,
        // State 41
        -48,
        // State 42
        -46,
        // State 43
        -45,
        // State 44
        -76,
        // State 45
        -50,
        // State 46
        -49,
        // State 47
        -44,
        // State 48
        -77,
        // State 49
        0,
        // State 50
        0,
        // State 51
        0,
        // State 52
        0,
        // State 53
        0,
        // State 54
        0,
        // State 55
        0,
        // State 56
        0,
        // State 57
        0,
        // State 58
        0,
        // State 59
        0,
        // State 60
        0,
        // State 61
        0,
        // State 62
        0,
        // State 63
        0,
        // State 64
        -41,
        // State 65
        0,
        // State 66
        0,
        // State 67
        0,
        // State 68
        0,
        // State 69
        0,
        // State 70
        0,
        // State 71
        0,
        // State 72
        0,
        // State 73
        -34,
        // State 74
        0,
        // State 75
        -42,
        // State 76
        0,
        // State 77
        -51,
        // State 78
        -17,
        // State 79
        0,
        // State 80
        0,
        // State 81
        -57,
        // State 82
        -38,
        // State 83
        -56,
        // State 84
        0,
        // State 85
        -36,
        // State 86
        0,
        // State 87
        0,
        // State 88
        -14,
        // State 89
        0,
        // State 90
        0,
        // State 91
        -55,
    ];
    fn __goto(state: i8, nt: usize) -> i8 {
        match nt {
            2 => 20,
            5 => 18,
            8 => 82,
            10 => 36,
            11 => 69,
            12 => match state {
                30 => 86,
                _ => 68,
            },
            13 => 37,
            14 => match state {
                16 => 26,
                _ => 1,
            },
            15 => match state {
                10 => 21,
                _ => 2,
            },
            16 => match state {
                11 => 22,
                _ => 3,
            },
            17 => match state {
                12 => 23,
                _ => 4,
            },
            18 => match state {
                13 => 73,
                _ => 38,
            },
            19 => match state {
                14 => 74,
                29 => 85,
                _ => 39,
            },
            20 => 5,
            21 => match state {
                34 => 89,
                _ => 40,
            },
            22 => match state {
                0 => 6,
                7 => 17,
                15 => 25,
                18 => 27,
                28 => 33,
                32 => 35,
                _ => 19,
            },
            24 => 64,
            25 => 41,
            26 => match state {
                20 => 80,
                _ => 70,
            },
            27 => 16,
            28 => match state {
                31 => 34,
                _ => 10,
            },
            29 => 11,
            30 => 12,
            31 => 13,
            32 => match state {
                9 | 20 => 71,
                _ => 42,
            },
            _ => 0,
        }
    }
    fn __expected_tokens(__state: i8) -> Vec<::std::string::String> {
        const __TERMINAL: &[&str] = &[
            r###""!=""###,
            r###""%""###,
            r###""&&""###,
            r###""(""###,
            r###"")""###,
            r###""*""###,
            r###""+""###,
            r###"",""###,
            r###""-""###,
            r###"".""###,
            r###""/""###,
            r###""//""###,
            r###"":""###,
            r###""<""###,
            r###""<=""###,
            r###""==""###,
            r###"">""###,
            r###"">=""###,
            r###""?""###,
            r###""[""###,
            r###""]""###,
            r###""^""###,
            r###""in""###,
            r###""{""###,
            r###""|""###,
            r###""||""###,
            r###""}""###,
            r###"Boolean"###,
            r###"DoubleQuotedString"###,
            r###"Identifier"###,
            r###"Null"###,
            r###"Number"###,
            r###"SingleQuotedString"###,
        ];
        __TERMINAL.iter().enumerate().filter_map(|(index, terminal)| {
            let next_state = __action(__state, index);
            if next_state == 0 {
                None
            } else {
                Some(terminal.to_string())
            }
        }).collect()
    }
    pub struct __StateMachine<'input>
    where 
    {
        __phantom: ::std::marker::PhantomData<(&'input ())>,
    }
    impl<'input> __state_machine::ParserDefinition for __StateMachine<'input>
    where 
    {
        type Location = usize;
        type Error = crate::lexer::LexError;
        type Token = Token<'input>;
        type TokenIndex = usize;
        type Symbol = __Symbol<'input>;
        type Success = Box<Expression>;
        type StateIndex = i8;
        type Action = i8;
        type ReduceIndex = i8;
        type NonterminalIndex = usize;

        #[inline]
        fn start_location(&self) -> Self::Location {
              Default::default()
        }

        #[inline]
        fn start_state(&self) -> Self::StateIndex {
              0
        }

        #[inline]
        fn token_to_index(&self, token: &Self::Token) -> Option<usize> {
            __token_to_integer(token, ::std::marker::PhantomData::<(&())>)
        }

        #[inline]
        fn action(&self, state: i8, integer: usize) -> i8 {
            __action(state, integer)
        }

        #[inline]
        fn error_action(&self, state: i8) -> i8 {
            __action(state, 33 - 1)
        }

        #[inline]
        fn eof_action(&self, state: i8) -> i8 {
            __EOF_ACTION[state as usize]
        }

        #[inline]
        fn goto(&self, state: i8, nt: usize) -> i8 {
            __goto(state, nt)
        }

        fn token_to_symbol(&self, token_index: usize, token: Self::Token) -> Self::Symbol {
            __token_to_symbol(token_index, token, ::std::marker::PhantomData::<(&())>)
        }

        fn expected_tokens(&self, state: i8) -> Vec<String> {
            __expected_tokens(state)
        }

        #[inline]
        fn uses_error_recovery(&self) -> bool {
            false
        }

        #[inline]
        fn error_recovery_symbol(
            &self,
            recovery: __state_machine::ErrorRecovery<Self>,
        ) -> Self::Symbol {
            panic!("error recovery not enabled for this grammar")
        }

        fn reduce(
            &mut self,
            action: i8,
            start_location: Option<&Self::Location>,
            states: &mut Vec<i8>,
            symbols: &mut Vec<__state_machine::SymbolTriple<Self>>,
        ) -> Option<__state_machine::ParseResult<Self>> {
            __reduce(
                action,
                start_location,
                states,
                symbols,
                ::std::marker::PhantomData::<(&())>,
            )
        }

        fn simulate_reduce(&self, action: i8) -> __state_machine::SimulatedReduce<Self> {
            panic!("error recovery not enabled for this grammar")
        }
    }
    fn __token_to_integer<
        'input,
    >(
        __token: &Token<'input>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> Option<usize>
    {
        match *__token {
            Token::NotEqual if true => Some(0),
            Token::Modulus if true => Some(1),
            Token::And if true => Some(2),
            Token::LeftParen if true => Some(3),
            Token::RightParen if true => Some(4),
            Token::Multiply if true => Some(5),
            Token::Plus if true => Some(6),
            Token::Comma if true => Some(7),
            Token::Minus if true => Some(8),
            Token::Dot if true => Some(9),
            Token::Divide if true => Some(10),
            Token::FloorDivide if true => Some(11),
            Token::Colon if true => Some(12),
            Token::Less if true => Some(13),
            Token::LessEqual if true => Some(14),
            Token::Equal if true => Some(15),
            Token::Greater if true => Some(16),
            Token::GreaterEqual if true => Some(17),
            Token::Question if true => Some(18),
            Token::LeftBracket if true => Some(19),
            Token::RightBracket if true => Some(20),
            Token::Exponent if true => Some(21),
            Token::In if true => Some(22),
            Token::LeftBrace if true => Some(23),
            Token::Pipe if true => Some(24),
            Token::Or if true => Some(25),
            Token::RightBrace if true => Some(26),
            Token::Boolean(_) if true => Some(27),
            Token::DoubleQuotedString(_) if true => Some(28),
            Token::Identifier(_) if true => Some(29),
            Token::Null if true => Some(30),
            Token::Number(_) if true => Some(31),
            Token::SingleQuotedString(_) if true => Some(32),
            _ => None,
        }
    }
    fn __token_to_symbol<
        'input,
    >(
        __token_index: usize,
        __token: Token<'input>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> __Symbol<'input>
    {
        match __token_index {
            0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 30 => __Symbol::Variant0(__token),
            27 => match __token {
                Token::Boolean(__tok0) if true => __Symbol::Variant1(__tok0),
                _ => unreachable!(),
            },
            28 | 29 | 32 => match __token {
                Token::DoubleQuotedString(__tok0) | Token::Identifier(__tok0) | Token::SingleQuotedString(__tok0) if true => __Symbol::Variant2(__tok0),
                _ => unreachable!(),
            },
            31 => match __token {
                Token::Number(__tok0) if true => __Symbol::Variant3(__tok0),
                _ => unreachable!(),
            },
            _ => unreachable!(),
        }
    }
    pub struct ExpressionParser {
        _priv: (),
    }

    impl ExpressionParser {
        pub fn new() -> ExpressionParser {
            ExpressionParser {
                _priv: (),
            }
        }

        #[allow(dead_code)]
        pub fn parse<
            'input,
            __TOKEN: __ToTriple<'input, >,
            __TOKENS: IntoIterator<Item=__TOKEN>,
        >(
            &self,
            __tokens0: __TOKENS,
        ) -> Result<Box<Expression>, __lalrpop_util::ParseError<usize, Token<'input>, crate::lexer::LexError>>
        {
            let __tokens = __tokens0.into_iter();
            let mut __tokens = __tokens.map(|t| __ToTriple::to_triple(t));
            __state_machine::Parser::drive(
                __StateMachine {
                    __phantom: ::std::marker::PhantomData::<(&())>,
                },
                __tokens,
            )
        }
    }
    pub(crate) fn __reduce<
        'input,
    >(
        __action: i8,
        __lookahead_start: Option<&usize>,
        __states: &mut ::std::vec::Vec<i8>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> Option<Result<Box<Expression>,__lalrpop_util::ParseError<usize, Token<'input>, crate::lexer::LexError>>>
    {
        let (__pop_states, __nonterminal) = match __action {
            0 => {
                __reduce0(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            1 => {
                __reduce1(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            2 => {
                __reduce2(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            3 => {
                __reduce3(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            4 => {
                __reduce4(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            5 => {
                __reduce5(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            6 => {
                __reduce6(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            7 => {
                __reduce7(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            8 => {
                __reduce8(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            9 => {
                __reduce9(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            10 => {
                __reduce10(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            11 => {
                __reduce11(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            12 => {
                __reduce12(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            13 => {
                __reduce13(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            14 => {
                __reduce14(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            15 => {
                __reduce15(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            16 => {
                __reduce16(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            17 => {
                __reduce17(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            18 => {
                __reduce18(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            19 => {
                __reduce19(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            20 => {
                __reduce20(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            21 => {
                __reduce21(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            22 => {
                __reduce22(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            23 => {
                __reduce23(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            24 => {
                __reduce24(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            25 => {
                __reduce25(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            26 => {
                __reduce26(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            27 => {
                __reduce27(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            28 => {
                __reduce28(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            29 => {
                __reduce29(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            30 => {
                __reduce30(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            31 => {
                __reduce31(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            32 => {
                __reduce32(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            33 => {
                __reduce33(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            34 => {
                __reduce34(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            35 => {
                __reduce35(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            36 => {
                __reduce36(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            37 => {
                __reduce37(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            38 => {
                __reduce38(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            39 => {
                __reduce39(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            40 => {
                __reduce40(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            41 => {
                __reduce41(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            42 => {
                __reduce42(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            43 => {
                __reduce43(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            44 => {
                __reduce44(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            45 => {
                __reduce45(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            46 => {
                __reduce46(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            47 => {
                __reduce47(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            48 => {
                __reduce48(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            49 => {
                __reduce49(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            50 => {
                __reduce50(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            51 => {
                __reduce51(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            52 => {
                __reduce52(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            53 => {
                __reduce53(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            54 => {
                __reduce54(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            55 => {
                __reduce55(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            56 => {
                __reduce56(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            57 => {
                __reduce57(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            58 => {
                __reduce58(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            59 => {
                __reduce59(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            60 => {
                __reduce60(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            61 => {
                __reduce61(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            62 => {
                __reduce62(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            63 => {
                __reduce63(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            64 => {
                __reduce64(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            65 => {
                __reduce65(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            66 => {
                __reduce66(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            67 => {
                __reduce67(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            68 => {
                __reduce68(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            69 => {
                __reduce69(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            70 => {
                __reduce70(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            71 => {
                __reduce71(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            72 => {
                __reduce72(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            73 => {
                __reduce73(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            74 => {
                __reduce74(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            75 => {
                __reduce75(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            76 => {
                __reduce76(__lookahead_start, __symbols, ::std::marker::PhantomData::<(&())>)
            }
            77 => {
                // __Expression = Expression => ActionFn(0);
                let __sym0 = __pop_Variant6(__symbols);
                let __start = __sym0.0.clone();
                let __end = __sym0.2.clone();
                let __nt = super::__action0::<>(__sym0);
                return Some(Ok(__nt));
            }
            _ => panic!("invalid action code {}", __action)
        };
        let __states_len = __states.len();
        __states.truncate(__states_len - __pop_states);
        let __state = *__states.last().unwrap();
        let __next_state = __goto(__state, __nonterminal);
        __states.push(__next_state);
        None
    }
    #[inline(never)]
    fn __symbol_type_mismatch() -> ! {
        panic!("symbol type mismatch")
    }
    fn __pop_Variant4<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, (String, Box<Expression>), usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant4(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant6<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, Box<Expression>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant6(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant14<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, OpCode, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant14(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant13<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, String, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant13(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant0<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, Token<'input>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant0(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant11<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, Vec<(String, Box<Expression>)>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant11(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant9<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, Vec<Box<Expression>>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant9(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant1<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, bool, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant1(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant3<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, f64, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant3(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant8<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, ::std::option::Option<(String, Box<Expression>)>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant8(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant12<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, ::std::option::Option<Box<Expression>>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant12(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant10<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, ::std::option::Option<Vec<Box<Expression>>>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant10(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant5<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant5(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant7<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, ::std::vec::Vec<Box<Expression>>, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant7(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    fn __pop_Variant2<
      'input,
    >(
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>
    ) -> (usize, &'input str, usize)
     {
        match __symbols.pop().unwrap() {
            (__l, __Symbol::Variant2(__v), __r) => (__l, __v, __r),
            _ => __symbol_type_mismatch()
        }
    }
    pub(crate) fn __reduce0<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<(<ObjectIdentifier> ":" <Expression>)> ",") = ObjectIdentifier, ":", Expression, "," => ActionFn(71);
        assert!(__symbols.len() >= 4);
        let __sym3 = __pop_Variant0(__symbols);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym3.2.clone();
        let __nt = super::__action71::<>(__sym0, __sym1, __sym2, __sym3);
        __symbols.push((__start, __Symbol::Variant4(__nt), __end));
        (4, 0)
    }
    pub(crate) fn __reduce1<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<(<ObjectIdentifier> ":" <Expression>)> ",")* =  => ActionFn(64);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action64::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant5(__nt), __end));
        (0, 1)
    }
    pub(crate) fn __reduce2<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<(<ObjectIdentifier> ":" <Expression>)> ",")* = (<(<ObjectIdentifier> ":" <Expression>)> ",")+ => ActionFn(65);
        let __sym0 = __pop_Variant5(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action65::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant5(__nt), __end));
        (1, 1)
    }
    pub(crate) fn __reduce3<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<(<ObjectIdentifier> ":" <Expression>)> ",")+ = ObjectIdentifier, ":", Expression, "," => ActionFn(73);
        assert!(__symbols.len() >= 4);
        let __sym3 = __pop_Variant0(__symbols);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym3.2.clone();
        let __nt = super::__action73::<>(__sym0, __sym1, __sym2, __sym3);
        __symbols.push((__start, __Symbol::Variant5(__nt), __end));
        (4, 2)
    }
    pub(crate) fn __reduce4<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<(<ObjectIdentifier> ":" <Expression>)> ",")+ = (<(<ObjectIdentifier> ":" <Expression>)> ",")+, ObjectIdentifier, ":", Expression, "," => ActionFn(74);
        assert!(__symbols.len() >= 5);
        let __sym4 = __pop_Variant0(__symbols);
        let __sym3 = __pop_Variant6(__symbols);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant13(__symbols);
        let __sym0 = __pop_Variant5(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym4.2.clone();
        let __nt = super::__action74::<>(__sym0, __sym1, __sym2, __sym3, __sym4);
        __symbols.push((__start, __Symbol::Variant5(__nt), __end));
        (5, 2)
    }
    pub(crate) fn __reduce5<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<Expression> ",") = Expression, "," => ActionFn(61);
        assert!(__symbols.len() >= 2);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym1.2.clone();
        let __nt = super::__action61::<>(__sym0, __sym1);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (2, 3)
    }
    pub(crate) fn __reduce6<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<Expression> ",")* =  => ActionFn(59);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action59::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant7(__nt), __end));
        (0, 4)
    }
    pub(crate) fn __reduce7<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<Expression> ",")* = (<Expression> ",")+ => ActionFn(60);
        let __sym0 = __pop_Variant7(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action60::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant7(__nt), __end));
        (1, 4)
    }
    pub(crate) fn __reduce8<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<Expression> ",")+ = Expression, "," => ActionFn(77);
        assert!(__symbols.len() >= 2);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym1.2.clone();
        let __nt = super::__action77::<>(__sym0, __sym1);
        __symbols.push((__start, __Symbol::Variant7(__nt), __end));
        (2, 5)
    }
    pub(crate) fn __reduce9<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<Expression> ",")+ = (<Expression> ",")+, Expression, "," => ActionFn(78);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant6(__symbols);
        let __sym0 = __pop_Variant7(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action78::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant7(__nt), __end));
        (3, 5)
    }
    pub(crate) fn __reduce10<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<ObjectIdentifier> ":" <Expression>) = ObjectIdentifier, ":", Expression => ActionFn(53);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action53::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant4(__nt), __end));
        (3, 6)
    }
    pub(crate) fn __reduce11<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<ObjectIdentifier> ":" <Expression>)? = ObjectIdentifier, ":", Expression => ActionFn(72);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action72::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant8(__nt), __end));
        (3, 7)
    }
    pub(crate) fn __reduce12<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // (<ObjectIdentifier> ":" <Expression>)? =  => ActionFn(63);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action63::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant8(__nt), __end));
        (0, 7)
    }
    pub(crate) fn __reduce13<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Args = "(", Comma<Expression>, ")" => ActionFn(27);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant9(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action27::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (3, 8)
    }
    pub(crate) fn __reduce14<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Args? = Args => ActionFn(55);
        let __sym0 = __pop_Variant9(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action55::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant10(__nt), __end));
        (1, 9)
    }
    pub(crate) fn __reduce15<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Args? =  => ActionFn(56);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action56::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant10(__nt), __end));
        (0, 9)
    }
    pub(crate) fn __reduce16<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Array = "[", Comma<Expression>, "]" => ActionFn(48);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant9(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action48::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (3, 10)
    }
    pub(crate) fn __reduce17<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<(<ObjectIdentifier> ":" <Expression>)> = ObjectIdentifier, ":", Expression => ActionFn(81);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action81::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant11(__nt), __end));
        (3, 11)
    }
    pub(crate) fn __reduce18<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<(<ObjectIdentifier> ":" <Expression>)> =  => ActionFn(82);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action82::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant11(__nt), __end));
        (0, 11)
    }
    pub(crate) fn __reduce19<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<(<ObjectIdentifier> ":" <Expression>)> = (<(<ObjectIdentifier> ":" <Expression>)> ",")+, ObjectIdentifier, ":", Expression => ActionFn(83);
        assert!(__symbols.len() >= 4);
        let __sym3 = __pop_Variant6(__symbols);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant13(__symbols);
        let __sym0 = __pop_Variant5(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym3.2.clone();
        let __nt = super::__action83::<>(__sym0, __sym1, __sym2, __sym3);
        __symbols.push((__start, __Symbol::Variant11(__nt), __end));
        (4, 11)
    }
    pub(crate) fn __reduce20<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<(<ObjectIdentifier> ":" <Expression>)> = (<(<ObjectIdentifier> ":" <Expression>)> ",")+ => ActionFn(84);
        let __sym0 = __pop_Variant5(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action84::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant11(__nt), __end));
        (1, 11)
    }
    pub(crate) fn __reduce21<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<Expression> = Expression => ActionFn(87);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action87::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (1, 12)
    }
    pub(crate) fn __reduce22<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<Expression> =  => ActionFn(88);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action88::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (0, 12)
    }
    pub(crate) fn __reduce23<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<Expression> = (<Expression> ",")+, Expression => ActionFn(89);
        assert!(__symbols.len() >= 2);
        let __sym1 = __pop_Variant6(__symbols);
        let __sym0 = __pop_Variant7(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym1.2.clone();
        let __nt = super::__action89::<>(__sym0, __sym1);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (2, 12)
    }
    pub(crate) fn __reduce24<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Comma<Expression> = (<Expression> ",")+ => ActionFn(90);
        let __sym0 = __pop_Variant7(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action90::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant9(__nt), __end));
        (1, 12)
    }
    pub(crate) fn __reduce25<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr00 = Expression, Op10, Expr10 => ActionFn(2);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant14(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action2::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 13)
    }
    pub(crate) fn __reduce26<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr00 = Expr10 => ActionFn(3);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action3::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 13)
    }
    pub(crate) fn __reduce27<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr10 = Expr10, Op20, Expr20 => ActionFn(4);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant14(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action4::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 14)
    }
    pub(crate) fn __reduce28<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr10 = Expr20 => ActionFn(5);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action5::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 14)
    }
    pub(crate) fn __reduce29<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr20 = Expr20, Op30, Expr30 => ActionFn(6);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant14(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action6::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 15)
    }
    pub(crate) fn __reduce30<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr20 = Expr30 => ActionFn(7);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action7::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 15)
    }
    pub(crate) fn __reduce31<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr30 = Expr30, Op40, Expr40 => ActionFn(8);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant14(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action8::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 16)
    }
    pub(crate) fn __reduce32<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr30 = Expr40 => ActionFn(9);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action9::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 16)
    }
    pub(crate) fn __reduce33<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr40 = Expr40, Op50, Expr50 => ActionFn(10);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant14(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action10::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 17)
    }
    pub(crate) fn __reduce34<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr40 = Expr50 => ActionFn(11);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action11::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 17)
    }
    pub(crate) fn __reduce35<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr50 = Expr50, "?", Expr60, ":", Expr60 => ActionFn(12);
        assert!(__symbols.len() >= 5);
        let __sym4 = __pop_Variant6(__symbols);
        let __sym3 = __pop_Variant0(__symbols);
        let __sym2 = __pop_Variant6(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym4.2.clone();
        let __nt = super::__action12::<>(__sym0, __sym1, __sym2, __sym3, __sym4);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (5, 18)
    }
    pub(crate) fn __reduce36<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr50 = Expr60 => ActionFn(13);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action13::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 18)
    }
    pub(crate) fn __reduce37<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr60 = Expr60, "|", Identifier, Args => ActionFn(85);
        assert!(__symbols.len() >= 4);
        let __sym3 = __pop_Variant9(__symbols);
        let __sym2 = __pop_Variant2(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym3.2.clone();
        let __nt = super::__action85::<>(__sym0, __sym1, __sym2, __sym3);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (4, 19)
    }
    pub(crate) fn __reduce38<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr60 = Expr60, "|", Identifier => ActionFn(86);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant2(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action86::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 19)
    }
    pub(crate) fn __reduce39<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr60 = Expr70 => ActionFn(15);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action15::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 19)
    }
    pub(crate) fn __reduce40<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr70 = Expr70, Index => ActionFn(16);
        assert!(__symbols.len() >= 2);
        let __sym1 = __pop_Variant6(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym1.2.clone();
        let __nt = super::__action16::<>(__sym0, __sym1);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (2, 20)
    }
    pub(crate) fn __reduce41<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr70 = Expr70, ".", Identifier => ActionFn(17);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant2(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action17::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 20)
    }
    pub(crate) fn __reduce42<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr70 = Expr80 => ActionFn(18);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action18::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 20)
    }
    pub(crate) fn __reduce43<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Number => ActionFn(19);
        let __sym0 = __pop_Variant3(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action19::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce44<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Boolean => ActionFn(20);
        let __sym0 = __pop_Variant1(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action20::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce45<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = String => ActionFn(21);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action21::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce46<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Array => ActionFn(22);
        let __sym0 = __pop_Variant9(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action22::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce47<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Object => ActionFn(23);
        let __sym0 = __pop_Variant11(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action23::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce48<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Null => ActionFn(24);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action24::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce49<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = Identifier => ActionFn(25);
        let __sym0 = __pop_Variant2(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action25::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 21)
    }
    pub(crate) fn __reduce50<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expr80 = "(", Expression, ")" => ActionFn(26);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant6(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action26::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 21)
    }
    pub(crate) fn __reduce51<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expression = Expr00 => ActionFn(1);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action1::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (1, 22)
    }
    pub(crate) fn __reduce52<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expression? = Expression => ActionFn(57);
        let __sym0 = __pop_Variant6(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action57::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant12(__nt), __end));
        (1, 23)
    }
    pub(crate) fn __reduce53<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Expression? =  => ActionFn(58);
        let __start = __lookahead_start.cloned().or_else(|| __symbols.last().map(|s| s.2.clone())).unwrap_or_default();
        let __end = __start.clone();
        let __nt = super::__action58::<>(&__start, &__end);
        __symbols.push((__start, __Symbol::Variant12(__nt), __end));
        (0, 23)
    }
    pub(crate) fn __reduce54<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Index = "[", ".", Identifier, Op20, Expr80, "]" => ActionFn(46);
        assert!(__symbols.len() >= 6);
        let __sym5 = __pop_Variant0(__symbols);
        let __sym4 = __pop_Variant6(__symbols);
        let __sym3 = __pop_Variant14(__symbols);
        let __sym2 = __pop_Variant2(__symbols);
        let __sym1 = __pop_Variant0(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym5.2.clone();
        let __nt = super::__action46::<>(__sym0, __sym1, __sym2, __sym3, __sym4, __sym5);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (6, 24)
    }
    pub(crate) fn __reduce55<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Index = "[", Expression, "]" => ActionFn(47);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant6(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action47::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant6(__nt), __end));
        (3, 24)
    }
    pub(crate) fn __reduce56<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Object = "{", Comma<(<ObjectIdentifier> ":" <Expression>)>, "}" => ActionFn(49);
        assert!(__symbols.len() >= 3);
        let __sym2 = __pop_Variant0(__symbols);
        let __sym1 = __pop_Variant11(__symbols);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym2.2.clone();
        let __nt = super::__action49::<>(__sym0, __sym1, __sym2);
        __symbols.push((__start, __Symbol::Variant11(__nt), __end));
        (3, 25)
    }
    pub(crate) fn __reduce57<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // ObjectIdentifier = String => ActionFn(50);
        let __sym0 = __pop_Variant13(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action50::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant13(__nt), __end));
        (1, 26)
    }
    pub(crate) fn __reduce58<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // ObjectIdentifier = Identifier => ActionFn(51);
        let __sym0 = __pop_Variant2(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action51::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant13(__nt), __end));
        (1, 26)
    }
    pub(crate) fn __reduce59<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op10 = "&&" => ActionFn(28);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action28::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 27)
    }
    pub(crate) fn __reduce60<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op10 = "||" => ActionFn(29);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action29::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 27)
    }
    pub(crate) fn __reduce61<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = "==" => ActionFn(30);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action30::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce62<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = "!=" => ActionFn(31);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action31::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce63<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = ">=" => ActionFn(32);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action32::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce64<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = "<=" => ActionFn(33);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action33::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce65<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = ">" => ActionFn(34);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action34::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce66<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = "<" => ActionFn(35);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action35::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce67<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op20 = "in" => ActionFn(36);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action36::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 28)
    }
    pub(crate) fn __reduce68<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op30 = "+" => ActionFn(37);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action37::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 29)
    }
    pub(crate) fn __reduce69<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op30 = "-" => ActionFn(38);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action38::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 29)
    }
    pub(crate) fn __reduce70<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op40 = "*" => ActionFn(39);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action39::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 30)
    }
    pub(crate) fn __reduce71<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op40 = "//" => ActionFn(40);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action40::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 30)
    }
    pub(crate) fn __reduce72<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op40 = "/" => ActionFn(41);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action41::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 30)
    }
    pub(crate) fn __reduce73<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op50 = "%" => ActionFn(42);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action42::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 31)
    }
    pub(crate) fn __reduce74<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // Op50 = "^" => ActionFn(43);
        let __sym0 = __pop_Variant0(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action43::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant14(__nt), __end));
        (1, 31)
    }
    pub(crate) fn __reduce75<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // String = DoubleQuotedString => ActionFn(44);
        let __sym0 = __pop_Variant2(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action44::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant13(__nt), __end));
        (1, 32)
    }
    pub(crate) fn __reduce76<
        'input,
    >(
        __lookahead_start: Option<&usize>,
        __symbols: &mut ::std::vec::Vec<(usize,__Symbol<'input>,usize)>,
        _: ::std::marker::PhantomData<(&'input ())>,
    ) -> (usize, usize)
    {
        // String = SingleQuotedString => ActionFn(45);
        let __sym0 = __pop_Variant2(__symbols);
        let __start = __sym0.0.clone();
        let __end = __sym0.2.clone();
        let __nt = super::__action45::<>(__sym0);
        __symbols.push((__start, __Symbol::Variant13(__nt), __end));
        (1, 32)
    }
}
pub use self::__parse__Expression::ExpressionParser;

fn __action0<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action1<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action2<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, operation, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::BinaryOperation { left, right, operation })
}

fn __action3<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action4<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, operation, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::BinaryOperation { left, right, operation })
}

fn __action5<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action6<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, operation, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::BinaryOperation { left, right, operation })
}

fn __action7<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action8<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, operation, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::BinaryOperation { left, right, operation })
}

fn __action9<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action10<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, operation, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::BinaryOperation { left, right, operation })
}

fn __action11<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action12<
    'input,
>(
    (_, left, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, truthy, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, falsy, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Conditional {left, truthy, falsy})
}

fn __action13<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action14<
    'input,
>(
    (_, subject, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, name, _): (usize, &'input str, usize),
    (_, args, _): (usize, ::std::option::Option<Vec<Box<Expression>>>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Transform{name: name.to_string(), subject, args})
}

fn __action15<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action16<
    'input,
>(
    (_, subject, _): (usize, Box<Expression>, usize),
    (_, index, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    Box::new(Expression::IndexOperation{subject, index})
}

fn __action17<
    'input,
>(
    (_, subject, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, ident, _): (usize, &'input str, usize),
) -> Box<Expression>
{
    Box::new(Expression::DotOperation{subject, ident: ident.to_string()})
}

fn __action18<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> Box<Expression>
{
    __0
}

fn __action19<
    'input,
>(
    (_, __0, _): (usize, f64, usize),
) -> Box<Expression>
{
    Box::new(Expression::Number(__0))
}

fn __action20<
    'input,
>(
    (_, __0, _): (usize, bool, usize),
) -> Box<Expression>
{
    Box::new(Expression::Boolean(__0))
}

fn __action21<
    'input,
>(
    (_, __0, _): (usize, String, usize),
) -> Box<Expression>
{
    Box::new(Expression::String(__0))
}

fn __action22<
    'input,
>(
    (_, __0, _): (usize, Vec<Box<Expression>>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Array(__0))
}

fn __action23<
    'input,
>(
    (_, __0, _): (usize, Vec<(String, Box<Expression>)>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Object(__0))
}

fn __action24<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Null)
}

fn __action25<
    'input,
>(
    (_, __0, _): (usize, &'input str, usize),
) -> Box<Expression>
{
    Box::new(Expression::Identifier(__0.to_string()))
}

fn __action26<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, __0, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Box<Expression>
{
    __0
}

fn __action27<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, __0, _): (usize, Vec<Box<Expression>>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Vec<Box<Expression>>
{
    __0
}

fn __action28<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::And
}

fn __action29<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Or
}

fn __action30<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Equal
}

fn __action31<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::NotEqual
}

fn __action32<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::GreaterEqual
}

fn __action33<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::LessEqual
}

fn __action34<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Greater
}

fn __action35<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Less
}

fn __action36<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::In
}

fn __action37<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Add
}

fn __action38<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Subtract
}

fn __action39<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Multiply
}

fn __action40<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::FloorDivide
}

fn __action41<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Divide
}

fn __action42<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Modulus
}

fn __action43<
    'input,
>(
    (_, __0, _): (usize, Token<'input>, usize),
) -> OpCode
{
    OpCode::Exponent
}

fn __action44<
    'input,
>(
    (_, s, _): (usize, &'input str, usize),
) -> String
{
    s.replace("\\\"", "\"")
}

fn __action45<
    'input,
>(
    (_, s, _): (usize, &'input str, usize),
) -> String
{
    s.replace("\\'", "'")
}

fn __action46<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, ident, _): (usize, &'input str, usize),
    (_, op, _): (usize, OpCode, usize),
    (_, right, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Box<Expression>
{
    Box::new(Expression::Filter {ident: ident.to_string(), op, right})
}

fn __action47<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, __0, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Box<Expression>
{
    __0
}

fn __action48<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, __0, _): (usize, Vec<Box<Expression>>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Vec<Box<Expression>>
{
    __0
}

fn __action49<
    'input,
>(
    (_, _, _): (usize, Token<'input>, usize),
    (_, __0, _): (usize, Vec<(String, Box<Expression>)>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Vec<(String, Box<Expression>)>
{
    __0
}

fn __action50<
    'input,
>(
    (_, __0, _): (usize, String, usize),
) -> String
{
    __0
}

fn __action51<
    'input,
>(
    (_, __0, _): (usize, &'input str, usize),
) -> String
{
    __0.to_string()
}

fn __action52<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
    (_, e, _): (usize, ::std::option::Option<(String, Box<Expression>)>, usize),
) -> Vec<(String, Box<Expression>)>
{
    match e {
        None => v,
        Some(e) => {
            let mut v = v;
            v.push(e);
            v
        }
    }
}

fn __action53<
    'input,
>(
    (_, __0, _): (usize, String, usize),
    (_, _, _): (usize, Token<'input>, usize),
    (_, __1, _): (usize, Box<Expression>, usize),
) -> (String, Box<Expression>)
{
    (__0, __1)
}

fn __action54<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<Box<Expression>>, usize),
    (_, e, _): (usize, ::std::option::Option<Box<Expression>>, usize),
) -> Vec<Box<Expression>>
{
    match e {
        None => v,
        Some(e) => {
            let mut v = v;
            v.push(e);
            v
        }
    }
}

fn __action55<
    'input,
>(
    (_, __0, _): (usize, Vec<Box<Expression>>, usize),
) -> ::std::option::Option<Vec<Box<Expression>>>
{
    Some(__0)
}

fn __action56<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> ::std::option::Option<Vec<Box<Expression>>>
{
    None
}

fn __action57<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> ::std::option::Option<Box<Expression>>
{
    Some(__0)
}

fn __action58<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> ::std::option::Option<Box<Expression>>
{
    None
}

fn __action59<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> ::std::vec::Vec<Box<Expression>>
{
    vec![]
}

fn __action60<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<Box<Expression>>, usize),
) -> ::std::vec::Vec<Box<Expression>>
{
    v
}

fn __action61<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> Box<Expression>
{
    __0
}

fn __action62<
    'input,
>(
    (_, __0, _): (usize, (String, Box<Expression>), usize),
) -> ::std::option::Option<(String, Box<Expression>)>
{
    Some(__0)
}

fn __action63<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> ::std::option::Option<(String, Box<Expression>)>
{
    None
}

fn __action64<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    vec![]
}

fn __action65<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    v
}

fn __action66<
    'input,
>(
    (_, __0, _): (usize, (String, Box<Expression>), usize),
    (_, _, _): (usize, Token<'input>, usize),
) -> (String, Box<Expression>)
{
    __0
}

fn __action67<
    'input,
>(
    (_, __0, _): (usize, (String, Box<Expression>), usize),
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    vec![__0]
}

fn __action68<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
    (_, e, _): (usize, (String, Box<Expression>), usize),
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    { let mut v = v; v.push(e); v }
}

fn __action69<
    'input,
>(
    (_, __0, _): (usize, Box<Expression>, usize),
) -> ::std::vec::Vec<Box<Expression>>
{
    vec![__0]
}

fn __action70<
    'input,
>(
    (_, v, _): (usize, ::std::vec::Vec<Box<Expression>>, usize),
    (_, e, _): (usize, Box<Expression>, usize),
) -> ::std::vec::Vec<Box<Expression>>
{
    { let mut v = v; v.push(e); v }
}

fn __action71<
    'input,
>(
    __0: (usize, String, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, Box<Expression>, usize),
    __3: (usize, Token<'input>, usize),
) -> (String, Box<Expression>)
{
    let __start0 = __0.0.clone();
    let __end0 = __2.2.clone();
    let __temp0 = __action53(
        __0,
        __1,
        __2,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action66(
        __temp0,
        __3,
    )
}

fn __action72<
    'input,
>(
    __0: (usize, String, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, Box<Expression>, usize),
) -> ::std::option::Option<(String, Box<Expression>)>
{
    let __start0 = __0.0.clone();
    let __end0 = __2.2.clone();
    let __temp0 = __action53(
        __0,
        __1,
        __2,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action62(
        __temp0,
    )
}

fn __action73<
    'input,
>(
    __0: (usize, String, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, Box<Expression>, usize),
    __3: (usize, Token<'input>, usize),
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    let __start0 = __0.0.clone();
    let __end0 = __3.2.clone();
    let __temp0 = __action71(
        __0,
        __1,
        __2,
        __3,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action67(
        __temp0,
    )
}

fn __action74<
    'input,
>(
    __0: (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
    __1: (usize, String, usize),
    __2: (usize, Token<'input>, usize),
    __3: (usize, Box<Expression>, usize),
    __4: (usize, Token<'input>, usize),
) -> ::std::vec::Vec<(String, Box<Expression>)>
{
    let __start0 = __1.0.clone();
    let __end0 = __4.2.clone();
    let __temp0 = __action71(
        __1,
        __2,
        __3,
        __4,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action68(
        __0,
        __temp0,
    )
}

fn __action75<
    'input,
>(
    __0: (usize, ::std::option::Option<(String, Box<Expression>)>, usize),
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __0.0.clone();
    let __end0 = __0.0.clone();
    let __temp0 = __action64(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action52(
        __temp0,
        __0,
    )
}

fn __action76<
    'input,
>(
    __0: (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
    __1: (usize, ::std::option::Option<(String, Box<Expression>)>, usize),
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __0.0.clone();
    let __end0 = __0.2.clone();
    let __temp0 = __action65(
        __0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action52(
        __temp0,
        __1,
    )
}

fn __action77<
    'input,
>(
    __0: (usize, Box<Expression>, usize),
    __1: (usize, Token<'input>, usize),
) -> ::std::vec::Vec<Box<Expression>>
{
    let __start0 = __0.0.clone();
    let __end0 = __1.2.clone();
    let __temp0 = __action61(
        __0,
        __1,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action69(
        __temp0,
    )
}

fn __action78<
    'input,
>(
    __0: (usize, ::std::vec::Vec<Box<Expression>>, usize),
    __1: (usize, Box<Expression>, usize),
    __2: (usize, Token<'input>, usize),
) -> ::std::vec::Vec<Box<Expression>>
{
    let __start0 = __1.0.clone();
    let __end0 = __2.2.clone();
    let __temp0 = __action61(
        __1,
        __2,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action70(
        __0,
        __temp0,
    )
}

fn __action79<
    'input,
>(
    __0: (usize, ::std::option::Option<Box<Expression>>, usize),
) -> Vec<Box<Expression>>
{
    let __start0 = __0.0.clone();
    let __end0 = __0.0.clone();
    let __temp0 = __action59(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action54(
        __temp0,
        __0,
    )
}

fn __action80<
    'input,
>(
    __0: (usize, ::std::vec::Vec<Box<Expression>>, usize),
    __1: (usize, ::std::option::Option<Box<Expression>>, usize),
) -> Vec<Box<Expression>>
{
    let __start0 = __0.0.clone();
    let __end0 = __0.2.clone();
    let __temp0 = __action60(
        __0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action54(
        __temp0,
        __1,
    )
}

fn __action81<
    'input,
>(
    __0: (usize, String, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, Box<Expression>, usize),
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __0.0.clone();
    let __end0 = __2.2.clone();
    let __temp0 = __action72(
        __0,
        __1,
        __2,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action75(
        __temp0,
    )
}

fn __action82<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __lookbehind.clone();
    let __end0 = __lookahead.clone();
    let __temp0 = __action63(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action75(
        __temp0,
    )
}

fn __action83<
    'input,
>(
    __0: (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
    __1: (usize, String, usize),
    __2: (usize, Token<'input>, usize),
    __3: (usize, Box<Expression>, usize),
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __1.0.clone();
    let __end0 = __3.2.clone();
    let __temp0 = __action72(
        __1,
        __2,
        __3,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action76(
        __0,
        __temp0,
    )
}

fn __action84<
    'input,
>(
    __0: (usize, ::std::vec::Vec<(String, Box<Expression>)>, usize),
) -> Vec<(String, Box<Expression>)>
{
    let __start0 = __0.2.clone();
    let __end0 = __0.2.clone();
    let __temp0 = __action63(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action76(
        __0,
        __temp0,
    )
}

fn __action85<
    'input,
>(
    __0: (usize, Box<Expression>, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, &'input str, usize),
    __3: (usize, Vec<Box<Expression>>, usize),
) -> Box<Expression>
{
    let __start0 = __3.0.clone();
    let __end0 = __3.2.clone();
    let __temp0 = __action55(
        __3,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action14(
        __0,
        __1,
        __2,
        __temp0,
    )
}

fn __action86<
    'input,
>(
    __0: (usize, Box<Expression>, usize),
    __1: (usize, Token<'input>, usize),
    __2: (usize, &'input str, usize),
) -> Box<Expression>
{
    let __start0 = __2.2.clone();
    let __end0 = __2.2.clone();
    let __temp0 = __action56(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action14(
        __0,
        __1,
        __2,
        __temp0,
    )
}

fn __action87<
    'input,
>(
    __0: (usize, Box<Expression>, usize),
) -> Vec<Box<Expression>>
{
    let __start0 = __0.0.clone();
    let __end0 = __0.2.clone();
    let __temp0 = __action57(
        __0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action79(
        __temp0,
    )
}

fn __action88<
    'input,
>(
    __lookbehind: &usize,
    __lookahead: &usize,
) -> Vec<Box<Expression>>
{
    let __start0 = __lookbehind.clone();
    let __end0 = __lookahead.clone();
    let __temp0 = __action58(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action79(
        __temp0,
    )
}

fn __action89<
    'input,
>(
    __0: (usize, ::std::vec::Vec<Box<Expression>>, usize),
    __1: (usize, Box<Expression>, usize),
) -> Vec<Box<Expression>>
{
    let __start0 = __1.0.clone();
    let __end0 = __1.2.clone();
    let __temp0 = __action57(
        __1,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action80(
        __0,
        __temp0,
    )
}

fn __action90<
    'input,
>(
    __0: (usize, ::std::vec::Vec<Box<Expression>>, usize),
) -> Vec<Box<Expression>>
{
    let __start0 = __0.2.clone();
    let __end0 = __0.2.clone();
    let __temp0 = __action58(
        &__start0,
        &__end0,
    );
    let __temp0 = (__start0, __temp0, __end0);
    __action80(
        __0,
        __temp0,
    )
}

pub trait __ToTriple<'input, > {
    fn to_triple(value: Self) -> Result<(usize,Token<'input>,usize), __lalrpop_util::ParseError<usize, Token<'input>, crate::lexer::LexError>>;
}

impl<'input, > __ToTriple<'input, > for (usize, Token<'input>, usize) {
    fn to_triple(value: Self) -> Result<(usize,Token<'input>,usize), __lalrpop_util::ParseError<usize, Token<'input>, crate::lexer::LexError>> {
        Ok(value)
    }
}
impl<'input, > __ToTriple<'input, > for Result<(usize, Token<'input>, usize), crate::lexer::LexError> {
    fn to_triple(value: Self) -> Result<(usize,Token<'input>,usize), __lalrpop_util::ParseError<usize, Token<'input>, crate::lexer::LexError>> {
        match value {
            Ok(v) => Ok(v),
            Err(error) => Err(__lalrpop_util::ParseError::User { error }),
        }
    }
}
