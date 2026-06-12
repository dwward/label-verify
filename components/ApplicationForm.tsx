"use client";

import { useState, useEffect, useRef } from "react";
import type { ApplicationData, LoadResult } from "@/lib/types";
import {
  applicationDataToCAP,
  parseApplicationJSON,
  downloadApplicationJSON,
  capToApplicationData,
} from "@/lib/cap-utils";
import { loadCAPPackages, detectDuplicates } from "@/lib/cap-loader";

interface ApplicationFormProps {
  onDataChange: (data: ApplicationData) => void;
  onPackagesLoaded?: (result: LoadResult) => void;
  initialData?: ApplicationData;
}

const SAMPLE_DATA: ApplicationData = {
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
};

interface TestBenchSample {
  id: string;
  name: string;
  description: string;
  applicationData: ApplicationData;
  images: Array<{ url: string; panel: string }>;
}

export default function ApplicationForm({
  onDataChange,
  onPackagesLoaded,
  initialData,
}: ApplicationFormProps) {
  const [data, setData] = useState<ApplicationData>(
    initialData || {
      brandName: "",
      classType: "",
      alcoholContent: "",
      netContents: "",
    }
  );
  const [isDragging, setIsDragging] = useState(false);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
  const [testBenchSamples, setTestBenchSamples] = useState<TestBenchSample[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleChange = (field: keyof ApplicationData, value: string) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    onDataChange(newData);
  };

  // Load test bench samples on mount
  useEffect(() => {
    fetch('/samples/test-bench-samples.json')
      .then(r => r.json())
      .then(setTestBenchSamples)
      .catch(() => console.warn('Failed to load test bench samples'));
  }, []);

  // Click away handler for menu
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSampleMenu(false);
      }
    };

    if (showSampleMenu) {
      document.addEventListener('mousedown', handleClickAway);
      return () => document.removeEventListener('mousedown', handleClickAway);
    }
  }, [showSampleMenu]);

  const loadSample = () => {
    setData(SAMPLE_DATA);
    onDataChange(SAMPLE_DATA);
    setShowSampleMenu(false);
  };

  const loadTestBenchSample = async (sample: TestBenchSample) => {
    try {
      // Load the images
      const imageFiles: File[] = [];
      for (const img of sample.images) {
        const response = await fetch(img.url);
        const blob = await response.blob();
        const filename = img.url.split('/').pop() || 'image.png';
        imageFiles.push(new File([blob], filename, { type: 'image/png' }));
      }

      // Set the application data
      setData(sample.applicationData);
      onDataChange(sample.applicationData);

      // If onPackagesLoaded exists, create a pseudo-package
      if (onPackagesLoaded) {
        const cap = applicationDataToCAP(sample.applicationData, {
          ttbId: `SAMPLE-${sample.id}`,
          serialNumber: sample.id,
          applicantName: sample.applicationData.brandName
        });

        onPackagesLoaded({
          applications: [{
            cap,
            images: imageFiles,
            source: sample.name
          }],
          errors: [],
          layout: 'loose-drop'
        });
      }

      setShowSampleMenu(false);
    } catch (error: any) {
      alert(`Failed to load sample: ${error.message}`);
    }
  };

  const loadSampleDataset = async () => {
    try {
      const response = await fetch('/samples/cola-sample-small.zip');
      if (!response.ok) {
        throw new Error('Sample dataset not found. Run: npm run sample:generate');
      }

      const blob = await response.blob();
      const file = new File([blob], 'cola-sample-small.zip', { type: 'application/zip' });

      const result = await loadCAPPackages([file]);

      if (onPackagesLoaded) {
        onPackagesLoaded(result);
      }

      alert(`Loaded ${result.applications.length} applications from sample dataset`);
      setShowSampleMenu(false);
    } catch (error: any) {
      alert(`Failed to load sample dataset: ${error.message}`);
    }
  };

  const handleDownloadJSON = () => {
    if (
      !data.brandName ||
      !data.classType ||
      !data.alcoholContent ||
      !data.netContents
    ) {
      alert("Please fill in all required fields before downloading");
      return;
    }

    const cap = applicationDataToCAP(data, {
      ttbId: `TEST-${Date.now()}`,
      serialNumber: `TEST-${Math.floor(Math.random() * 10000)}`,
      applicantName: data.brandName,
    });

    downloadApplicationJSON(cap);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);

    // Check if this is a CAP package (ZIP or multiple files)
    const hasZip = files.some((f) => f.name.endsWith(".zip"));
    const hasJSON = files.some(
      (f) => f.name === "application.json" || f.name === "applications.json"
    );
    const hasImages = files.some((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.name));

    if (hasZip || (hasJSON && hasImages)) {
      // This is a CAP package - load it
      try {
        const result = await loadCAPPackages(files);

        // Check for duplicates
        if (result.applications.length > 1) {
          const dupes = detectDuplicates(result.applications);
          dupes.forEach((dupe) => {
            result.errors.push({ source: "validation", message: dupe.message });
          });
        }

        // Pass to parent (will add to queue)
        if (onPackagesLoaded) {
          onPackagesLoaded(result);
        }

        // Show summary
        if (result.applications.length > 0) {
          alert(
            `Loaded ${result.applications.length} application(s) from ${result.layout} package`
          );
        }
        if (result.errors.length > 0) {
          alert(
            `${result.errors.length} error(s):\n${result.errors
              .slice(0, 3)
              .map((e) => `• ${e.message}`)
              .join("\n")}`
          );
        }
      } catch (error: any) {
        alert(`Failed to load package: ${error.message}`);
      }
      return;
    }

    // Fall back to single application.json handling (existing code)
    const jsonFile = files.find((f) => f.name.endsWith(".json"));
    if (!jsonFile) {
      alert("Please drop an application.json file or CAP package (.zip)");
      return;
    }

    try {
      const text = await jsonFile.text();
      const cap = parseApplicationJSON(text);
      const appData = capToApplicationData(cap);

      setData(appData);
      onDataChange(appData);

      alert(
        `Loaded application: ${cap.label.brandName}${
          cap.ttbId ? ` (TTB ID: ${cap.ttbId})` : ""
        }`
      );
    } catch (error: any) {
      alert(`Error loading application.json: ${error.message}`);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`space-y-4 ${
        isDragging ? "ring-2 ring-blue-500 bg-blue-50 rounded-lg p-2" : ""
      }`}
    >
      {isDragging && (
        <div className="text-center py-2 text-blue-600 font-medium text-sm">
          Drop application.json, CAP package (.zip), or files to load
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Application Data</h2>
        <div className="flex gap-2 items-center relative">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowSampleMenu(!showSampleMenu)}
              className="text-sm text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
            >
              Load sample ▾
            </button>
            {showSampleMenu && (
              <div className="absolute right-0 mt-1 w-80 bg-white border-2 border-gray-300 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={loadSample}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  >
                    <div className="font-medium">Basic Sample</div>
                    <div className="text-xs text-gray-600">Single application (Old Tom Distillery)</div>
                  </button>

                  {testBenchSamples.length > 0 && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <div className="px-4 py-1 text-xs font-medium text-gray-500 uppercase">Test Cases</div>
                      {testBenchSamples.map(sample => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => loadTestBenchSample(sample)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          <div className="font-medium">{sample.name}</div>
                          <div className="text-xs text-gray-600">{sample.description}</div>
                        </button>
                      ))}
                    </>
                  )}

                  <div className="border-t border-gray-200 my-1"></div>
                  <button
                    type="button"
                    onClick={loadSampleDataset}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 bg-blue-50"
                  >
                    <div className="font-medium text-blue-700">📦 Load Sample Dataset (12 apps)</div>
                    <div className="text-xs text-gray-600">Batch test with multi-image applications</div>
                  </button>
                </div>
              </div>
            )}
          </div>
          <a
            href="/cap-template.json"
            download="application.json"
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Download template
          </a>
          <button
            type="button"
            onClick={handleDownloadJSON}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            title="Download as application.json"
          >
            ↓ JSON
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="brandName" className="block text-base font-medium mb-1">
            Brand Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="brandName"
            value={data.brandName}
            onChange={(e) => handleChange("brandName", e.target.value)}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Old Tom Distillery"
            required
          />
        </div>

        <div>
          <label htmlFor="classType" className="block text-base font-medium mb-1">
            Class/Type <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="classType"
            value={data.classType}
            onChange={(e) => handleChange("classType", e.target.value)}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Kentucky Straight Bourbon Whiskey"
            required
          />
        </div>

        <div>
          <label
            htmlFor="alcoholContent"
            className="block text-base font-medium mb-1"
          >
            Alcohol Content <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="alcoholContent"
            value={data.alcoholContent}
            onChange={(e) => handleChange("alcoholContent", e.target.value)}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="e.g., 45% Alc./Vol."
            required
          />
        </div>

        <div>
          <label
            htmlFor="netContents"
            className="block text-base font-medium mb-1"
          >
            Net Contents <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="netContents"
            value={data.netContents}
            onChange={(e) => handleChange("netContents", e.target.value)}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="e.g., 750 mL"
            required
          />
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Tip: Drop application.json, a CAP package (.zip), or multiple files to
          load data
        </p>
      </div>
    </div>
  );
}
