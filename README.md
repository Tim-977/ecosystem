# Ecosystem Project

This repository contains a Django-based web application along with a C++ socket server.

- `run.sh` builds and launches the C++ server and Django development server.
- `setup_postgres.sh` prepares a local PostgreSQL instance so you can migrate away from the default SQLite database.

The project defaults to SQLite. Run `setup_postgres.sh` when you are ready to configure PostgreSQL, but keep `db.sqlite3` until the migration is complete.
