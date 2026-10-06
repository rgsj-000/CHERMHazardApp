#!/usr/bin/env sh

finish_with_error() {
  printf '\nCHERM could not start. The error is shown above.\n' >&2
  if [ -t 0 ]; then
    printf 'Press Enter to close... ' >&2
    read -r launcher_reply || :
  fi
  exit "$1"
}

# Resolve files from the launcher, even when invoked from another directory.
CDPATH= cd -P "$(dirname "$0")" || finish_with_error 1
project_dir=$(pwd -P)
python_command=
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 7))' >/dev/null 2>&1; then
    python_command=$candidate
    break
  fi
done

if [ -z "$python_command" ]; then
  printf 'Python 3.7 or newer is required by start.sh. Install Python 3, then run ./start.sh again.\n' >&2
  printf 'Windows users can use start.bat without Python.\n' >&2
  finish_with_error 1
fi

printf 'Starting CHERM Hazard Simulator...\nKeep this window open while using the app.\n'
"$python_command" "$project_dir/tools/serve.py" "$@" &
server_pid=$!
stop_server() {
  trap - INT TERM
  kill "$server_pid" 2>/dev/null || :
  wait "$server_pid" 2>/dev/null || :
  printf '\nCHERM server stopped.\n'
  exit 0
}
trap stop_server INT TERM
wait "$server_pid"
launcher_status=$?
trap - INT TERM
if [ "$launcher_status" -ne 0 ]; then
  finish_with_error "$launcher_status"
fi
