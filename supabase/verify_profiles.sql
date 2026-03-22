-- LeadForge PRO: verify auth users and profiles are aligned

with counts as (
  select
    (select count(*) from auth.users) as auth_user_count,
    (select count(*) from public.profiles) as profile_count,
    (
      select count(*)
      from auth.users u
      left join public.profiles p on p.id = u.id
      where p.id is null
    ) as missing_profile_count,
    (
      select count(*)
      from public.profiles p
      left join auth.users u on u.id = p.id
      where u.id is null
    ) as orphan_profile_count
)
select 'auth_user_count' as check_name, auth_user_count::text as check_value
from counts

union all

select 'profile_count' as check_name, profile_count::text as check_value
from counts

union all

select 'missing_profile_count' as check_name, missing_profile_count::text as check_value
from counts

union all

select 'orphan_profile_count' as check_name, orphan_profile_count::text as check_value
from counts

union all

select
  'verification_status' as check_name,
  case
    when missing_profile_count = 0 and orphan_profile_count = 0 then 'OK'
    else 'REPAIR_NEEDED'
  end as check_value
from counts;

select
  u.id,
  u.email,
  u.created_at,
  coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) as is_admin,
  to_jsonb(p) as profile_row
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

select
  u.id,
  u.email,
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;

select
  p.id,
  coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) as is_admin,
  to_jsonb(p) as profile_row
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by p.id asc;