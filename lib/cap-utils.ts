import Ajv from "ajv";
import capSchema from "./cap-schema.json";
import type { ApplicationData, CAPApplication, ValidationError } from "./types";

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(capSchema);

/**
 * Convert ApplicationData to CAP format for export
 */
export function applicationDataToCAP(
  data: ApplicationData,
  options?: {
    ttbId?: string;
    serialNumber?: string;
    applicantName?: string;
  }
): CAPApplication {
  return {
    schemaVersion: "1.0",
    ttbId: options?.ttbId,
    serialNumber: options?.serialNumber,
    productType: "DISTILLED_SPIRITS",
    source: "DOMESTIC",
    applicant: {
      name: options?.applicantName || "Test Application",
      permitNumber: undefined,
      address: undefined,
    },
    label: {
      brandName: data.brandName,
      fancifulName: null,
      classType: data.classType,
      alcoholContent: data.alcoholContent,
      netContents: data.netContents,
      bottlerNameAddress: null,
      countryOfOrigin: null,
    },
    images: [{ file: "label.png", panel: "front" }],
  };
}

/**
 * Validate CAP object against JSON Schema
 * Returns array of validation errors (empty if valid)
 */
export function validateCAP(cap: unknown): ValidationError[] {
  const valid = validateSchema(cap);

  if (valid) return [];

  // Transform AJV errors to plain-English messages
  return (validateSchema.errors || []).map((err) => {
    const field = err.instancePath || "root";
    let message = "";

    switch (err.keyword) {
      case "required":
        message = `${err.params.missingProperty} is required`;
        break;
      case "enum":
        message = `Must be one of: ${err.params.allowedValues.join(", ")}`;
        break;
      case "type":
        message = `Expected ${err.params.type}, got ${typeof err.data}`;
        break;
      case "minLength":
        message = `Must not be empty`;
        break;
      case "pattern":
        message = `Invalid format (expected pattern: ${err.params.pattern})`;
        break;
      case "const":
        message = `Must be "${err.params.allowedValue}"`;
        break;
      default:
        message = err.message || "Invalid value";
    }

    return {
      field: field.replace(/^\//, "").replace(/\//g, "."),
      message,
      value: err.data,
    };
  });
}

/**
 * Convert CAP format to ApplicationData (extract verifiable fields)
 */
export function capToApplicationData(cap: CAPApplication): ApplicationData {
  return {
    brandName: cap.label.brandName,
    classType: cap.label.classType,
    alcoholContent: cap.label.alcoholContent,
    netContents: cap.label.netContents,
    bottlerName: cap.label.bottlerNameAddress || undefined,
    countryOfOrigin: cap.label.countryOfOrigin || undefined,
  };
}

/**
 * Parse application.json from file content (with schema validation)
 */
export function parseApplicationJSON(jsonText: string): CAPApplication {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error: any) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  // Validate against schema
  const errors = validateCAP(parsed);
  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `${e.field}: ${e.message}`)
      .join("; ");
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  return parsed as CAPApplication;
}

/**
 * Trigger browser download of application.json
 */
export function downloadApplicationJSON(
  cap: CAPApplication,
  filename = "application.json"
): void {
  const json = JSON.stringify(cap, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
