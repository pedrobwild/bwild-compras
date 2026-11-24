create or replace function public.enforce_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(lower(split_part(new.email, '@', 2)), '') not in ('bwild.com.br', 'bewild.com.br') then
    raise exception 'Cadastro permitido apenas para e-mails @bwild.com.br ou @bewild.com.br';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signup_domain on auth.users;
create trigger enforce_signup_domain
before insert on auth.users
for each row execute function public.enforce_signup_domain();