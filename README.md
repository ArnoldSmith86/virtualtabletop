[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/ArnoldSmith86/virtualtabletop)

# virtualtabletop.io

VTT is an open-source, free to use platform for creating and playing games. This project aims to create a virtual tabletop in the browser where you can (re)create all board, dice and card games and play them without registration over the internet.

## Playing games

We have hundreds of games in our public library that are ready to play right now.  That includes classic games like Chinese checkers, backgammon, mancala, Nine Men’s Morris, Reversi, tangrams, and hangman.  It includes modern games that are similar to many popular card and board games available around the world today.  Most of the games are in English, but quite a few are “universal” and require no ability to read or understand English.  And a handful are offered in German and Portuguese and a few more in Spanish and French. See [Games](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Games) for more detail.

## Creating games

New games may be created in VTT using a combination of drag-and-drop and writing JSON text. Capabilities added in JSON include iterating, conditional evaluations, calculations, and other things you might expect to find in a programming system. (See [Functions](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Functions) for more detail.) The game designer can include player seats, action buttons, sound, scoreboards, and drawing canvases, in addition to many other tools. (See [Widgets](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Widgets) for more detail.)

To understand how to use VTT for playing or creating games, you should start by reading [Playing Games](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Playing-Games). This will give you an overview of how VTT works as a game-playing platform, including information about loading and storing games. If playing games is the only way in which you want to utilize VTT, this should be all you need to read. But in any case we recommend joining our [Discord server](https://discord.gg/CEZz7wny9T). There you will be able to ask questions about how VTT works.

If you want to modify an existing game, or do game development, after reading about Playing Games, you should next read [Creating Games](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Creating-Games). This section will give you an overview of how to create a game, and will point you to the other sections in this Wiki that provide more detailed information. In particular, you will want to use the pages in section 2, Developer Documentation, as a reference, and we encourage you to at least read the introductory section to each of those pages.

## Contributing

If you want to contribute to VTT development, please read [Helping Out](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Helping-out).

Finally, we appreciate donations that go towards paying for the domain name, the servers, and additional software supporting game development.  You can donate at https://www.patreon.com/virtualtabletop/about.

Enjoy! And don't be shy about asking questions in [Discord](https://discord.gg/CEZz7wny9T); you will find a helpful and responsive audience.

## Playing offline on Android

You can use an Android phone as the server and play with any devices offline by using its wifi hotspot:

- Install and open https://termux.dev/ on your Android device.
- Run `curl -L is.gd/vttandroid | sh`.

## Hosting own server

You can host your own instance or go to [VirtualTabletop.io](https://virtualtabletop.io).

This project is inspired by [playingcards.io](https://playingcards.io).

This project aims to be able to import PCIO files and have them be immediately playable.

Come join our [Discord server](https://discord.gg/CEZz7wny9T) if you want to discuss the project.

This project started after [a reddit post](https://www.reddit.com/r/PlayingCardsIO/comments/jiajth/mildly_ot_feature_requests_for_a_pcio_clone/) in our [playingcardsio subreddit](https://www.reddit.com/r/PlayingCardsIO/).

### Download this repository and get all dependencies

Follow the steps in [Download Repository](https://github.com/ArnoldSmith86/virtualtabletop/wiki/Download-Repository).

### Starting the server

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

### Debug

To debug client-side code, first start the server so that it doesn't compress the code:

    npm run debug

On windows, enter `SET NOCOMPRESS=1` in a terminal prior to starting the server with `npm start`.

In your browser, refresh to have it re-download the client code.
Press F12 to show the developer tools.

In Chromium, select the Sources tab, then the select the file for the room.
Press Ctrl-f to search for the code you want to set a breakpoint for an step through.

### Testing

To run the unit tests (and get a coverage report):

    npm test

To run them continuously (on each save) while you develop:

    npm run test-cont

## License

The project is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

The cards in [assets/cards-default](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/cards-default) were [created by Adrian Kennard](https://www.me.uk/cards/) and released under CC0 Public Domain license.

The cards in [assets/cards-plastic](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/cards-plastic) have their own [license.txt file](https://github.com/ArnoldSmith86/virtualtabletop/blob/main/assets/cards-plastic/license.txt).

The icons in [assets/icons-white](https://github.com/ArnoldSmith86/virtualtabletop/tree/main/assets/icons-white) were found at [Font Awesome](https://fontawesome.com/) with license [CC BY 4.0](https://fontawesome.com/license/free).

The games in the public library have their license information and attributions inside their `attribution` metadata field. You can read by adding the game to your game library and clicking `Edit`.
