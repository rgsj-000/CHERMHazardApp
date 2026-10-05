#!/usr/bin/env sh
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  echo "CHERM Hazard Simulator: http://localhost:8000"
  python3 -m http.server 8000
else
  echo "Python 3 is required by start.sh. Windows users can use start.bat without Python."
  exit 1
fi
