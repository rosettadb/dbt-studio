declare module 'file-icons-js' {
  export function getClass(extension: string): string;
  export function getClassWithColor(extension: string): string;
  export const db: Record<string, string>;
}
