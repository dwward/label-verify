"use client";

import { useState, useRef } from "react";
import { compressImage } from "@/lib/image-compression";

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
}

export default function ImageUpload({ onImageSelect }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      alert("Please upload a JPEG, PNG, or WebP image");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Compress image in background
    setIsCompressing(true);
    try {
      const compressedFile = await compressImage(file);
      onImageSelect(compressedFile);
    } catch (error) {
      console.error("Compression error:", error);
      onImageSelect(file); // Use original if compression fails
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Label Image</h2>

      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-4 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors min-h-[300px] flex flex-col items-center justify-center
          ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileInput}
          className="hidden"
        />

        {preview ? (
          <div className="space-y-3">
            <img
              src={preview}
              alt="Label preview"
              className="max-h-64 max-w-full rounded-lg shadow-md mx-auto"
            />
            {isCompressing && (
              <div className="text-sm text-gray-600">Compressing image...</div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Change image
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-6xl text-gray-400">📷</div>
            <div className="text-lg font-medium">
              Drag and drop label image here
            </div>
            <div className="text-base text-gray-600">or click to browse</div>
            <div className="text-sm text-gray-500">
              Accepts JPEG, PNG, or WebP
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
