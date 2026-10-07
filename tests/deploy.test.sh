#!/usr/bin/env bash
# Exercise the real deployment script with a local Docker stub and disposable SQLite data.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
temporary=$(mktemp -d /tmp/inav-deploy-test-XXXXXXXX)
cleanup() {
  resolved=$(cd "$temporary" && pwd -P)
  [[ "$resolved" == "$temporary" && "$resolved" == /tmp/inav-deploy-test-* ]] || return 1
  rm -rf -- "$resolved"
}
trap cleanup EXIT
mkdir "$temporary/bin"
cat > "$temporary/bin/sitecustomize.py" <<'PY'
# The deployment target is Linux; the Windows rehearsal has no POSIX ownership.
import os
if not hasattr(os, 'chown'):
    os.chown = lambda *args: None
PY
cat > "$temporary/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> docker-calls.log
if [[ "$1" == build ]]; then exit 0; fi
if [[ "$1" == inspect ]]; then
  image=$(cat .running-image)
  if [[ "${DEPLOY_TEST_FAILURE:-}" == health && "$image" == "inavx:$DEPLOY_TEST_NEW" ]]; then
    echo "$image unhealthy"
  else echo "$image healthy"; fi
  exit 0
fi
[[ "$1" == compose ]] || exit 2
case "$2" in
  config) exit 0 ;;
  images) echo previous-image ;;
  stop) exit 0 ;;
  ps) echo test-container ;;
  up) sed -n 's/^[[:space:]]*image: //p' compose.yaml > .running-image ;;
  run)
    if [[ "$*" == *' app backup' ]]; then
      suffix=zip
      if [[ "$DEPLOY_TEST_FAILURE" == success-native ]]; then suffix=sqlite; fi
      cp data/inav.sqlite "backups/inav-test.$suffix"
      echo "inav-test.$suffix"
    elif [[ "$*" == *' app verify-backup '* ]]; then
      test -f backups/inav-test.zip
    elif [[ "$*" == *' app migrate' ]]; then
      python3 - <<'PY'
import os,sqlite3
c=sqlite3.connect('data/inav.sqlite')
c.execute("alter table items add column color text not null default ''")
if os.environ.get('DEPLOY_TEST_FAILURE')=='migration': c.execute("update items set value='bad migration'")
c.commit();c.close()
PY
      if [[ "${DEPLOY_TEST_FAILURE:-}" == migration ]]; then exit 1; fi
    else exit 2; fi
    ;;
  *) exit 2 ;;
esac
STUB
chmod +x "$temporary/bin/docker"
old=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
new=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
for scenario in success-native success-full migration health; do
  directory="$temporary/$scenario"
  mkdir -p "$directory/data/media" "$directory/backups" "$directory/releases/$new"
  touch "$directory/releases/$new/Dockerfile"
  cat > "$directory/compose.yaml" <<COMPOSE
services:
  app:
    image: inavx:$old
    build:
      context: ./releases/$old
    env_file: .env
COMPOSE
  printf 'not-expanded\n' > "$directory/.env"
  printf 'image bytes\n' > "$directory/data/media/test.svg"
  python3 - "$directory" <<'PY'
import sqlite3,sys
from pathlib import Path
path=Path(sys.argv[1]); c=sqlite3.connect(path/'data/inav.sqlite')
c.execute('create table items(value text not null)');c.execute("insert into items values('original')");c.commit();c.close()
PY
  result=0
  PATH="$temporary/bin:$PATH" PYTHONPATH="$temporary/bin" DEPLOY_TEST_FAILURE="$scenario" DEPLOY_TEST_NEW="$new" bash "$repo/scripts/deploy-remote.sh" "$directory" "$new" > "$directory/result.log" 2>&1 || result=$?
  if [[ "$scenario" == success-* ]]; then test "$result" = 0; else test "$result" != 0; fi
  python3 - "$directory" "$scenario" "$old" "$new" <<'PY'
import sqlite3,sys,json
from pathlib import Path
path=Path(sys.argv[1]); success=sys.argv[2].startswith('success-')
if not (path/'.running-image').exists(): print((path/'result.log').read_text())
c=sqlite3.connect(path/'data/inav.sqlite')
assert c.execute('select value from items').fetchall()==[('original',)]
assert len(c.execute('pragma table_info(items)').fetchall())==(2 if success else 1)
assert (path/'.running-image').read_text().strip()=='inavx:'+sys.argv[4 if success else 3]
assert (path/'data/media/test.svg').read_text()=='image bytes\n'
assert 'env_file: .env' in (path/'compose.yaml').read_text()
assert 'not-expanded' not in (path/'compose.yaml').read_text()
rollbacks=list(path.glob('rollback-*'));assert len(rollbacks)==1
assert (rollbacks[0]/'data/inav.sqlite').is_file()
if success: assert json.loads((path/'deployment.json').read_text())['commit']==sys.argv[4]
print('Deployment rehearsal passed:',sys.argv[2])
PY
done
