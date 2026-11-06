-- PostgreSQL POSIX whitespace classes depend on collation and omit characters
-- handled by JavaScript String.trim(), including U+FEFF. Keep the database's
-- required-field validation at least as strict as the browser, even for REST
-- requests made without the UI. Explicit ECMAScript WhiteSpace + LineTerminator
-- characters make the rule independent of the database locale.
create or replace function private.clean_text(p_text text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(p_text,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
$$;
