export default class Config {

  constructor() {
    this.EXTERNAL_ADDRESS = process.env.EXTERNAL_ADDRESS || null;
    this.INTERNAL_ADDRESS = process.env.INTERNAL_ADDRESS || null;
    this.PORT = Number(process.env.PORT) || 8272;
    this.HTTP_URL_PREFIX = process.env.HTTP_URL_PREFIX || '/';
    this.WS_URL_PREFIX = process.env.WS_URL_PREFIX || '/';

    this.NOCOMPRESS = process.env.NOCOMPRESS;
  }

}
