"use client";

import { useState } from "react";
import type { ApplicationData } from "@/lib/types";

interface ApplicationFormProps {
  onDataChange: (data: ApplicationData) => void;
  initialData?: ApplicationData;
}

const SAMPLE_DATA: ApplicationData = {
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol.",
  netContents: "750 mL",
};

export default function ApplicationForm({
  onDataChange,
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

  const handleChange = (field: keyof ApplicationData, value: string) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    onDataChange(newData);
  };

  const loadSample = () => {
    setData(SAMPLE_DATA);
    onDataChange(SAMPLE_DATA);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Application Data</h2>
        <button
          type="button"
          onClick={loadSample}
          className="text-sm text-blue-600 hover:text-blue-700 underline"
        >
          Load sample
        </button>
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
      </div>
    </div>
  );
}
