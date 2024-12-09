This is the official Docker image for https://virtualtabletop.io/.

Source code: https://github.com/ArnoldSmith86/virtualtabletop

Like the production site, the docker image is automatically updated for every commit on the `main` branch.



# Examples

Run a local-only server on http://localhost:8272 with all default config:

`docker run -p 8272:8272 arnoldsmith86/virtualtabletop`

Run virtualtabletop on port 80 on your own server, keeping the saved rooms in `/srv/vtt`:

`docker run -e EXTERNALURL=http://mydomain.com -v /srv/vtt:/app/save -p 80:8272 arnoldsmith86/virtualtabletop`

Run virtualtabletop on port 8272 but set the external URL to `https://mydomain.com/vtt` because you use nginx to reverse proxy requests to it:

`docker run -e EXTERNALURL=https://mydomain.com/vtt -e URLPREFIX=/vtt -p 8272:8272 arnoldsmith86/virtualtabletop`



# Nginx reverse proxy example

A nice way to run the server is to use nginx to reverse proxy requests to it. Here's an example configuration that sets up SSL and proxies to the docker container. A few `proxy_*` directives are set to prevent issues with the websocket connection.

This example assumes you have a certificate for `virtualtabletop.io` from letsencrypt. Google `certbot nginx` for more information.

This setup makes it easy to host different apps using subdomains or paths. Google `nginx reverse proxy` for more information.

```
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
  worker_connections 768;
  # multi_accept on;
}

http {
  server_tokens off;

  add_header X-Frame-Options SAMEORIGIN;
  add_header X-Content-Type-Options nosniff;
  add_header X-XSS-Protection "1; mode=block";

  server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name virtualtabletop.io;
    return 301 https://virtualtabletop.io$request_uri;
  }

  server {
    server_name virtualtabletop.io;

    listen 127.0.0.1:443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/virtualtabletop.io/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/virtualtabletop.io/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    client_max_body_size 200M;
    add_header Strict-Transport-Security "max-age=31536000; includeSubdomains; preload";

    location / {
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header Host $host;

      proxy_pass http://127.0.0.1:8272;

      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_connect_timeout 1d;
      proxy_send_timeout 1d;
      proxy_read_timeout 1d;
    }
  }
}
```

# Custom public library

When hosting a public server, you may want to use a custom public library. The games are in the `library/games` directory and are basically extracted vtt files (which in turn are just zip files with a different extension). If you want to manage your own library, you can start a server like this:

`docker run -e ALLOWPUBLICLIBRARYEDITS=1 -v /srv/vtt-games:/app/library/games -p 8272:8272 arnoldsmith86/virtualtabletop`

`ALLOWPUBLICLIBRARYEDITS=1` enables you to edit the library from within the app itself. Note though that this allows _anyone_ to edit the library, so you might want to restart the server without this option enabled when you're happy with your library. An option would be to use a local server to manage the library and copy over the games directory to your public server.



# Environment variables

## Useful

`EXTERNALURL` - The external URL of the server. **Important.** Defaults to `http://localhost:8272`.

`URLPREFIX` - The prefix of the URL. Defaults to an empty string. **Important if `EXTERNALURL` contains a path.**

`SERVERNAME` - The display name of the server. Only used in the tab bar, I think. Defaults to `VirtualTabletop.io`.

`ADMINURL` - The URL of the admin page that shows active rooms and their players. For example `/gs7a0jds`. Defaults to `null`.

`ALLOWPUBLICLIBRARYEDITS` - Whether to allow public library edits through the app in every room. Defaults to `false`.

`MINIFYJAVASCRIPT` - Whether to minify the javascript. Defaults to `false`.

## Less useful

`PORT` - The port to run the server on. Defaults to 8272. Not really needed when using Docker's `-p` option.

`FORCETRACING` - Whether to force tracing for every room. Defaults to `false`.

`SIMULATESERVERLAG` - The number of milliseconds to wait before responding to requests. Meant for debugging conflicts between clients. Defaults to `0`.

`CUSTOMTAB` - The name used in the tab bar. Defaults to the `SERVERNAME`.



# Troubleshooting

If you can access your own server but all images and the menu are broken, you are accessing the server with a different URL than the one you set in `EXTERNALURL`.