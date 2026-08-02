-- Create every user's profile on the server the moment they sign up.
--
-- Until now the browser did this: it looked for its own profile, and inserted
-- one when it was missing. That put a unique-constraint conflict directly in
-- the boot path -- an e-mail still held by an older, orphaned profile made the
-- insert fail, the client had no handling for it, and the app hung on the
-- loading screen forever. Doing it here means the row always exists before the
-- client ever looks, so that path is never taken again.

create or replace function public.fc_create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  base_name text;
  uname text;
  suffix int := 0;
  mail text;
begin
  if exists (select 1 from public.profiles where uid = new.id) then
    return new;
  end if;

  -- Usernames are a-z, 0-9 and underscore only, and must be unique.
  uname := regexp_replace(lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), '')), '[^a-z0-9_]', '', 'g');
  if length(uname) < 3 then
    uname := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base_name := uname;
  while exists (select 1 from public.profiles where username = uname) and suffix < 50 loop
    suffix := suffix + 1;
    uname := base_name || '_' || suffix::text;
  end loop;

  -- The e-mail column is unique and may still be held by a profile whose auth
  -- user was deleted. Auth owns the real address; this copy is a convenience,
  -- so it is dropped rather than allowed to block the signup.
  mail := new.email;
  if mail is not null and exists (select 1 from public.profiles where email = mail) then
    mail := null;
  end if;

  insert into public.profiles (uid, username, name, email, bio, emoji, color, status, verified, is_bot)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), uname),
    mail,
    '',
    '🎀',
    '#ff7ab8',
    '',
    false,
    false
  )
  on conflict (uid) do nothing;

  return new;
exception
  when others then
    -- Profile bookkeeping must never stop someone from registering.
    return new;
end;
$fn$;

drop trigger if exists fc_create_profile_on_signup on auth.users;
create trigger fc_create_profile_on_signup
  after insert on auth.users
  for each row execute function public.fc_create_profile_for_new_user();
