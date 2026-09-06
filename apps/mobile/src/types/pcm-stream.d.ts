/* The package ships its typings under the upstream name (react-native-live-audio-stream); same API. */
declare module "@fugood/react-native-audio-pcm-stream" {
  export interface PcmStreamOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    wavFile: string;
    bufferSize?: number;
  }
  const AudioRecord: {
    init: (options: PcmStreamOptions) => void;
    start: () => void;
    stop: () => Promise<string>;
    on: (event: "data", callback: (data: string) => void) => void;
  };
  export default AudioRecord;
}
