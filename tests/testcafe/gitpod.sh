#!/bin/bash
if ! which google-chrome >/dev/null 2>&1; then
  wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt install -y ./google-chrome-stable_current_amd64.deb
fi
npm run testcafe-headless -- "$@"
