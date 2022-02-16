#!/bin/bash
if ! which firefox >/dev/null 2>&1; then
  sudo apt update
  sudo apt install -y firefox
fi
npm run testcafe-firefox-headless -- "$@"
