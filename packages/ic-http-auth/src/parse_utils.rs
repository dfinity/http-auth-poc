use nom::{
    bytes::complete::{tag, take_until, take_while},
    character::complete::char,
    combinator::cut,
    error::{context, ContextError, ParseError},
    sequence::{preceded, terminated},
    IResult, Parser,
};

pub(crate) fn whitespace<'a, E>(i: &'a str) -> IResult<&'a str, &'a str, E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    let chars = " \t\r\n";

    context("whitespace", take_while(move |c| chars.contains(c))).parse(i)
}

pub(crate) fn trim_whitespace<'a, O, E>(
    parser: impl Parser<&'a str, Output = O, Error = E>,
) -> impl Parser<&'a str, Output = O, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    context("trim_whitespace", preceded(whitespace, parser))
}

pub(crate) fn trimmed_char<'a, E>(v: char) -> impl Parser<&'a str, Output = char, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    context("trimmed_char", trim_whitespace(char(v)))
}

pub(crate) fn drop_separators<'a, O, E>(
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

pub(crate) fn until_terminated<'a, E>(
    v: &'a str,
) -> impl Parser<&'a str, Output = &'a str, Error = E>
where
    E: ParseError<&'a str> + ContextError<&'a str>,
{
    terminated(take_until(v), tag(v))
}
