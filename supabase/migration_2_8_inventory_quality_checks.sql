create table if not exists inventory_quality_checks (
  id text primary key,
  branch_id text not null references branches(id),
  inventory_item_id text not null,
  inventory_item_name jsonb not null,
  result text not null check (result in ('good', 'needs_attention')),
  note text,
  checked_by_id text not null,
  checked_by_name text not null,
  checked_at timestamptz not null default now()
);

create index if not exists inventory_quality_checks_branch_checked_at_idx
  on inventory_quality_checks(branch_id, checked_at desc);

alter table inventory_quality_checks enable row level security;

drop policy if exists "anon read inventory quality checks" on inventory_quality_checks;
drop policy if exists "anon insert inventory quality checks" on inventory_quality_checks;
create policy "anon read inventory quality checks"
  on inventory_quality_checks for select using (true);
create policy "anon insert inventory quality checks"
  on inventory_quality_checks for insert with check (true);

grant select, insert on inventory_quality_checks to anon, authenticated;
