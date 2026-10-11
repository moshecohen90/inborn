/* llama.rn's OpenCL backend covers Adreno for Q4_0 / Q6_K only; the F16 mmproj segfaults there, and the simulator's Metal traps. */
export const projectorOnGpu = (os: string, isDevice: boolean): boolean => os === "ios" && isDevice;
