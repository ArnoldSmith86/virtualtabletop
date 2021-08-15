[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/ArnoldSmith86/virtualtabletop)

# virtualtabletop

This project aims to create a virtual tabletop in the browser where you can (re)create all board, dice and card games and play them without registration over the internet.

You can host your own instance or go to [VirtualTabletop.io](https://virtualtabletop.io).

This project is inspired by [playingcards.io](https://playingcards.io).

This project aims to be able to import PCIO files and have them be immediately playable.

Come join our [Discord server](https://discord.gg/xWxz9Gd) if you want to discuss the project.

This project started after [a reddit post](https://www.reddit.com/r/PlayingCardsIO/comments/jiajth/mildly_ot_feature_requests_for_a_pcio_clone/) in our [playingcardsio subreddit](https://www.reddit.com/r/PlayingCardsIO/).

## License

The project is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

The cards in [assets/cards-default](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/cards-default) were [created by Adrian Kennard](https://www.me.uk/cards/) and released under CC0 Public Domain license.

The cards in [assets/cards-plastic](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/cards-plastic) have their own [license.txt file](https://github.com/ArnoldSmith86/virtualtabletop/blob/main/assets/cards-plastic/license.txt).

The icons in [assets/icons-white](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/icons-white) were found at [Font Awesome](https://fontawesome.com/) with license [CC BY 4.0](https://fontawesome.com/license/free).

The games in the public library have their license information and attributions inside their `attribution` metadata field. You can read by adding the game to your game library and clicking `Edit`.

## Download this repository and get all dependencies

### Linux

This assumes a Debian based Linux. Find Node.js repositories for other Linux distributions at https://node.dev/node-binary. Consult your distribution's documentation for how to install the git and nodejs packages if your distribution does not use apt.

```
curl -sL https://deb.nodesource.com/setup_15.x | sudo -E bash -                         # adds a repository for Node.js v15
sudo apt install -y git nodejs                                                          # installs the required software
git clone --recurse-submodules https://github.com/ArnoldSmith86/virtualtabletop.git     # downloads everything in this repository
cd virtualtabletop                                                                      # changes to the newly created directory
npm install                                                                             # uses the Node.js package manager to install all dependencies
```

### MacOS
Using [brew](https://brew.sh/):

    brew install node
    git clone --recurse-submodules https://github.com/ArnoldSmith86/virtualtabletop.git
    cd virtualtabletop
    npm install

### Windows

1. Install [Git](https://git-scm.com/download/win) and [Node.js](https://nodejs.org/en/download/current/).
2. Open the command prompt and [cd](https://www.digitalcitizen.life/command-prompt-how-use-basic-commands/) to a directory where you want the project to live.
3. Do `git clone --recurse-submodules https://github.com/ArnoldSmith86/virtualtabletop.git` which downloads the project.
4. Do `cd virtualtabletop` to get into the project directory git created.
5. Do `npm install` so Node.js downloads all the dependencies of the project.

If you use "GitHub Desktop" you should follow these steps:

1. Install [GitHub Desktop](https://desktop.github.com/) and [Node.js](https://nodejs.org/en/download/current/).
2. Follow steps to setup the programs. Then open GitHub Desktop.
3. Go to Current repository -> Add -> Clone a repository and select this one or your fork.
4. Go to Repository -> Open in Command Prompt.
5. Do `npm install` so Node.js downloads all the dependencies of the project.

## Set environment variables for special cases

Most users can skip this section.

| variable name| default value | example value | notes |
| ------- | ------------------ | ----- | --- |
| `EXTERNAL_ADDRESS` | (not set) | `https://protectedGameServer.com` | Set it if your external server address cannot be accessed from the inside (e.g. it uses an external authentication, or other special network setup). When set, internally, links to your own server will be translated to `INTERNAL_ADDRESS` below. |
| `INTERNAL_ADDRESS` | (not set) | `http://localhost:8272` | This is the address for the server to access its own resources from the inside. See `EXTERNAL_ADDRESS`. |
| `PORT` | `8272` | `8272` | The network port this app serves from |
| `HTTP_URL_PREFIX` | (not set) | `/games/virtualTabletop` | This allows you to serve the HTTP contents from, say, `https://protectedGameServer.com/games/virtualTabletop`. If not set, contents are served from `https://protectedGameServer.com`. |
| `WS_URL_PREFIX` | (not set) | `/games/virtualTabletopWebSocket` | Similar to `HTTP_URL_PREFIX` but for WebSocket. Usually it's the same as `HTTP_URL_PREFIX` but if you have a different proxy setting, set it properly. |
| `NOCOMPRESS` | `1` | (not set) | If set, the js files will not be minified, for easier debugging. |

For Linux and MacOS, use the format `export NOCOMPRESS=1` to set environment variables.

For Windows, use the format `SET NOCOMPRESS=1` to set environment variables.

## Starting the server

Now you can start the server by typing:

```
npm start
```

If that doesn't work, try:

```
node server.mjs
```

This will serve the project at [localhost:8272](http://localhost:8272).

If you close you terminal and wants to restart you server you will need to get back to you clone folder using cd

## Debug

To debug client-side code, first start the server so that it doesn't compress the code:

    npm run debug

On windows, enter `SET NOCOMPRESS=1` in a terminal prior to starting the server with `npm start`.

In your browser, refresh to have it re-download the client code.
Press F12 to show the developer tools.

In Chromium, select the Sources tab, then the select the file for the room.
Press Ctrl-f to search for the code you want to set a breakpoint for an step through.

## Testing

To run the unit tests (and get a coverage report):

    npm test

To run them continuously (on each save) while you develop:

    npm run test-cont
