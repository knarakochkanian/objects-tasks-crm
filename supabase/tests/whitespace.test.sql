begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select is(private.clean_text(U&'\FEFF'), null::text,
  'A BOM-only field is blank, matching browser trim validation');
select is(private.clean_text(U&'\00A0'), null::text,
  'A non-breaking-space-only field is blank');
select is(private.clean_text(U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), null::text,
  'All ECMAScript whitespace and line terminators are blank');
select is(private.clean_text(U&'\FEFF\00A0Исправить\0020\0020монтаж\00A0\FEFF'), 'Исправить  монтаж',
  'Unicode boundary whitespace is removed without changing the comment content');

select * from finish();
rollback;
