export class AssetUrl {
  url: URL;

  constructor(url: string) {
    this.url = new URL(url);
  }

  get relativeUrl() {
    return this.url.pathname.replace(/^.*\/node_modules\//, '');
  }
}
