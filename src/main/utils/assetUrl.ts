export class AssetUrl {
  url: URL;

  constructor(url: string) {
    this.url = new URL(url);
  }

  get isNodeModule() {
    return this.url.pathname.includes('/node_modules/');
  }

  get relativeUrl() {
    return this.url.pathname.replace(/^.*\/node_modules\//, '');
  }
}
