use nom::{
    bytes::complete::{tag, take_until, take_while},
    character::complete::char,
    combinator::{cut, eof},
    error::{context, ContextError, ParseError},
    multi::many0,
    sequence::{preceded, terminated},
    IResult, Parser,
};

use crate::{HttpAuthError, HttpAuthResult};

pub(crate) fn parse_http_sig(header_field: &str) -> HttpAuthResult<(&str, &str)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str)> {
        let (i, sig_name) = until_terminated("=").parse(i)?;
        let (i, sig) = drop_separators(':', ':', take_until(":")).parse(i)?;

        eof(i)?;

        Ok((i, (sig_name, sig)))
    }

    extract(header_field)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSig(e.to_string()))
}

pub(crate) fn parse_http_sig_input(
    http_sig_input: &str,
) -> HttpAuthResult<(&str, &str, Vec<&str>)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str, Vec<&str>)> {
        let (sig_params, sig_name) = until_terminated("=").parse(i)?;
        let (i, parsed_sig_params) =
            drop_separators('(', ')', many0(drop_separators('"', '"', take_until("\""))))
                .parse(sig_params)?;

        // [TODO] - continue parsing the signature inputs: keyid, alg, created, expires, nonce, etc.
        // eof(i)?;

        Ok((i, (sig_name, sig_params, parsed_sig_params)))
    }

    extract(http_sig_input)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSigInput(e.to_string()))
}

pub(crate) fn parse_http_sig_key(http_sig_key: &str) -> HttpAuthResult<(&str, &str)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str)> {
        let (i, sig_name) = until_terminated("=").parse(i)?;
        let (i, sig) = drop_separators(':', ':', take_until(":")).parse(i)?;

        eof(i)?;

        Ok((i, (sig_name, sig)))
    }

    extract(http_sig_key)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSigKey(e.to_string()))
}

fn whitespace<'a, E>(i: &'a str) -> IResult<&'a str, &'a str, E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    let chars = " \t\r\n";

    context("whitespace", take_while(move |c| chars.contains(c))).parse(i)
}

fn trim_whitespace<'a, O, E>(
    parser: impl Parser<&'a str, Output = O, Error = E>,
) -> impl Parser<&'a str, Output = O, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    context("trim_whitespace", preceded(whitespace, parser))
}

fn trimmed_char<'a, E>(v: char) -> impl Parser<&'a str, Output = char, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    context("trimmed_char", trim_whitespace(char(v)))
}

fn drop_separators<'a, O, E>(
    opening_separator: char,
    closing_separator: char,
    parser: impl Parser<&'a str, Output = O, Error = E>,
) -> impl Parser<&'a str, Output = O, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    context(
        "drop_separators",
        preceded(
            trimmed_char(opening_separator),
            cut(terminated(parser, trimmed_char(closing_separator))),
        ),
    )
}

fn until_terminated<'a, E>(v: &'a str) -> impl Parser<&'a str, Output = &'a str, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    terminated(take_until(v), tag(v))
}
