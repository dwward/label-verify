import JSZip from "jszip";
import { parseApplicationJSON, validateCAP } from "./cap-utils";
import type { LoadResult, CAPApplication } from "./types";

/**
 * Load CAP package(s) from dropped files
 * Handles all 4 layout types, validates, extracts images
 */
export async function loadCAPPackages(files: File[]): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "loose-drop", // Default, will be overridden
  };

  // Detect layout based on file types
  const hasZip = files.some((f) => f.name.endsWith(".zip"));
  const hasJSON = files.some(
    (f) => f.name === "application.json" || f.name === "applications.json"
  );
  const hasImages = files.some((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.name));

  if (hasZip && files.length === 1) {
    // Single ZIP file - could be package-zip or batch-zip
    return loadZipPackage(files[0]);
  } else if (hasJSON && hasImages && !hasZip) {
    // Loose drop - application.json + images
    result.layout = "loose-drop";
    return loadLoosePackage(files);
  } else {
    result.errors.push({
      source: "drop",
      message:
        "Unrecognized package format. Expected: .zip file, or application.json + images",
    });
    return result;
  }
}

/**
 * Load from a single ZIP file (detects package-zip vs batch-zip vs manifest-mode)
 */
async function loadZipPackage(zipFile: File): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "package-zip",
  };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch (error: any) {
    result.errors.push({
      source: zipFile.name,
      message: `Failed to unzip: ${error.message}`,
    });
    return result;
  }

  const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  // Detect layout
  const hasRootApplicationJSON = files.includes("application.json");
  const hasRootApplicationsJSON = files.includes("applications.json");
  const subfolderCount = new Set(
    files.filter((f) => f.includes("/")).map((f) => f.split("/")[0])
  ).size;

  if (hasRootApplicationJSON) {
    // Package-zip: single application.json at root + images
    result.layout = "package-zip";
    return loadPackageZip(zip, zipFile.name);
  } else if (hasRootApplicationsJSON) {
    // Manifest mode: applications.json (array) + images
    result.layout = "manifest-mode";
    return loadManifestZip(zip, zipFile.name);
  } else if (subfolderCount >= 1) {
    // Batch-zip: one or more subfolders, each a package
    result.layout = "batch-zip";
    return loadBatchZip(zip, zipFile.name);
  } else {
    result.errors.push({
      source: zipFile.name,
      message:
        "ZIP must contain application.json, applications.json, or at least one subfolder with application.json",
    });
    return result;
  }
}

/**
 * Load package-zip layout (single application.json + images)
 */
async function loadPackageZip(
  zip: JSZip,
  source: string
): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "package-zip",
  };

  try {
    // Parse application.json
    const jsonFile = zip.file("application.json");
    if (!jsonFile) {
      result.errors.push({
        source,
        message: "application.json not found in package",
      });
      return result;
    }

    const jsonText = await jsonFile.async("text");
    const cap = parseApplicationJSON(jsonText);

    // Extract referenced images
    const images: File[] = [];
    for (const imgRef of cap.images || []) {
      const imgFile = zip.file(imgRef.file);
      if (!imgFile) {
        result.errors.push({
          source,
          message: `${imgRef.file} listed in application.json but not found in package`,
        });
        continue;
      }

      const blob = await imgFile.async("blob");
      const file = new File([blob], imgRef.file, {
        type: `image/${getExtension(imgRef.file)}`,
      });
      images.push(file);
    }

    if (images.length === 0) {
      result.errors.push({ source, message: "No valid images found in package" });
      return result;
    }

    result.applications.push({ cap, images, source });
  } catch (error: any) {
    result.errors.push({ source, message: error.message });
  }

  return result;
}

/**
 * Load batch-zip layout (multiple subfolders, each a package)
 */
async function loadBatchZip(zip: JSZip, source: string): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "batch-zip",
  };

  // Group files by subfolder
  const subfolders = new Set<string>();
  Object.keys(zip.files).forEach((name) => {
    if (name.includes("/") && !zip.files[name].dir) {
      subfolders.add(name.split("/")[0]);
    }
  });

  // Load each subfolder as a package
  for (const folder of subfolders) {
    const jsonPath = `${folder}/application.json`;
    const jsonFile = zip.file(jsonPath);

    if (!jsonFile) {
      result.errors.push({
        source: `${source}/${folder}`,
        message: "Subfolder missing application.json",
      });
      continue;
    }

    try {
      const jsonText = await jsonFile.async("text");
      const cap = parseApplicationJSON(jsonText);

      // Extract images from this subfolder
      const images: File[] = [];
      for (const imgRef of cap.images || []) {
        const imgPath = `${folder}/${imgRef.file}`;
        const imgFile = zip.file(imgPath);

        if (!imgFile) {
          result.errors.push({
            source: `${source}/${folder}`,
            message: `${imgRef.file} not found in subfolder`,
          });
          continue;
        }

        const blob = await imgFile.async("blob");
        const file = new File([blob], imgRef.file, {
          type: `image/${getExtension(imgRef.file)}`,
        });
        images.push(file);
      }

      if (images.length > 0) {
        result.applications.push({
          cap,
          images,
          source: `${source}/${folder}`,
        });
      }
    } catch (error: any) {
      result.errors.push({
        source: `${source}/${folder}`,
        message: error.message,
      });
    }
  }

  return result;
}

/**
 * Load manifest-mode layout (applications.json array + images)
 */
async function loadManifestZip(
  zip: JSZip,
  source: string
): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "manifest-mode",
  };

  try {
    const manifestFile = zip.file("applications.json");
    if (!manifestFile) {
      result.errors.push({ source, message: "applications.json not found" });
      return result;
    }

    const manifestText = await manifestFile.async("text");
    const manifest = JSON.parse(manifestText);

    if (!Array.isArray(manifest)) {
      result.errors.push({
        source,
        message: "applications.json must be an array",
      });
      return result;
    }

    // Load each application in the manifest
    for (let i = 0; i < manifest.length; i++) {
      try {
        const cap = manifest[i] as CAPApplication;

        // Validate
        const errors = validateCAP(cap);
        if (errors.length > 0) {
          result.errors.push({
            source: `${source}[${i}]`,
            message: errors.map((e) => e.message).join("; "),
          });
          continue;
        }

        // Extract images
        const images: File[] = [];
        for (const imgRef of cap.images || []) {
          const imgFile = zip.file(imgRef.file);
          if (!imgFile) {
            result.errors.push({
              source: `${source}[${i}]`,
              message: `${imgRef.file} not found in ZIP`,
            });
            continue;
          }

          const blob = await imgFile.async("blob");
          const file = new File([blob], imgRef.file, {
            type: `image/${getExtension(imgRef.file)}`,
          });
          images.push(file);
        }

        if (images.length > 0) {
          result.applications.push({ cap, images, source: `${source}[${i}]` });
        }
      } catch (error: any) {
        result.errors.push({
          source: `${source}[${i}]`,
          message: error.message,
        });
      }
    }
  } catch (error: any) {
    result.errors.push({
      source,
      message: `Manifest parse error: ${error.message}`,
    });
  }

  return result;
}

/**
 * Load loose-drop layout (application.json + images as separate files)
 */
async function loadLoosePackage(files: File[]): Promise<LoadResult> {
  const result: LoadResult = {
    applications: [],
    errors: [],
    layout: "loose-drop",
  };

  const jsonFile = files.find((f) => f.name === "application.json");
  const imageFiles = files.filter((f) =>
    /\.(png|jpg|jpeg|webp)$/i.test(f.name)
  );

  if (!jsonFile) {
    result.errors.push({ source: "drop", message: "application.json not found" });
    return result;
  }

  try {
    const jsonText = await jsonFile.text();
    const cap = parseApplicationJSON(jsonText);

    // Match images from drop with references in JSON
    const images: File[] = [];
    for (const imgRef of cap.images || []) {
      const imgFile = imageFiles.find((f) => f.name === imgRef.file);
      if (!imgFile) {
        result.errors.push({
          source: "drop",
          message: `${imgRef.file} listed but not found in dropped files`,
        });
        continue;
      }
      images.push(imgFile);
    }

    if (images.length > 0) {
      result.applications.push({ cap, images, source: "drop" });
    } else {
      result.errors.push({ source: "drop", message: "No valid images found" });
    }
  } catch (error: any) {
    result.errors.push({ source: "drop", message: error.message });
  }

  return result;
}

/**
 * Detect duplicate TTB IDs / serial numbers across applications
 */
export function detectDuplicates(
  applications: Array<{ cap: CAPApplication }>
): Array<{ message: string; ids: string[] }> {
  const duplicates: Array<{ message: string; ids: string[] }> = [];

  // Check TTB IDs
  const ttbIds = new Map<string, string[]>();
  applications.forEach((app, idx) => {
    if (app.cap.ttbId) {
      if (!ttbIds.has(app.cap.ttbId)) {
        ttbIds.set(app.cap.ttbId, []);
      }
      ttbIds.get(app.cap.ttbId)!.push(`[${idx}]`);
    }
  });

  ttbIds.forEach((indices, id) => {
    if (indices.length > 1) {
      duplicates.push({
        message: `Duplicate TTB ID: ${id} appears in ${indices.join(", ")}`,
        ids: indices,
      });
    }
  });

  // Check serial numbers
  const serials = new Map<string, string[]>();
  applications.forEach((app, idx) => {
    if (app.cap.serialNumber) {
      if (!serials.has(app.cap.serialNumber)) {
        serials.set(app.cap.serialNumber, []);
      }
      serials.get(app.cap.serialNumber)!.push(`[${idx}]`);
    }
  });

  serials.forEach((indices, serial) => {
    if (indices.length > 1) {
      duplicates.push({
        message: `Duplicate serial number: ${serial} appears in ${indices.join(
          ", "
        )}`,
        ids: indices,
      });
    }
  });

  return duplicates;
}

// Helper to extract file extension for MIME type
function getExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "jpg" ? "jpeg" : ext || "png";
}
