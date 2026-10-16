#!/bin/zsh
cd -- "${0:A:h}"
if command -v python3 >/dev/null 2>&1; then
  python3 serve.py
else
  echo "Python 3 was not found. Open index.html directly in Chrome, Edge or Firefox, or install Python 3 from python.org."
  read -r "reply?Press Enter to close. "
fi
