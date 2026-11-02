{
  "VERSION": "0.1.0",
  "site": { "title": "Bunminer", "hostname": "dbxadm2.dpro.io" },
  "servers": [
    { "id": "maria", "label": "MariaDB/MySQL", "engine": "maria", "host": "127.0.0.1", "port": 3306, "user": "root" },
    { "id": "pgsql", "label": "PostgreSQL", "engine": "pgsql", "host": "127.0.0.1", "port": 5432, "user": "postgres" },
    { "id": "sqlite", "label": "SQLite", "engine": "sqlite" }
  ],
  "sess": { "idleSec": 900, "absoluteSec": 28800, "permanentSec": 604800, "cookie": "dbxadm2_sid" },
  "sqlite": { "defaultReadonly": false },
  "import": { "maxBytes": 268435456, "timeoutSec": 600 },
  "SHOW_FULL_ERRORS": false
}
