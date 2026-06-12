"use client";

import { useState, useRef } from "react";

interface ImageUploadProps {
  onImageSelect: (files: File[]) => void;
}

export default function ImageUpload({ onImageSelect }: ImageUploadProps) {
  const [previews, setPreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    // Validate count (max 4)
    if (files.length > 4) {
      alert("Maximum 4 images allowed");
      return;
    }

    // Validate types for all files
    const invalidFiles = files.filter(f => !f.type.match(/^image\/(jpeg|png|webp)$/));
    if (invalidFiles.length > 0) {
      alert("Please upload only JPEG, PNG, or WebP images");
      return;
    }

    // Generate previews for all files
    const newPreviews = await Promise.all(
      files.map(async (file) => {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return { file, preview };
      })
    );

    setPreviews(newPreviews);
    onImageSelect(files); // Pass raw files to parent
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
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
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      handleFiles(files);
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
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        {previews.length > 0 ? (
          <div className="space-y-3 w-full">
            {/* Thumbnail Grid */}
            <div className="grid grid-cols-2 gap-3">
              {previews.map((item, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={item.preview}
                    alt={`Label ${idx + 1}`}
                    className="w-full h-40 object-cover rounded-lg border-2 border-gray-200"
                  />
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newPreviews = previews.filter((_, i) => i !== idx);
                      setPreviews(newPreviews);
                      onImageSelect(newPreviews.map(p => p.file));
                      // Clear input if all removed
                      if (newPreviews.length === 0 && fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6
                               flex items-center justify-center opacity-0 group-hover:opacity-100
                               transition-opacity text-xs font-bold hover:bg-red-700"
                  >
                    ✕
                  </button>
                  {/* Panel label */}
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white
                                  text-xs px-2 py-1 rounded">
                    {idx === 0 ? "Front" : idx === 1 ? "Back" : idx === 2 ? "Neck" : "Side"}
                  </div>
                </div>
              ))}
            </div>

            {/* Add More Button (if < 4 images) */}
            {previews.length < 4 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="w-full py-2 border-2 border-dashed border-blue-400 rounded-lg
                           text-blue-600 hover:bg-blue-50 text-sm font-medium"
              >
                + Add more images ({previews.length}/4)
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-6xl text-gray-400">📷</div>
            <div className="text-lg font-medium">
              Drag and drop label images here
            </div>
            <div className="text-base text-gray-600">or click to browse</div>
            <div className="text-sm text-gray-500">
              Accepts JPEG, PNG, or WebP (up to 4 images)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
