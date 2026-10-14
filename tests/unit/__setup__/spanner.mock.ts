export const mockSpannerInstances: any[] = [];

export class Spanner {
  options: any;

  constructor(options: any) {
    this.options = options;
    mockSpannerInstances.push(this);
  }

  instance() {
    return { database: () => this };
  }

  close() {
    return Promise.resolve(this.options);
  }
}
