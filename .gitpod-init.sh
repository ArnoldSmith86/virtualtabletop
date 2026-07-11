#!/bin/bash
nvm install 18
nvm use 18
npm install

sed -r "s#http://localhost:([0-9]+)#$(gp url 8272)#;s/VirtualTabletop.io/Gitpod VTT/;s/(allowPublicLibraryEdits.: )false/\\1true/" config.template.json > config.json