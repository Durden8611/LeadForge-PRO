-- LeadForge PRO: promote a user to admin
-- Use one of the updates below.

-- Option 1: promote by user id
update public.profiles
set is_admin = true
where id = 'USER_UUID_HERE';

-- Option 2: promote by email
update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('you@example.com');

select p.id, u.email, p.is_admin
from public.profiles p
join auth.users u on u.id = p.id
where p.is_admin = true
order by u.email asc;