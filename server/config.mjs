export default class Config {

  constructor() {
    this.SERVER_DOMAIN = process.env.SERVER_DOMAIN || null;
    this.PORT = Number(process.env.PORT) || 8272;
    this.HTTP_URL_PREFIX = process.env.HTTP_URL_PREFIX || '/';
    this.WS_URL_PREFIX = process.env.WS_URL_PREFIX || '/';

    this.NOCOMPRESS = process.env.NOCOMPRESS;
  }

}
