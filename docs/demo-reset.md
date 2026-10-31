# Demo reset

Puts the live project back to a clean demo state. Run it before a demo or a new
pilot class, the same way as the reset of 2026-10-30.

**What stays:** every organizer account (`can_create_classes`, or `role = 'organizer'`
in any class), their classes, class projects, announcements and milestones.

**What goes:** every other account, with everything that cascades from it: profiles,
memberships, team membership, task progress, check-ins, nudges, documents, push
subscriptions, presence and Google links. Each account's `auth.flow_state` rows are
deleted too, since that table has no foreign key (see 0017). Teams left with no
members are deleted with their projects.

This is a deliberate, hard-to-undo step on real data, so:

1. Take a backup first (Dashboard → Database → Backups), or be sure nothing in the
   project needs keeping.
2. Run the script as it is. It ends in `ROLLBACK`, so it only **shows** the counts.
3. If the counts look right, change the last line to `commit;` and run it again.
4. After a real reset, delete any earlier research exports (0020's rule: old and new
   exports must never be compared).

The script prints only counts, never ids, names or emails.

```sql
begin;

create temp table keep_users on commit drop as
select p.id from public.profiles p where p.can_create_classes
union
select cm.user_id from public.class_memberships cm where cm.role = 'organizer';

select
  (select count(*) from auth.users)                                         as users_before,
  (select count(*) from keep_users)                                         as organizers_kept,
  (select count(*) from auth.users where id not in (select id from keep_users)) as accounts_to_delete;

delete from auth.flow_state
where user_id is not null and user_id not in (select id from keep_users);

delete from auth.users
where id not in (select id from keep_users);

-- Teams nobody is in any more (their projects, tasks and polls cascade).
delete from public.pairings p
where not exists (select 1 from public.pairing_members pm where pm.pairing_id = p.id);

select
  (select count(*) from auth.users)         as users_after,
  (select count(*) from public.pairings)    as teams_after,
  (select count(*) from public.projects)    as projects_after,
  (select count(*) from public.nudges)      as nudges_after;

rollback;  -- change to commit; once the counts look right
```
