#!/usr/bin/env bash
set -Eeuo pipefail
directory="${1:-}"
revision="${2:-}"
[[ "$directory" =~ ^/[a-zA-Z0-9/_-]+$ && "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 2
cd "$directory"
umask 077
test -f compose.yaml
test -d data
test -d backups
test -f "releases/$revision/Dockerfile"
docker compose config --quiet </dev/null
current=$(docker compose images -q app </dev/null)
test -n "$current"
docker build --build-arg "BUILD_COMMIT=$revision" -t "inavx:$revision" "releases/$revision" </dev/null
rollback="rollback-${revision:0:7}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$rollback"
cp compose.yaml "$rollback/compose.yaml"
switched=0
recover() {
  trap - ERR HUP INT TERM
  echo "Deployment failed; recovering from $rollback" >&2
  if [[ "$switched" == 1 ]]; then
    docker compose stop app </dev/null || true
    cp -a data "$rollback/failed-data" || echo 'Could not preserve the failed release data; continuing recovery from the stopped backup.' >&2
    python3 - "$rollback" <<'PY'
from pathlib import Path
import os,sys,shutil
base=Path.cwd().resolve(); rollback=(base/sys.argv[1]).resolve()
assert rollback.parent==base and rollback.name.startswith('rollback-')
for suffix in ('','-wal','-shm'):
    src=rollback/'data'/('inav.sqlite'+suffix); dst=base/'data'/('inav.sqlite'+suffix)
    assert dst.resolve().parent==base/'data'
    if dst.exists(): dst.unlink()
    if src.exists():
        shutil.copy2(src,dst)
        stat=src.stat(); os.chown(dst,stat.st_uid,stat.st_gid)
# Migrations do not modify media; retain current files and the stopped copy.
PY
  fi
  cp "$rollback/compose.yaml" compose.yaml
  docker compose up -d --no-build --wait --wait-timeout 120 app </dev/null
  exit 1
}
trap recover ERR HUP INT TERM
docker compose stop app </dev/null
docker compose run --rm -T app backup </dev/null | tee "$rollback/backup-name.txt"
cp -a data "$rollback/data"
python3 - "$revision" <<'PY'
import re,sys
from pathlib import Path
path=Path('compose.yaml'); original=path.read_text()
updated,n=re.subn(r'(?m)^(\s*image:\s*)inavx:[a-zA-Z0-9._-]+\s*$',lambda m:m[1]+'inavx:'+sys.argv[1],original)
assert n==1,'Expected one inavx image in compose.yaml'
updated,n=re.subn(r'(?m)^(\s*context:\s*)(?:\./)?releases/[0-9a-f]{40}\s*$',lambda m:m[1]+'./releases/'+sys.argv[1],updated)
assert n==1,'Expected one release build context in compose.yaml'
# Never expand env_file contents into a generated Compose file.
path.write_text(updated)
PY
switched=1
backup=$(tail -n 1 "$rollback/backup-name.txt")
if [[ "$backup" == *.zip ]]; then
  docker compose run --rm -T app verify-backup "/app/backups/$backup" </dev/null
fi
docker compose run --rm -T app migrate </dev/null
python3 - "$rollback" <<'PY'
import sqlite3,sys,hashlib
from pathlib import Path
root=Path(sys.argv[1]); before=sqlite3.connect('file:'+str(root/'data/inav.sqlite')+'?mode=ro',uri=True)
after=sqlite3.connect('file:data/inav.sqlite?mode=ro',uri=True)
quote=lambda value:'"'+value.replace('"','""')+'"'
for name, in before.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name<>'__drizzle_migrations'"):
    columns=[row[1] for row in before.execute('pragma table_info('+quote(name)+')')]
    query='select '+','.join(map(quote,columns))+' from '+quote(name)
    assert sorted(before.execute(query).fetchall(),key=repr)==sorted(after.execute(query).fetchall(),key=repr),name+' changed during migration'
assert after.execute('pragma integrity_check').fetchall()==[('ok',)]
assert after.execute('pragma foreign_key_check').fetchall()==[]
def media(path):return {str(p.relative_to(path)):hashlib.sha256(p.read_bytes()).hexdigest() for p in path.rglob('*') if p.is_file()}
assert media(root/'data/media')==media(Path('data/media'))
print('Existing records, database integrity and media verified')
PY
docker compose up -d --no-build --wait --wait-timeout 120 app </dev/null
container=$(docker compose ps -q app </dev/null)
test "$(docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' "$container")" = "inavx:$revision healthy"
python3 - "$revision" "$rollback" <<'PY'
import json,sys,datetime
from pathlib import Path
Path('deployment.json').write_text(json.dumps({'commit':sys.argv[1],'rollback':sys.argv[2],'deployedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
PY
trap - ERR HUP INT TERM
echo "Deployed $revision. Rollback configuration and stopped data: $directory/$rollback"
