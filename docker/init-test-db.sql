-- Runs once, when the database volume is first created.
-- `pnpm test:db` uses this database so tests never touch real runs.
CREATE DATABASE windtunnel_test OWNER windtunnel;
