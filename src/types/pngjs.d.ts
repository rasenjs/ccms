declare module 'pngjs' {
  // Minimal typing for our usage
  export class PNG {
    constructor(options?: { width: number; height: number });
    width: number;
    height: number;
    data: Buffer;

    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
