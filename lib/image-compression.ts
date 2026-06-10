import imageCompression from "browser-image-compression";
import { IMAGE_MAX_DIMENSION, IMAGE_QUALITY, IMAGE_MAX_SIZE_MB } from "./config";

export async function compressImage(file: File): Promise<File> {
  try {
    const options = {
      maxSizeMB: IMAGE_MAX_SIZE_MB,
      maxWidthOrHeight: IMAGE_MAX_DIMENSION,
      useWebWorker: true,
      initialQuality: IMAGE_QUALITY,
    };

    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error("Error compressing image:", error);
    // If compression fails, return original file
    // (will be caught by size validation in API route)
    return file;
  }
}
