# virtualtabletop

This project aims to create a virtual tabletop in the browser where you can (re)create all board, dice and card games and play them without registration over the internet.

## Links

I'm currently hosting an [online instance](http://212.47.248.129) but it's far from anything playable.

This project is inspired by [playingcards.io](https://playingcards.io).

Come join our [Discord server](https://discord.gg/xWxz9Gd) if you want to discuss the project.

This project started after [a reddit post](https://www.reddit.com/r/PlayingCardsIO/comments/jiajth/mildly_ot_feature_requests_for_a_pcio_clone/) in our [playingcardsio subreddit](https://www.reddit.com/r/PlayingCardsIO/).

## Download this repository and get all dependencies

This assumes a Debian based Linux. If you use something else, you probably know what you need to change.
```
curl -sL https://deb.nodesource.com/setup_15.x | sudo -E bash -    # adds a repository for Node.js v15
sudo apt install -y git nodejs                                     # installs the required software
git clone https://github.com/ArnoldSmith86/virtualtabletop.git     # downloads everything in this repository
cd virtualtabletop                                                 # changes to the newly created directory
npm install                                                        # uses the Node.js package manager to install all dependencies
```

## Starting the server
Now you can start the server by typing:

```
npm start
```

If that doesn't work, try:

```
node server.mjs
```

This will serve the project at [localhost:8272](http://localhost:8272)
