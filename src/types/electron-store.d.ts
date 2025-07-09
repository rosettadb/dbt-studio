declare module 'electron-store' {
  interface Store<T = any> {
    get<K extends keyof T>(key: K): T[K];
    set<K extends keyof T>(key: K, value: T[K]): void;
    delete<K extends keyof T>(key: K): void;
    has<K extends keyof T>(key: K): boolean;
    clear(): void;
  }

  interface StoreConstructorOptions<T> {
    defaults?: T;
    name?: string;
  }

  class Store<T = any> {
    constructor(options?: StoreConstructorOptions<T>);

    get<K extends keyof T>(key: K): T[K];

    set<K extends keyof T>(key: K, value: T[K]): void;

    delete<K extends keyof T>(key: K): void;

    has<K extends keyof T>(key: K): boolean;

    clear(): void;
  }

  export = Store;
}
