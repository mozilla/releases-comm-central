/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::fmt;

pub type Spanned<Token, Location, Error> = Result<(Location, Token, Location), Error>;

#[derive(Debug, Clone, PartialEq)]
pub enum Token<'input> {
    // Literals
    Number(f64),
    DoubleQuotedString(&'input str),
    SingleQuotedString(&'input str),
    Boolean(bool),
    Null,
    Identifier(&'input str),

    // Operators
    Plus,
    Minus,
    Multiply,
    Divide,
    FloorDivide,
    Modulus,
    Exponent,

    // Comparison
    Equal,
    NotEqual,
    Greater,
    GreaterEqual,
    Less,
    LessEqual,
    In,

    // Logical
    And,
    Or,

    // Punctuation
    LeftParen,
    RightParen,
    LeftBracket,
    RightBracket,
    LeftBrace,
    RightBrace,
    Comma,
    Dot,
    Colon,
    Question,
    Pipe,

    // Whitespace (usually ignored)
    Whitespace,
    // End of input is handled automatically by lalrpop
}

impl<'input> fmt::Display for Token<'input> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Token::Number(n) => write!(f, "{}", n),
            Token::DoubleQuotedString(s) => write!(f, "\"{}\"", s),
            Token::SingleQuotedString(s) => write!(f, "'{}'", s),
            Token::Boolean(b) => write!(f, "{}", b),
            Token::Null => write!(f, "null"),
            Token::Identifier(s) => write!(f, "{}", s),
            Token::Plus => write!(f, "+"),
            Token::Minus => write!(f, "-"),
            Token::Multiply => write!(f, "*"),
            Token::Divide => write!(f, "/"),
            Token::FloorDivide => write!(f, "//"),
            Token::Modulus => write!(f, "%"),
            Token::Exponent => write!(f, "^"),
            Token::Equal => write!(f, "=="),
            Token::NotEqual => write!(f, "!="),
            Token::Greater => write!(f, ">"),
            Token::GreaterEqual => write!(f, ">="),
            Token::Less => write!(f, "<"),
            Token::LessEqual => write!(f, "<="),
            Token::In => write!(f, "in"),
            Token::And => write!(f, "&&"),
            Token::Or => write!(f, "||"),
            Token::LeftParen => write!(f, "("),
            Token::RightParen => write!(f, ")"),
            Token::LeftBracket => write!(f, "["),
            Token::RightBracket => write!(f, "]"),
            Token::LeftBrace => write!(f, "{{"),
            Token::RightBrace => write!(f, "}}"),
            Token::Comma => write!(f, ","),
            Token::Dot => write!(f, "."),
            Token::Colon => write!(f, ":"),
            Token::Question => write!(f, "?"),
            Token::Pipe => write!(f, "|"),
            Token::Whitespace => write!(f, " "),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Lexer<'input> {
    input: &'input str,
    position: usize,
    line: usize,
    column: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LexError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

impl fmt::Display for LexError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "Lexical error at line {}, column {}: {}",
            self.line, self.column, self.message
        )
    }
}

impl std::error::Error for LexError {}

impl<'input> Lexer<'input> {
    pub fn new(input: &'input str) -> Self {
        Lexer {
            input,
            position: 0,
            line: 1,
            column: 1,
        }
    }
}

impl<'input> Iterator for Lexer<'input> {
    type Item = Spanned<Token<'input>, usize, LexError>;

    fn next(&mut self) -> Option<Self::Item> {
        // Skip whitespace first
        self.skip_whitespace();

        // Check if we've reached the end after skipping whitespace
        if self.is_at_end() {
            return None;
        }

        let start_pos = self.position;
        match self.next_token_after_whitespace() {
            Ok(token) => Some(Ok((start_pos, token, self.position))),
            Err(error) => Some(Err(error)),
        }
    }
}

impl<'input> Lexer<'input> {
    fn next_token_after_whitespace(&mut self) -> Result<Token<'input>, LexError> {
        // Whitespace has already been skipped by the caller
        let ch = self.current_char();

        match ch {
            // Single-character tokens
            '+' => {
                self.advance();
                Ok(Token::Plus)
            }
            '-' => {
                self.advance();
                Ok(Token::Minus)
            }
            '*' => {
                self.advance();
                Ok(Token::Multiply)
            }
            '%' => {
                self.advance();
                Ok(Token::Modulus)
            }
            '^' => {
                self.advance();
                Ok(Token::Exponent)
            }
            '(' => {
                self.advance();
                Ok(Token::LeftParen)
            }
            ')' => {
                self.advance();
                Ok(Token::RightParen)
            }
            '[' => {
                self.advance();
                Ok(Token::LeftBracket)
            }
            ']' => {
                self.advance();
                Ok(Token::RightBracket)
            }
            '{' => {
                self.advance();
                Ok(Token::LeftBrace)
            }
            '}' => {
                self.advance();
                Ok(Token::RightBrace)
            }
            ',' => {
                self.advance();
                Ok(Token::Comma)
            }
            ':' => {
                self.advance();
                Ok(Token::Colon)
            }
            '?' => {
                self.advance();
                Ok(Token::Question)
            }
            '|' => {
                self.advance();
                if self.current_char() == '|' {
                    self.advance();
                    Ok(Token::Or)
                } else {
                    Ok(Token::Pipe)
                }
            }

            // Multi-character tokens
            '/' => {
                self.advance();
                if self.current_char() == '/' {
                    self.advance();
                    Ok(Token::FloorDivide)
                } else {
                    Ok(Token::Divide)
                }
            }

            '=' => {
                self.advance();
                if self.current_char() == '=' {
                    self.advance();
                    Ok(Token::Equal)
                } else {
                    Err(LexError {
                        message: "Unexpected character '='. Did you mean '=='?".to_string(),
                        line: self.line,
                        column: self.column,
                    })
                }
            }

            '!' => {
                self.advance();
                if self.current_char() == '=' {
                    self.advance();
                    Ok(Token::NotEqual)
                } else {
                    Err(LexError {
                        message: "Unexpected character '!'. Did you mean '!='?".to_string(),
                        line: self.line,
                        column: self.column,
                    })
                }
            }

            '>' => {
                self.advance();
                if self.current_char() == '=' {
                    self.advance();
                    Ok(Token::GreaterEqual)
                } else {
                    Ok(Token::Greater)
                }
            }

            '<' => {
                self.advance();
                if self.current_char() == '=' {
                    self.advance();
                    Ok(Token::LessEqual)
                } else {
                    Ok(Token::Less)
                }
            }

            '&' => {
                self.advance();
                if self.current_char() == '&' {
                    self.advance();
                    Ok(Token::And)
                } else {
                    Err(LexError {
                        message: "Unexpected character '&'. Did you mean '&&'?".to_string(),
                        line: self.line,
                        column: self.column,
                    })
                }
            }

            // String literals
            '"' => self.scan_double_quoted_string(),
            '\'' => self.scan_single_quoted_string(),

            // Numbers
            c if c.is_ascii_digit() => self.scan_number(),

            // Handle numbers starting with a dot (like .89)
            '.' => {
                if self.position + 1 < self.input.len() {
                    let next_char = self.input.chars().nth(self.position + 1).unwrap_or('\0');
                    if next_char.is_ascii_digit() {
                        self.scan_number()
                    } else {
                        self.advance();
                        Ok(Token::Dot)
                    }
                } else {
                    self.advance();
                    Ok(Token::Dot)
                }
            }

            // Identifiers and keywords
            c if c.is_alphabetic() || c == '_' => self.scan_identifier(),

            _ => Err(LexError {
                message: format!("Unexpected character '{}'", ch),
                line: self.line,
                column: self.column,
            }),
        }
    }

    fn scan_double_quoted_string(&mut self) -> Result<Token<'input>, LexError> {
        self.advance(); // consume opening quote
        let start_pos = self.position;

        // Match pattern: ([^"\\]*(\\")?)*
        while !self.is_at_end() {
            let ch = self.current_char();

            if ch == '"' {
                // End of string
                let end_pos = self.position;
                self.advance(); // consume closing quote
                let string_slice = &self.input[start_pos..end_pos];
                return Ok(Token::DoubleQuotedString(string_slice));
            } else if ch == '\\' {
                // Must be followed by "
                self.advance(); // consume backslash
                if !self.is_at_end() && self.current_char() == '"' {
                    self.advance(); // consume escaped quote
                } else {
                    return Err(LexError {
                        message: "Invalid escape sequence in double-quoted string".to_string(),
                        line: self.line,
                        column: self.column,
                    });
                }
            } else {
                self.advance();
            }
        }

        Err(LexError {
            message: "Unterminated string literal".to_string(),
            line: self.line,
            column: self.column,
        })
    }

    fn scan_single_quoted_string(&mut self) -> Result<Token<'input>, LexError> {
        self.advance(); // consume opening quote
        let start_pos = self.position;

        // Match pattern: ([^'\\]*(\\')?)*
        while !self.is_at_end() {
            let ch = self.current_char();

            if ch == '\'' {
                // End of string
                let end_pos = self.position;
                self.advance(); // consume closing quote
                let string_slice = &self.input[start_pos..end_pos];
                return Ok(Token::SingleQuotedString(string_slice));
            } else if ch == '\\' {
                // Must be followed by '
                self.advance(); // consume backslash
                if !self.is_at_end() && self.current_char() == '\'' {
                    self.advance(); // consume escaped quote
                } else {
                    return Err(LexError {
                        message: "Invalid escape sequence in single-quoted string".to_string(),
                        line: self.line,
                        column: self.column,
                    });
                }
            } else {
                self.advance();
            }
        }

        Err(LexError {
            message: "Unterminated string literal".to_string(),
            line: self.line,
            column: self.column,
        })
    }

    fn scan_number(&mut self) -> Result<Token<'input>, LexError> {
        let start_pos = self.position;

        // Handle numbers starting with a dot
        if self.current_char() == '.' {
            self.advance();
        }

        // Scan digits (either integer part or fractional part)
        while !self.is_at_end() && self.current_char().is_ascii_digit() {
            self.advance();
        }

        // Check for decimal point (only if we didn't start with one)
        if !&self.input[start_pos..self.position].starts_with('.')
            && !self.is_at_end()
            && self.current_char() == '.'
        {
            // Look ahead to see if there's a digit after the dot
            if self.position + 1 < self.input.len() {
                let next_char = self.input.chars().nth(self.position + 1).unwrap_or('\0');
                if next_char.is_ascii_digit() {
                    self.advance(); // consume dot

                    // Scan fractional part
                    while !self.is_at_end() && self.current_char().is_ascii_digit() {
                        self.advance();
                    }
                }
            }
        }

        let number_str = &self.input[start_pos..self.position];
        match number_str.parse::<f64>() {
            Ok(num) => Ok(Token::Number(num)),
            Err(_) => Err(LexError {
                message: format!("Invalid number format: {}", number_str),
                line: self.line,
                column: self.column,
            }),
        }
    }

    fn scan_identifier(&mut self) -> Result<Token<'input>, LexError> {
        let start_pos = self.position;

        while !self.is_at_end() {
            let ch = self.current_char();
            if ch.is_alphanumeric() || ch == '_' {
                self.advance();
            } else {
                break;
            }
        }

        let identifier = &self.input[start_pos..self.position];

        // Check for keywords
        let token = match identifier {
            "true" => Token::Boolean(true),
            "false" => Token::Boolean(false),
            "null" => Token::Null,
            "in" => Token::In,
            _ => Token::Identifier(identifier),
        };

        Ok(token)
    }

    fn skip_whitespace(&mut self) {
        while !self.is_at_end() && self.current_char().is_whitespace() {
            if self.current_char() == '\n' {
                self.line += 1;
                self.column = 1;
            } else {
                self.column += 1;
            }
            self.advance();
        }
    }

    fn current_char(&self) -> char {
        self.input.chars().nth(self.position).unwrap_or('\0')
    }

    fn advance(&mut self) {
        if !self.is_at_end() {
            self.position += 1;
            self.column += 1;
        }
    }

    fn is_at_end(&self) -> bool {
        self.position >= self.input.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokens() {
        let lexer = Lexer::new("+ - * / % ^");
        let tokens: Result<Vec<_>, _> = lexer.collect();
        let tokens = tokens.unwrap();

        let expected_tokens = vec![
            Token::Plus,
            Token::Minus,
            Token::Multiply,
            Token::Divide,
            Token::Modulus,
            Token::Exponent,
        ];

        let actual_tokens: Vec<Token> = tokens.into_iter().map(|(_, token, _)| token).collect();
        assert_eq!(actual_tokens, expected_tokens);
    }

    #[test]
    fn test_numbers() {
        let lexer = Lexer::new("123 45.67 .89");
        let tokens: Result<Vec<_>, _> = lexer.collect();
        let tokens = tokens.unwrap();

        let expected_tokens = vec![
            Token::Number(123.0),
            Token::Number(45.67),
            Token::Number(0.89),
        ];

        let actual_tokens: Vec<Token> = tokens.into_iter().map(|(_, token, _)| token).collect();
        assert_eq!(actual_tokens, expected_tokens);
    }

    #[test]
    fn test_strings() {
        let lexer = Lexer::new(r#""hello" 'world'"#);
        let tokens: Result<Vec<_>, _> = lexer.collect();
        let tokens = tokens.unwrap();

        let expected_tokens = vec![
            Token::DoubleQuotedString("hello"),
            Token::SingleQuotedString("world"),
        ];

        let actual_tokens: Vec<Token> = tokens.into_iter().map(|(_, token, _)| token).collect();
        assert_eq!(actual_tokens, expected_tokens);
    }

    #[test]
    fn test_identifiers_and_keywords() {
        let lexer = Lexer::new("foo true false null in");
        let tokens: Result<Vec<_>, _> = lexer.collect();
        let tokens = tokens.unwrap();

        let expected_tokens = vec![
            Token::Identifier("foo"),
            Token::Boolean(true),
            Token::Boolean(false),
            Token::Null,
            Token::In,
        ];

        let actual_tokens: Vec<Token> = tokens.into_iter().map(|(_, token, _)| token).collect();
        assert_eq!(actual_tokens, expected_tokens);
    }

    #[test]
    fn test_complex_expression() {
        let lexer = Lexer::new("foo.bar[0] == 'test' && (x > 1)");
        let tokens: Result<Vec<_>, _> = lexer.collect();
        let tokens = tokens.unwrap();

        let expected_tokens = vec![
            Token::Identifier("foo"),
            Token::Dot,
            Token::Identifier("bar"),
            Token::LeftBracket,
            Token::Number(0.0),
            Token::RightBracket,
            Token::Equal,
            Token::SingleQuotedString("test"),
            Token::And,
            Token::LeftParen,
            Token::Identifier("x"),
            Token::Greater,
            Token::Number(1.0),
            Token::RightParen,
        ];

        let actual_tokens: Vec<Token> = tokens.into_iter().map(|(_, token, _)| token).collect();
        assert_eq!(actual_tokens, expected_tokens);
    }
}
