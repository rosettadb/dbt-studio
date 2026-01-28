export default class ElectronStore {
  store: Record<string, any> = {};

  get(key: string, defaultValue?: any) {
    return this.store[key] ?? defaultValue;
  }

  set(key: string | object, value?: any) {
    if (typeof key === 'object') {
      this.store = { ...this.store, ...key };
    } else {
      this.store[key] = value;
    }
  }

  delete(key: string) {
    delete this.store[key];
  }

  has(key: string) {
    return key in this.store;
  }

  clear() {
    this.store = {};
  }
}
