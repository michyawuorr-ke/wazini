/**
 * Minimal in-memory mock of @react-native-async-storage/async-storage's
 * API surface — just enough for queue.ts's usage (getItem, setItem,
 * removeItem, clear). Written by hand rather than using the package's
 * own official Jest mock because that mock ships as an ES module not
 * covered by this project's CommonJS-targeting ts-jest transform
 * (node_modules is correctly excluded from transformation by default,
 * and adding a transformIgnorePatterns override just for this one
 * mock isn't worth the complexity versus this ~20-line file).
 */

let store: Record<string, string> = {};

const AsyncStorageMock = {
  async getItem(key: string): Promise<string | null> {
    return key in store ? store[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store[key] = value;
  },
  async removeItem(key: string): Promise<void> {
    delete store[key];
  },
  async clear(): Promise<void> {
    store = {};
  },
};

export default AsyncStorageMock;
