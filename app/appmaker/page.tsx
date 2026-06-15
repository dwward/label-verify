"use client";

import { useState } from "react";
import AppNavigation from "@/components/AppNavigation";
import { applicationDataToCAP } from "@/lib/cap-utils";
import JSZip from "jszip";

interface AppMakerState {
  id: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  images: File[];
  showJSON: boolean;
}

export default function AppMakerPage() {
  const [applications, setApplications] = useState<AppMakerState[]>([
    {
      id: `app-${Date.now()}`,
      brandName: "",
      classType: "",
      alcoholContent: "",
      netContents: "",
      images: [],
      showJSON: false,
    },
  ]);

  const addApplication = () => {
    setApplications([
      ...applications,
      {
        id: `app-${Date.now()}`,
        brandName: "",
        classType: "",
        alcoholContent: "",
        netContents: "",
        images: [],
        showJSON: false,
      },
    ]);
  };

  const removeApplication = (id: string) => {
    setApplications(applications.filter((app) => app.id !== id));
  };

  const updateField = (
    id: string,
    field: keyof AppMakerState,
    value: any
  ) => {
    setApplications((apps) =>
      apps.map((app) => (app.id === id ? { ...app, [field]: value } : app))
    );
  };

  const generateJSON = (app: AppMakerState) => {
    try {
      const cap = applicationDataToCAP(
        {
          brandName: app.brandName,
          classType: app.classType,
          alcoholContent: app.alcoholContent,
          netContents: app.netContents,
        },
        {
          ttbId: `99${String(Date.now()).slice(-12)}`, // 14 digits: 99 + 12 from timestamp
          serialNumber: `99-${app.id.slice(-4)}`,
        }
      );

      // Build images array matching actual filenames
      const panelNames = ["front", "back", "neck", "side"];
      cap.images = app.images.map((img, idx) => {
        const ext = img.name.split(".").pop();
        return {
          file: `${panelNames[idx]}.${ext}`,
          panel: panelNames[idx] as "front" | "back" | "neck" | "other",
        };
      });

      return JSON.stringify(cap, null, 2);
    } catch (error) {
      return "{ }";
    }
  };

  const isAppComplete = (app: AppMakerState) => {
    return (
      app.brandName.trim() !== "" &&
      app.classType.trim() !== "" &&
      app.alcoholContent.trim() !== "" &&
      app.netContents.trim() !== ""
    );
  };

  const downloadZip = async () => {
    const zip = new JSZip();

    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];

      if (!isAppComplete(app)) continue;

      const folderName = `application-${String(i + 1).padStart(3, "0")}`;
      const folder = zip.folder(folderName)!;

      // Add application.json
      const cap = applicationDataToCAP(
        {
          brandName: app.brandName,
          classType: app.classType,
          alcoholContent: app.alcoholContent,
          netContents: app.netContents,
        },
        {
          ttbId: `${String(i + 1).padStart(14, "0")}`, // 14 digits all numeric
          serialNumber: `99-${String(i + 1).padStart(4, "0")}`,
        }
      );

      // Add images to folder and build images array
      const panelNames = ["front", "back", "neck", "side"];
      cap.images = [];
      for (let j = 0; j < app.images.length; j++) {
        const img = app.images[j];
        const ext = img.name.split(".").pop();
        const fileName = `${panelNames[j]}.${ext}`;
        folder.file(fileName, img);

        // Add to images array in JSON
        cap.images.push({
          file: fileName,
          panel: panelNames[j] as "front" | "back" | "neck" | "other",
        });
      }

      folder.file("application.json", JSON.stringify(cap, null, 2));
    }

    // Generate and download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-packages-${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completeCount = applications.filter(isAppComplete).length;
  const incompleteCount = applications.length - completeCount;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppNavigation />
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Application Maker
            </h1>
            <p className="text-base text-gray-600 mt-1">
              Create CAP packages for testing with real-life labels
            </p>
          </div>

          {/* Add Application Button */}
          <button
            onClick={addApplication}
            className="mb-6 px-4 py-2 text-base font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            + Add Application
          </button>

          {/* Applications */}
          <div className="space-y-6">
            {applications.map((app, idx) => (
              <div
                key={app.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Application {idx + 1}
                    {isAppComplete(app) ? (
                      <span className="ml-2 text-sm font-normal text-green-600">
                        ✓ Complete
                      </span>
                    ) : (
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        Incomplete
                      </span>
                    )}
                  </h2>
                  {applications.length > 1 && (
                    <button
                      onClick={() => removeApplication(app.id)}
                      className="px-3 py-1 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Two-column layout */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Form */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Brand Name *
                      </label>
                      <input
                        type="text"
                        value={app.brandName}
                        onChange={(e) =>
                          updateField(app.id, "brandName", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Stone's Throw Bourbon"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Class/Type *
                      </label>
                      <input
                        type="text"
                        value={app.classType}
                        onChange={(e) =>
                          updateField(app.id, "classType", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Bourbon Whiskey"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Alcohol Content *
                      </label>
                      <input
                        type="text"
                        value={app.alcoholContent}
                        onChange={(e) =>
                          updateField(app.id, "alcoholContent", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="45% Alc./Vol."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Net Contents *
                      </label>
                      <input
                        type="text"
                        value={app.netContents}
                        onChange={(e) =>
                          updateField(app.id, "netContents", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="750 mL"
                      />
                    </div>
                  </div>

                  {/* Right: Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Images (0-4)
                    </label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []).slice(
                          0,
                          4 - app.images.length
                        );
                        updateField(app.id, "images", [
                          ...app.images,
                          ...files,
                        ]);
                      }}
                      disabled={app.images.length >= 4}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />

                    {/* Image Previews */}
                    {app.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {app.images.map((img, imgIdx) => (
                          <div key={imgIdx} className="relative">
                            <img
                              src={URL.createObjectURL(img)}
                              alt={`Image ${imgIdx + 1}`}
                              className="w-full h-24 object-cover rounded border border-gray-300"
                            />
                            <button
                              onClick={() =>
                                updateField(
                                  app.id,
                                  "images",
                                  app.images.filter((_, i) => i !== imgIdx)
                                )
                              }
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700"
                            >
                              ×
                            </button>
                            <span className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white text-xs px-2 py-0.5 rounded">
                              {["Front", "Back", "Neck", "Side"][imgIdx]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-sm text-gray-500 mt-2">
                      {app.images.length}/4 images uploaded
                    </p>
                  </div>
                </div>

                {/* JSON Preview */}
                <div className="mt-4">
                  <button
                    onClick={() =>
                      updateField(app.id, "showJSON", !app.showJSON)
                    }
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    {app.showJSON ? "▼" : "▶"} JSON Preview
                  </button>
                  {app.showJSON && (
                    <pre className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto">
                      {generateJSON(app)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Download Button */}
          <div className="sticky bottom-0 mt-8 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">
                  {completeCount}
                </span>{" "}
                ready
                {incompleteCount > 0 && (
                  <>
                    ,{" "}
                    <span className="font-medium text-gray-900">
                      {incompleteCount}
                    </span>{" "}
                    incomplete
                  </>
                )}
              </div>
              <button
                onClick={downloadZip}
                disabled={completeCount === 0}
                className="px-6 py-3 text-base font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download All as ZIP ({completeCount})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
