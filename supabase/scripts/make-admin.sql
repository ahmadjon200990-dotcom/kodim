-- Seed admin: avval Dashboard → Authentication → Users → "Add user" (email + parol, "Auto confirm"),
-- so'ng shu skriptdagi email'ni almashtirib bajaring (MCP execute_sql yoki SQL Editor).
update public.teachers set role = 'ADMIN', disabled = false where email = lower('admin@kodim.uz') returning id, email, role;
