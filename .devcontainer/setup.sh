#!/bin/bash
sed -r "s/http:\/\/localhost:([0-9]+)/https:\/\/${CODESPACE_NAME}-\\1.app.github.dev/;s/VirtualTabletop.io/Codespaces VTT/;s/(allowPublicLibraryEdits.: )false/\\1true/" config.template.json > config.json
npm install
gh codespace ports visibility 8272:public -c $CODESPACE_NAME